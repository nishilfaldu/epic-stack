import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { generateTOTP } from '#app/utils/totp.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { BASE_URL } from '#tests/utils.ts'
import { type Route } from './+types/verify.ts'
import {
	action,
	codeQueryParam,
	targetQueryParam,
	typeQueryParam,
} from './verify.tsx'

const ROUTE_PATH = '/verify'
const ATTEMPTS = 50

test('one reset code reaches set-new-password once when submitted twice together', async () => {
	const results: Array<{ reset: number; invalid: number; other: string[] }> = []

	for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
		const user = await prisma.user.create({
			data: createUser(),
			select: { username: true },
		})
		const { otp, ...verificationConfig } = await generateTOTP({
			algorithm: 'SHA-256',
			charSet: 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789',
			period: 10 * 60,
		})
		await prisma.verification.create({
			data: {
				type: 'reset-password',
				target: user.username,
				...verificationConfig,
				expiresAt: new Date(Date.now() + verificationConfig.period * 1000),
			},
		})

		const responses = await Promise.all([
			submitResetCode(otp, user.username),
			submitResetCode(otp, user.username),
		])
		const classified = responses.map(classifyVerifyResponse)
		results.push({
			reset: classified.filter((kind) => kind === 'reset').length,
			invalid: classified.filter((kind) => kind === 'invalid').length,
			other: classified.filter(
				(kind) => kind !== 'reset' && kind !== 'invalid',
			),
		})
	}

	const doubled = results.filter((result) => result.reset === 2).length
	const refused = results.filter(
		(result) =>
			result.reset === 1 && result.invalid === 1 && result.other.length === 0,
	).length
	const summary = { attempts: ATTEMPTS, doubled, refused, results }

	expect(summary, JSON.stringify(summary)).toEqual({
		attempts: ATTEMPTS,
		doubled: 0,
		refused: ATTEMPTS,
		results: Array.from({ length: ATTEMPTS }, () => ({
			reset: 1,
			invalid: 1,
			other: [],
		})),
	})
})

function submitResetCode(code: string, target: string) {
	return action({
		params: {},
		context: {} as AppLoadContext,
		url: new URL(ROUTE_PATH, BASE_URL),
		pattern: ROUTE_PATH,
		request: new Request(new URL(ROUTE_PATH, BASE_URL), {
			method: 'POST',
			body: new URLSearchParams({
				[codeQueryParam]: code,
				[typeQueryParam]: 'reset-password',
				[targetQueryParam]: target,
			}),
		}),
	} satisfies Route.ActionArgs).catch((error: unknown) => error)
}

function classifyVerifyResponse(
	response: unknown,
): 'reset' | 'invalid' | string {
	if (response instanceof Response) {
		const location = response.headers.get('location')
		if (
			response.status >= 300 &&
			response.status < 400 &&
			location != null &&
			new URL(location, BASE_URL).pathname === '/reset-password'
		) {
			return 'reset'
		}
		return `response ${response.status} ${location ?? ''}`.trim()
	}

	if (isInvalidCode(response)) return 'invalid'

	if (response instanceof Error)
		return `error ${response.name}: ${response.message}`

	return `other ${JSON.stringify(response)}`
}

function isInvalidCode(response: unknown): boolean {
	if (typeof response !== 'object' || response === null) return false
	const record = response as {
		init?: { status?: number } | null
		data?: { result?: { error?: { code?: Array<string> } } }
	}
	return (
		record.init?.status === 400 &&
		Array.isArray(record.data?.result?.error?.code) &&
		record.data.result.error.code.includes('Invalid code')
	)
}
