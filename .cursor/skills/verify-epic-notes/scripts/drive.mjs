import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium, expect } from '@playwright/test'

const instancePath = process.argv[2]
const feature = process.argv[3]
if (!instancePath || !feature) {
	console.error(
		'usage: node drive.mjs <instance.json> <login|read-note|create-note|search>',
	)
	process.exit(2)
}

const instance = JSON.parse(readFileSync(instancePath, 'utf8'))
const outDir = path.join(instance.evidenceDir, feature)
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

async function loginAsKody() {
	await page.goto(`${instance.url}/login`)
	await page.getByLabel('Username').fill('kody')
	await page.getByLabel('Password').fill('kodylovesyou')
	await page.getByRole('button', { name: 'Log in', exact: true }).click()
	await page.getByRole('link', { name: 'User menu' }).waitFor()
}

try {
	if (feature === 'login') {
		await loginAsKody()
		await page.goto(`${instance.url}/users/kody/notes`)
		await page.getByRole('heading', { name: "Kody's Notes" }).waitFor()
		await page.getByRole('link', { name: 'Basic Koala Facts' }).waitFor()
	} else if (feature === 'read-note') {
		await loginAsKody()
		await page.goto(`${instance.url}/users/kody/notes`)
		await page.getByRole('link', { name: 'Basic Koala Facts' }).click()
		await page.getByRole('heading', { name: 'Basic Koala Facts' }).waitFor()
	} else if (feature === 'search') {
		await page.goto(`${instance.url}/users`)
		await page.getByRole('searchbox', { name: 'Search' }).fill('kody')
		await page.waitForURL(/search=kody/)
		await expect(page.getByRole('link', { name: /profile$/ })).toHaveCount(1)
		await page.getByRole('link', { name: 'Kody profile' }).waitFor()
	} else if (feature === 'create-note') {
		await loginAsKody()
		await page.goto(`${instance.url}/users/kody/notes/new`)
		await page.getByLabel('Title').fill('Release checklist')
		await page.getByLabel('Content').fill('Tag and publish')
		await page.getByRole('button', { name: 'Submit', exact: true }).click()
		await page.getByRole('heading', { name: 'Release checklist' }).waitFor()
	} else {
		console.error(`unknown feature ${feature}`)
		process.exit(2)
	}

	const shot = path.join(outDir, 'page.png')
	const text = path.join(outDir, 'page.txt')
	await page.screenshot({ path: shot, fullPage: true })
	writeFileSync(
		text,
		`${page.url()}\n${await page.locator('body').innerText()}\n`,
	)
	console.log(`evidence ${shot}`)
	console.log(`evidence ${text}`)
} finally {
	await browser.close()
}
