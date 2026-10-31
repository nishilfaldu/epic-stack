import { type PrismaClient } from '@prisma/client'

const pageSize = 100

export type NoteLink = { id: string; title: string }

export type SidebarOwner = {
	id: string
	name: string | null
	username: string
	image: { objectKey: string } | null
}

export type SidebarPager =
	| { newerTo: string; olderTo: string }
	| { newerTo: string; olderTo: null }
	| { newerTo: null; olderTo: string }

type SidebarBase = {
	owner: SidebarOwner
	noteCount: number
	links: readonly NoteLink[]
}

export type NoteSidebar =
	| (SidebarBase & { kind: 'all' })
	| (SidebarBase & { kind: 'page'; pager: SidebarPager })

export type SidebarLoad =
	| { ok: true; sidebar: NoteSidebar }
	| { ok: false; status: 404; message: string }

export async function loadNoteSidebar(
	db: PrismaClient,
	input: { username: string; url: URL },
): Promise<SidebarLoad> {
	const owner = await db.user.findFirst({
		select: {
			id: true,
			name: true,
			username: true,
			image: { select: { objectKey: true } },
			_count: { select: { notes: true } },
		},
		where: { username: input.username },
	})
	if (!owner) {
		return { ok: false, status: 404, message: 'Owner not found' }
	}

	const sidebarOwner: SidebarOwner = {
		id: owner.id,
		name: owner.name,
		username: owner.username,
		image: owner.image,
	}
	const noteCount = owner._count.notes
	if (noteCount === 0) {
		return {
			ok: true,
			sidebar: { kind: 'all', owner: sidebarOwner, noteCount, links: [] },
		}
	}
	if (noteCount <= pageSize) {
		const links = await listNotes(db, owner.id, 0, noteCount)
		return {
			ok: true,
			sidebar: { kind: 'all', owner: sidebarOwner, noteCount, links },
		}
	}

	const start = await resolveStart(db, owner.id, noteCount, input.url)
	const links = await listNotes(db, owner.id, start, pageSize)
	if (links.length === noteCount) {
		return {
			ok: true,
			sidebar: { kind: 'all', owner: sidebarOwner, noteCount, links },
		}
	}
	return {
		ok: true,
		sidebar: {
			kind: 'page',
			owner: sidebarOwner,
			noteCount,
			links,
			pager: pagerFor(start, links.length, noteCount),
		},
	}
}

function listNotes(
	db: PrismaClient,
	ownerId: string,
	skip: number,
	take: number,
) {
	return db.note.findMany({
		select: { id: true, title: true },
		where: { ownerId },
		orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
		skip,
		take,
	})
}

async function resolveStart(
	db: PrismaClient,
	ownerId: string,
	noteCount: number,
	url: URL,
) {
	const fromToken = startFromToken(url.searchParams.get('at'), noteCount)
	if (fromToken !== null) return fromToken

	const noteId = noteIdFromPathname(url.pathname)
	if (!noteId) return 0

	const note = await db.note.findFirst({
		select: { id: true, updatedAt: true },
		where: { id: noteId, ownerId },
	})
	if (!note) return 0

	const newerCount = await db.note.count({
		where: {
			ownerId,
			OR: [
				{ updatedAt: { gt: note.updatedAt } },
				{ updatedAt: note.updatedAt, id: { gt: note.id } },
			],
		},
	})
	return clamp(newerCount - 49, 0, noteCount - pageSize)
}

function startFromToken(token: string | null, noteCount: number) {
	if (!token) return null
	const decoded = Buffer.from(token, 'base64url').toString('utf8')
	if (!/^[0-9]+$/.test(decoded)) return null
	const start = Number(decoded)
	if (!Number.isSafeInteger(start)) return null
	if (start < 0 || start > noteCount - 1) return null
	return start
}

function noteIdFromPathname(pathname: string) {
	const marker = '/notes/'
	const at = pathname.lastIndexOf(marker)
	if (at === -1) return null
	const segment = pathname.slice(at + marker.length).split('/')[0]
	if (!segment || segment === 'new') return null
	return decodeURIComponent(segment)
}

function pagerFor(
	start: number,
	linkCount: number,
	noteCount: number,
): SidebarPager {
	const newerTo =
		start > 0 ? `?at=${tokenFor(Math.max(0, start - pageSize))}` : null
	const olderIndex = start + linkCount
	const olderTo =
		olderIndex < noteCount ? `?at=${tokenFor(olderIndex)}` : null
	if (newerTo !== null && olderTo !== null) return { newerTo, olderTo }
	if (newerTo !== null) return { newerTo, olderTo: null }
	if (olderTo !== null) return { newerTo: null, olderTo }
	throw new Error('Paged sidebar has no adjacent page')
}

function tokenFor(start: number) {
	return Buffer.from(String(start), 'utf8').toString('base64url')
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max)
}
