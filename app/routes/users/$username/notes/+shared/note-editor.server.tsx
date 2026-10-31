import { parseWithZod } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import { parseFormData } from '@mjackson/form-data-parser'
import { createId as cuid } from '@paralleldrive/cuid2'
import { data, redirect, type ActionFunctionArgs } from 'react-router'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireNoteUpdate } from '#app/utils/note-access.server.ts'
import { uploadNoteImage } from '#app/utils/storage.server.ts'
import {
	MAX_UPLOAD_SIZE,
	NoteEditorSchema,
	type ImageFieldset,
} from './note-editor'

function imageHasFile(
	image: ImageFieldset,
): image is ImageFieldset & { file: NonNullable<ImageFieldset['file']> } {
	return Boolean(image.file?.size && image.file?.size > 0)
}

function imageHasId(
	image: ImageFieldset,
): image is ImageFieldset & { id: string } {
	return Boolean(image.id)
}

export async function action({ request, params }: ActionFunctionArgs) {
	const userId = await requireUserId(request)

	const formData = await parseFormData(request, {
		maxFileSize: MAX_UPLOAD_SIZE,
	})
	const noteIdField = formData.get('id')
	if (typeof noteIdField === 'string' && noteIdField !== '') {
		invariantResponse(params.username, 'Not found', { status: 404 })
		await requireNoteUpdate(request, {
			ownerUsername: params.username,
			noteId: noteIdField,
		})
	}

	const submission = await parseWithZod(formData, {
		schema: NoteEditorSchema.transform(async ({ images = [], ...data }) => {
			const noteId = data.id ?? cuid()
			return {
				...data,
				id: noteId,
				imageUpdates: await Promise.all(
					images.filter(imageHasId).map(async (i) => {
						if (imageHasFile(i)) {
							return {
								id: i.id,
								altText: i.altText,
								objectKey: await uploadNoteImage(userId, noteId, i.file),
							}
						} else {
							return {
								id: i.id,
								altText: i.altText,
							}
						}
					}),
				),
				newImages: await Promise.all(
					images
						.filter(imageHasFile)
						.filter((i) => !i.id)
						.map(async (image) => {
							return {
								altText: image.altText,
								objectKey: await uploadNoteImage(userId, noteId, image.file),
							}
						}),
				),
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const {
		id: noteId,
		title,
		content,
		imageUpdates = [],
		newImages = [],
	} = submission.value

	const updatedNote = await prisma.note.upsert({
		select: { id: true, owner: { select: { username: true } } },
		where: { id: noteId },
		create: {
			id: noteId,
			ownerId: userId,
			title,
			content,
			images: { create: newImages },
		},
		update: {
			title,
			content,
			images: {
				deleteMany: { id: { notIn: imageUpdates.map((i) => i.id) } },
				updateMany: imageUpdates.map((updates) => ({
					where: { id: updates.id },
					data: {
						...updates,
						// If the image is new, we need to generate a new ID to bust the cache.
						id: updates.objectKey ? cuid() : updates.id,
					},
				})),
				create: newImages,
			},
		},
	})

	return redirect(
		`/users/${updatedNote.owner.username}/notes/${updatedNote.id}`,
	)
}
