import { faker } from '@faker-js/faker'
import { type BrowserContext } from '@playwright/test'
import * as setCookieParser from 'set-cookie-parser'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

test('owner can share a note as viewer then editor, and revoke hides it', async ({
	page,
	browser,
	login,
	insertNewUser,
}) => {
	test.setTimeout(90_000)
	const owner = await login()
	const recipient = await insertNewUser()
	const title = `${faker.lorem.words(3)} ${faker.string.alphanumeric(8)}`
	const content = `${faker.lorem.sentence()} ${faker.string.alphanumeric(8)}`
	const updatedTitle = `${faker.lorem.words(3)} ${faker.string.alphanumeric(8)}`

	const recipientContext = await browser.newContext()
	const recipientPage = await recipientContext.newPage()
	try {
		await signIn(recipientContext, recipient.id)

		await page.goto(`/users/${owner.username}/notes`)
		await page.getByRole('link', { name: /new note/i }).click()
		await page.getByRole('textbox', { name: /title/i }).fill(title)
		await page.getByRole('textbox', { name: /content/i }).fill(content)
		await page.getByRole('button', { name: /submit/i }).click()
		await expect(page.getByRole('heading', { name: title })).toBeVisible()
		const noteId = new URL(page.url()).pathname.split('/').at(-1)
		expect(noteId).toBeTruthy()
		expect(noteId).not.toBe('new')
		const noteUrl = `/users/${owner.username}/notes/${noteId}`

		await page
			.getByRole('textbox', { name: 'Username' })
			.fill(recipient.username)
		await page.getByRole('radio', { name: 'Viewer' }).check()
		await page.getByRole('button', { name: 'Share', exact: true }).click()
		await expect(
			page.getByRole('button', { name: `Revoke ${recipient.username}` }),
		).toBeVisible()

		await recipientPage.goto(`/users/${recipient.username}/notes`)
		await expect(
			recipientPage.getByRole('heading', { name: 'Shared with me' }),
		).toBeVisible()
		await recipientPage.getByRole('link', { name: title }).click()
		await expect(recipientPage.getByText(content)).toBeVisible()
		await expect(
			recipientPage.getByRole('button', { name: 'Share', exact: true }),
		).toHaveCount(0)

		await recipientPage.goto(`${noteUrl}/edit`)
		await expect(
			recipientPage.getByText('You are not allowed to do that'),
		).toBeVisible()
		await expect(
			recipientPage.getByRole('button', { name: 'Share', exact: true }),
		).toHaveCount(0)

		await page
			.getByRole('textbox', { name: 'Username' })
			.fill(recipient.username)
		await page.getByRole('radio', { name: 'Editor' }).check()
		await page.getByRole('button', { name: 'Share', exact: true }).click()
		await expect(
			page.getByRole('button', { name: `Revoke ${recipient.username}` }),
		).toBeVisible()

		await recipientPage.goto(noteUrl)
		await recipientPage.getByRole('link', { name: 'Edit', exact: true }).click()
		await recipientPage
			.getByRole('textbox', { name: /title/i })
			.fill(updatedTitle)
		await recipientPage.getByRole('button', { name: /submit/i }).click()
		await expect(recipientPage).toHaveURL(noteUrl)
		await expect(
			recipientPage.getByRole('heading', { name: updatedTitle }),
		).toBeVisible()

		const deleteResponse = await recipientPage.request.post(noteUrl, {
			form: { intent: 'delete-note', noteId: noteId! },
			maxRedirects: 0,
		})
		expect(deleteResponse.status()).toBe(403)
		await page.reload()
		await expect(
			page.getByRole('heading', { name: updatedTitle }),
		).toBeVisible()

		const shareResponse = await recipientPage.request.post(noteUrl, {
			form: {
				intent: 'share',
				recipientUsername: recipient.username,
				role: 'editor',
			},
			maxRedirects: 0,
		})
		expect(shareResponse.status()).toBe(403)
		await expect(
			page.getByRole('button', { name: 'Share', exact: true }),
		).toBeVisible()
		await expect(page.getByRole('button', { name: /revoke/i })).toHaveCount(1)
		await expect(
			recipientPage.getByRole('button', { name: 'Share', exact: true }),
		).toHaveCount(0)

		await page
			.getByRole('button', { name: `Revoke ${recipient.username}` })
			.click()
		await expect(
			page.getByRole('button', { name: `Revoke ${recipient.username}` }),
		).toHaveCount(0)

		await recipientPage.goto(`/users/${recipient.username}/notes`)
		await expect(
			recipientPage.getByRole('heading', { name: 'Shared with me' }),
		).toBeVisible()
		await expect(
			recipientPage.getByRole('link', { name: updatedTitle }),
		).toHaveCount(0)
		await recipientPage.goto(noteUrl)
		await expect(
			recipientPage.getByText(`No note with the id "${noteId}" exists`),
		).toBeVisible()
	} finally {
		await recipientContext.close()
	}
})

async function signIn(context: BrowserContext, userId: string) {
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			userId,
		},
		select: { id: true },
	})
	const authSession = await authSessionStorage.getSession()
	authSession.set(sessionKey, session.id)
	const cookieConfig = setCookieParser.parseString(
		await authSessionStorage.commitSession(authSession),
	)
	const newConfig = {
		...cookieConfig,
		domain: 'localhost',
		expires: cookieConfig.expires?.getTime(),
		sameSite: cookieConfig.sameSite as 'Strict' | 'Lax' | 'None',
	}
	await context.addCookies([newConfig])
}
