import { styleText } from 'node:util'
import { remember } from '@epic-web/remember'
import { PrismaLibSql } from '@prisma/adapter-libsql'
// Changed import due to issue: https://github.com/remix-run/react-router/pull/12644
import { PrismaClient } from '@prisma/client/index.js'
import { sqliteUrlForDriver } from './sqlite-url.ts'

export const prisma = remember('prisma', () => {
	// NOTE: if you change anything in this function you'll need to restart
	// the dev server to see your changes.

	// Feel free to change this log threshold to something that makes sense for you
	const logThreshold = 20

	const adapter = new PrismaLibSql({
		url: sqliteUrlForDriver(process.env.DATABASE_URL),
		// libSQL fails at once when another process holds the file lock.
		// The dev server and Playwright both open the same SQLite file.
		timeout: 5000,
	})
	const client = new PrismaClient({
		adapter,
		log: [
			{ level: 'query', emit: 'event' },
			{ level: 'error', emit: 'stdout' },
			{ level: 'warn', emit: 'stdout' },
		],
	})
	client.$on('query', async (e) => {
		if (e.duration < logThreshold) return
		const color =
			e.duration < logThreshold * 1.1
				? 'green'
				: e.duration < logThreshold * 1.2
					? 'blue'
					: e.duration < logThreshold * 1.3
						? 'yellow'
						: e.duration < logThreshold * 1.4
							? 'redBright'
							: 'red'
		const dur = styleText(color, `${e.duration}ms`)
		console.info(`prisma:query - ${dur} - ${e.query}`)
	})
	void client.$connect()
	return client
})
