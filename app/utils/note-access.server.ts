import { invariantResponse } from '@epic-web/invariant'
import { type NoteShareRole } from '@prisma/client'
import { formatDistanceToNow } from 'date-fns'
import { data } from 'react-router'
import { getUserId } from './auth.server.ts'
import { prisma } from './db.server.ts'
import { requireUserWithPermission } from './permissions.server.ts'
import { userHasPermission, type PermissionString } from './user.ts'

type Relation = 'anonymous' | 'owner' | 'viewer' | 'editor' | 'stranger'
type NoteAction = 'read' | 'edit' | 'share' | 'delete'
type Access = 'allow' | 'forbidden' | 'not-found'

type DeleteFlags = {
	own: boolean
	any: boolean
}

const noteImages = {
	select: {
		id: true,
		altText: true,
		objectKey: true,
	},
} as const

export async function loadNotesSidebar(
	request: Request,
	profileUsername: string,
) {
	const userId = await getUserId(request)
	const owner = await prisma.user.findFirst({
		select: {
			id: true,
			name: true,
			username: true,
			image: { select: { objectKey: true } },
		},
		where: { username: profileUsername },
	})
	invariantResponse(owner, 'Owner not found', { status: 404 })

	const isOwnProfile = userId === owner.id
	const notes = isOwnProfile
		? await prisma.note.findMany({
				select: { id: true, title: true },
				where: { ownerId: owner.id },
			})
		: userId
			? await prisma.note.findMany({
					select: { id: true, title: true },
					where: {
						ownerId: owner.id,
						shares: { some: { recipientId: userId } },
					},
				})
			: []

	const sharedNotes = isOwnProfile
		? await prisma.noteShare.findMany({
				select: {
					note: {
						select: {
							id: true,
							title: true,
							owner: { select: { username: true } },
						},
					},
				},
				where: { recipientId: userId },
			})
		: []

	return {
		owner: { ...owner, notes },
		sharedNotes: sharedNotes.map((share) => ({
			id: share.note.id,
			title: share.note.title,
			ownerUsername: share.note.owner.username,
		})),
	}
}

export async function loadNotePage(
	request: Request,
	{ ownerUsername, noteId }: { ownerUsername: string; noteId: string },
) {
	const loaded = await loadNote(request, ownerUsername, noteId)
	enforce(decide(loaded.relation, 'read', loaded.flags))

	const shares =
		loaded.relation === 'owner'
			? await prisma.noteShare.findMany({
					select: {
						role: true,
						recipient: { select: { username: true } },
					},
					where: { noteId: loaded.note.id },
					orderBy: { createdAt: 'asc' },
				})
			: []

	return {
		note: {
			id: loaded.note.id,
			title: loaded.note.title,
			content: loaded.note.content,
			ownerId: loaded.note.ownerId,
			images: loaded.note.images,
		},
		timeAgo: formatDistanceToNow(loaded.note.updatedAt),
		chrome: {
			showEdit: decide(loaded.relation, 'edit', loaded.flags) === 'allow',
			showDelete: decide(loaded.relation, 'delete', loaded.flags) === 'allow',
			showShare: decide(loaded.relation, 'share', loaded.flags) === 'allow',
		},
		shares: shares.map((share) => ({
			recipientUsername: share.recipient.username,
			role: share.role,
		})),
	}
}

export async function requireNoteUpdate(
	request: Request,
	{ ownerUsername, noteId }: { ownerUsername: string; noteId: string },
) {
	const loaded = await loadNote(request, ownerUsername, noteId)
	enforce(decide(loaded.relation, 'edit', loaded.flags))
	return {
		id: loaded.note.id,
		title: loaded.note.title,
		content: loaded.note.content,
		images: loaded.note.images,
	}
}

export async function deleteNote(
	request: Request,
	{ ownerUsername, noteId }: { ownerUsername: string; noteId: string },
) {
	const loaded = await loadNote(request, ownerUsername, noteId)
	const access = decide(loaded.relation, 'delete', loaded.flags)
	switch (access) {
		case 'allow':
		case 'forbidden': {
			await requireUserWithPermission(
				request,
				deletePermission(loaded.relation),
			)
			if (access === 'forbidden') {
				throw forbidden()
			}
			break
		}
		case 'not-found':
			throw notFound()
		default: {
			const unexpected: never = access
			throw new Error(`Unexpected access ${String(unexpected)}`)
		}
	}

	await prisma.note.delete({ where: { id: loaded.note.id } })
	return ownerUsername
}

export async function grantOrUpdateShare(
	request: Request,
	{
		ownerUsername,
		noteId,
		recipientUsername,
		role,
	}: {
		ownerUsername: string
		noteId: string
		recipientUsername: string
		role: NoteShareRole
	},
) {
	const loaded = await loadNote(request, ownerUsername, noteId)
	enforce(decide(loaded.relation, 'share', loaded.flags))
	const recipient = await findRecipient(loaded.userId, recipientUsername)
	if (!recipient.ok) return recipient
	await prisma.noteShare.upsert({
		where: {
			noteId_recipientId: {
				noteId: loaded.note.id,
				recipientId: recipient.user.id,
			},
		},
		create: {
			noteId: loaded.note.id,
			recipientId: recipient.user.id,
			role,
		},
		update: { role },
	})
	return { ok: true as const }
}

