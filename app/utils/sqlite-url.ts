import path from 'node:path'

const SCHEMA_DIR = path.join(process.cwd(), 'prisma')

// Prisma 6 opens a relative SQLite URL from the schema directory.
// Prisma 7 and libSQL open it from the process cwd. Rewrite relative file
// URLs so an existing file:./data.db still points at prisma/data.db.
// connection_limit is a Prisma engine query parameter. libSQL rejects it.
export function sqliteUrlForDriver(databaseUrl: string) {
	const queryStart = databaseUrl.indexOf('?')
	const bare =
		queryStart === -1 ? databaseUrl : databaseUrl.slice(0, queryStart)
	if (!bare.startsWith('file:')) {
		throw new Error(
			`DATABASE_URL must be a sqlite file URL. Received ${databaseUrl}`,
		)
	}
	const filePath = bare.slice('file:'.length)
	const absolute = path.isAbsolute(filePath)
		? filePath
		: path.resolve(SCHEMA_DIR, filePath)
	return `file:${absolute}`
}
