import { readFileSync } from 'node:fs'
import {
	parsePermissionString,
	userHasPermission,
	type PermissionString,
} from '#app/utils/user.ts'

const ACTIONS = ['create', 'read', 'update', 'delete'] as const
const ENTITIES = ['user', 'note'] as const
const ACCESSES = ['own', 'any'] as const

type StoredPermission = {
	action: (typeof ACTIONS)[number]
	entity: (typeof ENTITIES)[number]
	access: (typeof ACCESSES)[number]
}

const CATALOG: Array<StoredPermission> = ACTIONS.flatMap((action) =>
	ENTITIES.flatMap((entity) =>
		ACCESSES.map((access) => ({ action, entity, access })),
	),
)

function permissionRequest(
	action: (typeof ACTIONS)[number],
	entity: (typeof ENTITIES)[number],
	access?: (typeof ACCESSES)[number],
): PermissionString {
	if (access === undefined) return `${action}:${entity}`
	return `${action}:${entity}:${access}`
}

const REQUESTS: Array<PermissionString> = ACTIONS.flatMap((action) =>
	ENTITIES.flatMap((entity) => [
		permissionRequest(action, entity),
		permissionRequest(action, entity, 'own'),
		permissionRequest(action, entity, 'any'),
	]),
)

const USER_ROLE = CATALOG.filter((permission) => permission.access === 'own')
const ADMIN_ROLE = CATALOG.filter((permission) => permission.access === 'any')

function actor(permissions: Array<StoredPermission>) {
	return {
		roles: [
			{
				name: 'fixture',
				permissions,
			},
		],
	}
}

function specAllows(
	permissions: Array<StoredPermission>,
	request: PermissionString,
) {
	const parsed = parsePermissionString(request)
	return permissions.some(
		(permission) =>
			permission.action === parsed.action &&
			permission.entity === parsed.entity &&
			(parsed.access === undefined ||
				parsed.access.includes(permission.access)),
	)
}

function actionSource() {
	const source = readFileSync(
		'app/routes/users/$username/notes/$noteId.tsx',
		'utf8',
	)
	const start = source.indexOf('export async function action')
	const end = source.indexOf('export default function NoteRoute')
	if (start < 0 || end < start) {
		throw new Error('could not find the note delete action')
	}
	return source.slice(start, end)
}

function assertActionModel() {
	const action = actionSource()
	const hasOwnGate = action.includes(
		"requireUserWithPermission(request, 'delete:note:own')",
	)
	const hasAnyGate = action.includes(
		"requireUserWithPermission(request, 'delete:note:any')",
	)
	const deletesById = action.includes('prisma.note.delete')
	const mentionsOwner = action.includes('ownerId')
	if (!(hasOwnGate && !hasAnyGate && deletesById && !mentionsOwner)) {
		console.error(
			'The note delete action no longer matches this model. Read app/routes/users/$username/notes/$noteId.tsx and update the checker before trusting the result.',
		)
		process.exit(2)
	}
}

function actionAllows(permissions: Array<StoredPermission>) {
	return userHasPermission(actor(permissions), 'delete:note:own')
}

function intendedAllows(
	permissions: Array<StoredPermission>,
	ownsNote: boolean,
) {
	const request: PermissionString = ownsNote
		? 'delete:note:own'
		: 'delete:note:any'
	return userHasPermission(actor(permissions), request)
}

function deleteGrants(permissions: Array<StoredPermission>) {
	const grants = permissions
		.filter(
			(permission) =>
				permission.action === 'delete' && permission.entity === 'note',
		)
		.map((permission) => `delete:note:${permission.access}`)
	if (grants.length === 0) return 'no delete:note permission'
	return grants.join(' and ')
}

const parserRows: Array<
	[PermissionString, ReturnType<typeof parsePermissionString>]
> = [
	['delete:note:own', { action: 'delete', entity: 'note', access: ['own'] }],
	['delete:note:any', { action: 'delete', entity: 'note', access: ['any'] }],
	['delete:note', { action: 'delete', entity: 'note', access: undefined }],
]

let helperFailures = 0
for (const [request, expected] of parserRows) {
	const actual = parsePermissionString(request)
	if (
		actual.action !== expected.action ||
		actual.entity !== expected.entity ||
		JSON.stringify(actual.access) !== JSON.stringify(expected.access)
	) {
		helperFailures += 1
		console.error(`parsePermissionString(${request}) diverged`)
	}
}

const subsetCount = 1 << CATALOG.length
for (let mask = 0; mask < subsetCount; mask += 1) {
	const permissions = CATALOG.filter((_, index) => (mask & (1 << index)) !== 0)
	for (const request of REQUESTS) {
		const actual = userHasPermission(actor(permissions), request)
		const expected = specAllows(permissions, request)
		if (actual !== expected) {
			helperFailures += 1
			if (helperFailures <= 5) {
				console.error(
					`userHasPermission returned ${actual} for ${request} with ${permissions.length} permissions`,
				)
			}
		}
	}
}
if (userHasPermission(null, 'delete:note:any') !== false) {
	helperFailures += 1
	console.error('userHasPermission(null) returned true')
}

assertActionModel()

function reportFinding(
	label: string,
	permissions: Array<StoredPermission>,
	ownsNote: boolean,
) {
	const allowed = actionAllows(permissions)
	const intended = intendedAllows(permissions, ownsNote)
	if (allowed === intended) return
	const ownership = ownsNote ? 'owns the note' : 'does not own the note'
	console.error(
		`${label}. A user with ${deleteGrants(permissions)} who ${ownership} is ${allowed ? 'allowed' : 'denied'} by the action and ${intended ? 'allowed' : 'denied'} by the notes page.`,
	)
}

reportFinding('Seeded user role', USER_ROLE, false)
reportFinding('Seeded admin role', ADMIN_ROLE, false)
reportFinding('Seeded user role', USER_ROLE, true)
reportFinding('Seeded admin role', ADMIN_ROLE, true)

let findingCount = 0

for (let mask = 0; mask < subsetCount; mask += 1) {
	const permissions = CATALOG.filter((_, index) => (mask & (1 << index)) !== 0)
	for (const ownsNote of [true, false]) {
		if (actionAllows(permissions) !== intendedAllows(permissions, ownsNote)) {
			findingCount += 1
		}
	}
}

console.log(
	`userHasPermission agrees with the permission-string rule on ${subsetCount} single-role sets and ${REQUESTS.length} requests.`,
)
console.log(`helper mismatches: ${helperFailures}`)
console.log(
	`note-delete mismatches, including both ownership values for every set: ${findingCount}`,
)

if (helperFailures > 0 || findingCount > 0) {
	console.error(
		'Exit 1 is a failed check. A helper mismatch means userHasPermission disagrees with the rule in this file. A note-delete mismatch means app/routes/users/$username/notes/$noteId.tsx does not follow the same own versus any choice as the notes page.',
	)
	process.exit(1)
}