export async function revokeShare(
	request: Request,
	{
		ownerUsername,
		noteId,
		recipientUsername,
	}: {
		ownerUsername: string
		noteId: string
		recipientUsername: string
	},
) {
	const loaded = await loadNote(request, ownerUsername, noteId)
	enforce(decide(loaded.relation, 'share', loaded.flags))
	const recipient = await findRecipient(loaded.userId, recipientUsername)
	if (!recipient.ok) return recipient
	await prisma.noteShare.deleteMany({
		where: { noteId: loaded.note.id, recipientId: recipient.user.id },
	})
	return { ok: true as const }
}

async function findRecipient(actorId: string | null, username: string) {
	const user = await prisma.user.findUnique({
		select: { id: true },
		where: { username },
	})
	if (!user) return { ok: false as const, error: 'unknown-user' as const }
	if (user.id === actorId) return { ok: false as const, error: 'self' as const }
	return { ok: true as const, user }
}

async function loadNote(
	request: Request,
	ownerUsername: string,
	noteId: string,
) {
	const userId = await getUserId(request)
	const note = await prisma.note.findFirst({
		select: {
			id: true,
			title: true,
			content: true,
			ownerId: true,
			updatedAt: true,
			owner: { select: { username: true } },
			images: noteImages,
			shares: {
				where: { recipientId: userId ?? '' },
				select: { role: true },
			},
		},
		where: { id: noteId },
	})
	invariantResponse(note, 'Not found', { status: 404 })
	invariantResponse(note.owner.username === ownerUsername, 'Not found', {
		status: 404,
	})
	const actor = userId
		? await prisma.user.findUnique({
				select: {
					roles: {
						select: {
							name: true,
							permissions: {
								select: { entity: true, action: true, access: true },
							},
						},
					},
				},
				where: { id: userId },
			})
		: null
	return {
		userId,
		note,
		relation: relationFor(userId, note),
		flags: {
			own: userHasPermission(actor, 'delete:note:own'),
			any: userHasPermission(actor, 'delete:note:any'),
		},
	}
}

function relationFor(
	userId: string | null,
	note: { ownerId: string; shares: Array<{ role: NoteShareRole }> },
): Relation {
	if (!userId) return 'anonymous'
	if (userId === note.ownerId) return 'owner'
	const role = note.shares[0]?.role
	if (!role) return 'stranger'
	switch (role) {
		case 'viewer':
		case 'editor':
			return role
		default: {
			const unexpected: never = role
			throw new Error(`Unexpected share role ${String(unexpected)}`)
		}
	}
}

function decide(
	relation: Relation,
	action: NoteAction,
	flags: DeleteFlags,
): Access {
	switch (action) {
		case 'read':
			return readAccess(relation)
		case 'edit':
			return editAccess(relation)
		case 'share':
			return shareAccess(relation)
		case 'delete':
			return deleteAccess(relation, flags)
		default: {
			const unexpected: never = action
			throw new Error(`Unexpected action ${String(unexpected)}`)
		}
	}
}

function readAccess(relation: Relation): Access {
	switch (relation) {
		case 'owner':
		case 'viewer':
		case 'editor':
			return 'allow'
		case 'anonymous':
		case 'stranger':
			return 'not-found'
		default: {
			const unexpected: never = relation
			throw new Error(`Unexpected relation ${String(unexpected)}`)
		}
	}
}

function editAccess(relation: Relation): Access {
	switch (relation) {
		case 'owner':
		case 'editor':
			return 'allow'
		case 'viewer':
			return 'forbidden'
		case 'anonymous':
		case 'stranger':
			return 'not-found'
		default: {
			const unexpected: never = relation
			throw new Error(`Unexpected relation ${String(unexpected)}`)
		}
	}
}

function shareAccess(relation: Relation): Access {
	switch (relation) {
		case 'owner':
			return 'allow'
		case 'viewer':
		case 'editor':
			return 'forbidden'
		case 'anonymous':
		case 'stranger':
			return 'not-found'
		default: {
			const unexpected: never = relation
			throw new Error(`Unexpected relation ${String(unexpected)}`)
		}
	}
}

function deleteAccess(relation: Relation, flags: DeleteFlags): Access {
	switch (relation) {
		case 'owner':
			return flags.own ? 'allow' : 'forbidden'
		case 'viewer':
		case 'editor':
			return flags.any ? 'allow' : 'forbidden'
		case 'stranger':
			return flags.any ? 'allow' : 'not-found'
		case 'anonymous':
			return 'not-found'
		default: {
			const unexpected: never = relation
			throw new Error(`Unexpected relation ${String(unexpected)}`)
		}
	}
}

function deletePermission(relation: Relation): PermissionString {
	switch (relation) {
		case 'owner':
			return 'delete:note:own'
		case 'viewer':
		case 'editor':
		case 'stranger':
		case 'anonymous':
			return 'delete:note:any'
		default: {
			const unexpected: never = relation
			throw new Error(`Unexpected relation ${String(unexpected)}`)
		}
	}
}

function enforce(access: Access) {
	switch (access) {
		case 'allow':
			return
		case 'forbidden':
			throw forbidden()
		case 'not-found':
			throw notFound()
		default: {
			const unexpected: never = access
			throw new Error(`Unexpected access ${String(unexpected)}`)
		}
	}
}

function forbidden() {
	return data(
		{ error: 'Unauthorized', message: 'You are not allowed to do that' },
		{ status: 403 },
	)
}

function notFound() {
	return data({ error: 'Not found' }, { status: 404 })
}
