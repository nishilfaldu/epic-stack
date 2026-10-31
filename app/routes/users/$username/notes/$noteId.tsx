import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Img } from 'openimg/react'
import { useRef, useEffect } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { floatingToolbarClassName } from '#app/components/floating-toolbar.tsx'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { getNoteImgSrc, useIsPending } from '#app/utils/misc.tsx'
import {
	deleteNote,
	grantOrUpdateShare,
	loadNotePage,
	revokeShare,
} from '#app/utils/note-access.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$noteId.ts'
import { type Route as NotesRoute } from './+types/_layout.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	return loadNotePage(request, {
		ownerUsername: params.username,
		noteId: params.noteId,
	})
}

const NoteActionSchema = z.discriminatedUnion('intent', [
	z.object({
		intent: z.literal('delete-note'),
		noteId: z.string(),
	}),
	z.object({
		intent: z.literal('share'),
		recipientUsername: z.string().min(1, 'Username is required'),
		role: z.enum(['viewer', 'editor']),
	}),
	z.object({
		intent: z.literal('revoke'),
		recipientUsername: z.string().min(1, 'Username is required'),
	}),
])

const ShareFormSchema = z.object({
	recipientUsername: z.string().min(1, 'Username is required'),
	role: z.enum(['viewer', 'editor']),
})

export async function action({ request, params }: Route.ActionArgs) {
	await requireUserId(request)
	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: NoteActionSchema,
	})
	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	switch (submission.value.intent) {
		case 'delete-note': {
			const ownerUsername = await deleteNote(request, {
				ownerUsername: params.username,
				noteId: submission.value.noteId,
			})
			return redirectWithToast(`/users/${ownerUsername}/notes`, {
				type: 'success',
				title: 'Success',
				description: 'Your note has been deleted.',
			})
		}
		case 'share': {
			const result = await grantOrUpdateShare(request, {
				ownerUsername: params.username,
				noteId: params.noteId,
				recipientUsername: submission.value.recipientUsername,
				role: submission.value.role,
			})
			if (!result.ok) {
				return data(
					{
						result: submission.reply({
							fieldErrors: {
								recipientUsername: [shareErrorText(result.error)],
							},
						}),
					},
					{ status: 400 },
				)
			}
			return redirect(`/users/${params.username}/notes/${params.noteId}`)
		}
		case 'revoke': {
			const result = await revokeShare(request, {
				ownerUsername: params.username,
				noteId: params.noteId,
				recipientUsername: submission.value.recipientUsername,
			})
			if (!result.ok) {
				return data(
					{
						result: submission.reply({
							fieldErrors: {
								recipientUsername: [shareErrorText(result.error)],
							},
						}),
					},
					{ status: 400 },
				)
			}
			return redirect(`/users/${params.username}/notes/${params.noteId}`)
		}
		default: {
			const unexpected: never = submission.value
			throw new Error(`Unexpected note action ${String(unexpected)}`)
		}
	}
}

function shareErrorText(error: 'unknown-user' | 'self') {
	switch (error) {
		case 'unknown-user':
			return 'No user with that username exists'
		case 'self':
			return 'You cannot share a note with yourself'
		default: {
			const unexpected: never = error
			throw new Error(`Unexpected share error ${String(unexpected)}`)
		}
	}
}

export default function NoteRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { chrome } = loaderData
	const displayBar = chrome.showDelete || chrome.showEdit

	// Add ref for auto-focusing
	const sectionRef = useRef<HTMLElement>(null)

	// Focus the section when the note ID changes
	useEffect(() => {
		if (sectionRef.current) {
			sectionRef.current.focus()
		}
	}, [loaderData.note.id])

	return (
		<section
			ref={sectionRef}
			className="absolute inset-0 flex flex-col px-10"
			aria-labelledby="note-title"
			tabIndex={-1} // Make the section focusable without keyboard navigation
		>
			<h2 id="note-title" className="text-h2 mb-2 pt-12 lg:mb-6">
				{loaderData.note.title}
			</h2>
			<div className={`${displayBar ? 'pb-24' : 'pb-12'} overflow-y-auto`}>
				<ul className="flex flex-wrap gap-5 py-5">
					{loaderData.note.images.map((image) => (
						<li key={image.id}>
							<a href={getNoteImgSrc(image.objectKey)}>
								<Img
									src={getNoteImgSrc(image.objectKey)}
									alt={image.altText ?? ''}
									className="size-32 rounded-lg object-cover"
									width={512}
									height={512}
								/>
							</a>
						</li>
					))}
				</ul>
				<p className="text-sm whitespace-break-spaces md:text-lg">
					{loaderData.note.content}
				</p>
				{chrome.showShare ? (
					<ShareNote actionData={actionData} shares={loaderData.shares} />
				) : null}
			</div>
			{displayBar ? (
				<div className={floatingToolbarClassName}>
					<span className="text-foreground/90 text-sm max-[524px]:hidden">
						<Icon name="clock" className="scale-125">
							{loaderData.timeAgo} ago
						</Icon>
					</span>
					<div className="grid flex-1 grid-cols-2 justify-end gap-2 min-[525px]:flex md:gap-4">
						{chrome.showDelete ? (
							<DeleteNote id={loaderData.note.id} actionData={actionData} />
						) : null}
						{chrome.showEdit ? (
							<Button
								asChild
								className="min-[525px]:max-md:aspect-square min-[525px]:max-md:px-0"
							>
								<Link to="edit">
									<Icon name="pencil-1" className="scale-125 max-md:scale-150">
										<span className="max-md:hidden">Edit</span>
									</Icon>
								</Link>
							</Button>
						) : null}
					</div>
				</div>
			) : null}
		</section>
	)
}

