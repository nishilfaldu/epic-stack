import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './$noteId.tsx'
import { type Route } from './+types/$noteId.ts'

async function insertUser(roles: Array<'user' | 'admin'>) {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true, username: true },
		data: {
			...userData,
			roles: { connect: roles.map((name) => ({ name })) },
		},
	})
}

async function insertNote(ownerId: string) {
	return prisma.note.create({
		select: { id: true },
		data: {
			title: 'private note',
			content: 'keep this',
			ownerId,
		},
	})
}

async function cookieFor(userId: string) {
	const session = await prisma.session.create({
		select: { id: true },
		data: { expirationDate: getSessionExpirationDate(), userId },
	})
	return getSessionCookieHeader(session)
}

async function submitDelete(username: string, noteId: string, cookie: string) {
	const url = new URL(`/users/${username}/notes/${noteId}`, BASE_URL)
	return action({
		request: new Request(url, {
			method: 'POST',
			headers: { cookie },
			body: new URLSearchParams({ intent: 'delete-note', noteId }),
		}),
		params: { username, noteId },
		context: {} as AppLoadContext,
		url,
		pattern: '/users/:username/notes/:noteId',
	} satisfies Route.ActionArgs).catch((error: unknown) => error)
}

function statusOf(result: unknown) {
	if (result instanceof Response) return result.status
	if (!result || typeof result !== 'object' || !('init' in result)) return
	const { init } = result
	if (!init || typeof init !== 'object' || !('status' in init)) return
	return typeof init.status === 'number' ? init.status : undefined
}

async function noteExists(noteId: string) {
	const note = await prisma.note.findUnique({
		select: { id: true },
		where: { id: noteId },
	})
	return note !== null
}

test('a regular user cannot delete a note they do not own', async () => {
	const owner = await insertUser(['user'])
	const attacker = await insertUser(['user'])
	const note = await insertNote(owner.id)

	const result = await submitDelete(
		owner.username,
		note.id,
		await cookieFor(attacker.id),
	)

	expect.soft(statusOf(result)).toBe(403)
	expect(await noteExists(note.id)).toBe(true)
})

test('the owner can delete their own note', async () => {
	const owner = await insertUser(['user'])
	const note = await insertNote(owner.id)

	const result = await submitDelete(
		owner.username,
		note.id,
		await cookieFor(owner.id),
	)

	expect(statusOf(result)).toBe(302)
	expect(result).toHaveRedirect(`/users/${owner.username}/notes`)
	expect(await noteExists(note.id)).toBe(false)
})

test('an admin can delete another user note', async () => {
	const owner = await insertUser(['user'])
	const admin = await insertUser(['admin'])
	const note = await insertNote(owner.id)

	const result = await submitDelete(
		owner.username,
		note.id,
		await cookieFor(admin.id),
	)

	expect(statusOf(result)).toBe(302)
	expect(result).toHaveRedirect(`/users/${owner.username}/notes`)
	expect(await noteExists(note.id)).toBe(false)
})
