import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'
import { sqliteUrlForDriver } from './app/utils/sqlite-url.ts'

export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations',
		seed: 'tsx prisma/seed.ts',
	},
	datasource: {
		url: sqliteUrlForDriver(env('DATABASE_URL')),
	},
})