function ShareNote({
	actionData,
	shares,
}: {
	actionData: Route.ComponentProps['actionData']
	shares: Route.ComponentProps['loaderData']['shares']
}) {
	const isPending = useIsPending()
	const [form, fields] = useForm({
		id: 'share-note',
		constraint: getZodConstraint(ShareFormSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ShareFormSchema })
		},
		defaultValue: { role: 'viewer' },
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="mt-8 flex flex-col gap-4">
			<Form method="POST" {...getFormProps(form)}>
				<Field
					labelProps={{ children: 'Username' }}
					inputProps={{
						...getInputProps(fields.recipientUsername, { type: 'text' }),
					}}
					errors={fields.recipientUsername.errors}
				/>
				<fieldset className="flex gap-4">
					<legend className="sr-only">Role</legend>
					<label>
						<input
							{...getInputProps(fields.role, {
								type: 'radio',
								value: 'viewer',
							})}
						/>{' '}
						Viewer
					</label>
					<label>
						<input
							{...getInputProps(fields.role, {
								type: 'radio',
								value: 'editor',
							})}
						/>{' '}
						Editor
					</label>
				</fieldset>
				<ErrorList errors={fields.role.errors} id={fields.role.errorId} />
				<StatusButton
					type="submit"
					name="intent"
					value="share"
					status={isPending ? 'pending' : (form.status ?? 'idle')}
					disabled={isPending}
				>
					Share
				</StatusButton>
			</Form>
			<ul className="flex flex-col gap-2">
				{shares.map((share) => (
					<li key={share.recipientUsername}>
						<Form method="POST" className="flex items-center gap-3">
							<input
								type="hidden"
								name="recipientUsername"
								value={share.recipientUsername}
							/>
							<span>{share.recipientUsername}</span>
							<span>{share.role}</span>
							<StatusButton
								type="submit"
								name="intent"
								value="revoke"
								variant="destructive"
								status="idle"
								aria-label={`Revoke ${share.recipientUsername}`}
							>
								Revoke
							</StatusButton>
						</Form>
					</li>
				))}
			</ul>
		</div>
	)
}

export function DeleteNote({
	id,
	actionData,
}: {
	id: string
	actionData: Route.ComponentProps['actionData'] | undefined
}) {
	const isPending = useIsPending()
	const [form] = useForm({
		id: 'delete-note',
		lastResult: actionData?.result,
	})

	return (
		<Form method="POST" {...getFormProps(form)}>
			<input type="hidden" name="noteId" value={id} />
			<StatusButton
				type="submit"
				name="intent"
				value="delete-note"
				variant="destructive"
				status={isPending ? 'pending' : (form.status ?? 'idle')}
				disabled={isPending}
				className="w-full max-md:aspect-square max-md:px-0"
			>
				<Icon name="trash" className="scale-125 max-md:scale-150">
					<span className="max-md:hidden">Delete</span>
				</Icon>
			</StatusButton>
			<ErrorList errors={form.errors} id={form.errorId} />
		</Form>
	)
}

export const meta: Route.MetaFunction = ({ data, params, matches }) => {
	const notesMatch = matches.find(
		(m) => m?.id === 'routes/users/$username/notes',
	) as { data: NotesRoute.ComponentProps['loaderData'] } | undefined

	const displayName = notesMatch?.data?.owner.name ?? params.username
	const noteTitle = data?.note.title ?? 'Note'
	const noteContentsSummary =
		data && data.note.content.length > 100
			? data?.note.content.slice(0, 97) + '...'
			: 'No content'
	return [
		{ title: `${noteTitle} | ${displayName}'s Notes | Epic Notes` },
		{
			name: 'description',
			content: noteContentsSummary,
		},
	]
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: () => <p>You are not allowed to do that</p>,
				404: ({ params }) => (
					<p>No note with the id "{params.noteId}" exists</p>
				),
			}}
		/>
	)
}
