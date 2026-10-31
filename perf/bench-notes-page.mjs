import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const base = process.env.BENCH_URL ?? 'http://127.0.0.1:3000'
const runs = Number(process.env.BENCH_RUNS ?? 10)
const username = process.env.BENCH_USER ?? 'heavy'
const expected = Number(process.env.BENCH_EXPECTED ?? 5000)
const outPath = process.env.BENCH_OUT ?? 'perf/notes-page-bench.json'

function median(values) {
	const sorted = [...values].sort((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2
	return sorted[mid]
}

function summarize(rows) {
	const loadMs = rows.map((row) => row.loadMs)
	return {
		n: rows.length,
		statuses: [...new Set(rows.map((row) => row.status))],
		noteLinks: [...new Set(rows.map((row) => row.noteLinks))],
		loadMs: {
			median: median(loadMs),
			min: Math.min(...loadMs),
			max: Math.max(...loadMs),
			values: loadMs,
		},
		ttfbMs: {
			median: median(rows.map((row) => row.ttfbMs)),
			min: Math.min(...rows.map((row) => row.ttfbMs)),
			max: Math.max(...rows.map((row) => row.ttfbMs)),
		},
		decodedBodySize: [...new Set(rows.map((row) => row.decodedBodySize))],
		domNodes: [...new Set(rows.map((row) => row.domNodes))],
	}
}

async function noteIds(page, owner) {
	return page.locator('a').evaluateAll((anchors, ownerName) => {
		const ids = []
		const pattern = new RegExp(`/users/${ownerName}/notes/([^/?#]+)`)
		for (const anchor of anchors) {
			const href = anchor.getAttribute('href') ?? ''
			const match = href.match(pattern)
			if (match && match[1] !== 'new') ids.push(decodeURIComponent(match[1]))
		}
		return ids
	}, owner)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', (error) => {
	errors.push({ kind: 'pageerror', message: String(error) })
})
page.on('console', (msg) => {
	if (msg.type() === 'error') errors.push({ kind: 'console', message: msg.text() })
})

const health = await page.goto(`${base}/resources/healthcheck`, {
	waitUntil: 'load',
})
await page.goto(`${base}/`, { waitUntil: 'load' })

async function loadNotes(owner, index) {
	const response = await page.goto(
		`${base}/users/${owner}/notes?bench=${index}`,
		{ waitUntil: 'load' },
	)
	const timing = await page.evaluate(() => {
		const nav = performance.getEntriesByType('navigation')[0]
		const heading = document.querySelector('h1')
		return {
			loadMs: nav.loadEventEnd - nav.startTime,
			dclMs: nav.domContentLoadedEventEnd - nav.startTime,
			ttfbMs: nav.responseStart - nav.requestStart,
			decodedBodySize: nav.decodedBodySize,
			domNodes: document.querySelectorAll('*').length,
			heading: heading ? heading.textContent : null,
		}
	})
	const ids = await noteIds(page, owner)
	return {
		username: owner,
		index,
		status: response?.status() ?? 0,
		noteLinks: ids.length,
		finalUrl: page.url(),
		...timing,
	}
}

const loads = []
for (let index = 0; index < runs; index++) {
	loads.push(await loadNotes(username, index))
	loads.push(await loadNotes('light', index))
}

await page.goto(`${base}/users/${username}/notes?bench=reach`, {
	waitUntil: 'load',
})
const seen = new Set()
const reachSteps = []
for (let step = 0; step < 200; step++) {
	const ids = await noteIds(page, username)
	let added = 0
	for (const id of ids) {
		if (!seen.has(id)) {
			seen.add(id)
			added += 1
		}
	}
	const older = page.getByRole('link', { name: 'Older', exact: true })
	const olderCount = await older.count()
	reachSteps.push({
		step,
		url: page.url(),
		visible: ids.length,
		added,
		seen: seen.size,
		olderCount,
	})
	if (added === 0) break
	if (olderCount === 0) break
	const previousUrl = page.url()
	await older.click()
	await page.waitForFunction((prev) => location.href !== prev, previousUrl)
	await page.locator('h1').waitFor()
}

await browser.close()

const heavy = loads.filter((row) => row.username === username)
const light = loads.filter((row) => row.username === 'light')
const heavySummary = summarize(heavy)
const report = {
	claim:
		'Median of 10 full browser loads of /users/heavy/notes on a local production build. Assets warmed by one homepage load. Document cache avoided with a unique bench query. Alternating with the 3-note account. Reachability walks Older until every note id has been seen.',
	base,
	healthStatus: health?.status() ?? 0,
	expected,
	errors,
	heavy: heavySummary,
	light: summarize(light),
	reachability: {
		seen: seen.size,
		expected,
		complete: seen.size === expected && reachSteps.every((step) => step.added > 0),
		steps: reachSteps,
	},
	loads,
}

writeFileSync(outPath, JSON.stringify(report, null, 2))
console.log(
	JSON.stringify(
		{
			outPath,
			heavy: heavySummary.loadMs,
			heavyStatus: heavySummary.statuses,
			heavyLinks: heavySummary.noteLinks,
			light: report.light.loadMs,
			reachability: report.reachability.complete,
			seen: seen.size,
			steps: reachSteps.length,
			errorCount: errors.length,
		},
		null,
		2,
	),
)
if (health?.status() !== 200) process.exitCode = 1
if (heavySummary.statuses.some((status) => status !== 200)) process.exitCode = 1
if (errors.length > 0) process.exitCode = 1
if (seen.size !== expected) process.exitCode = 1
