import { readFileSync } from 'node:fs'
import { kill } from 'node:process'

const instancePath = process.argv[2]
if (!instancePath) {
	console.error('usage: node doctor.mjs <instance.json>')
	process.exit(2)
}

const instance = JSON.parse(readFileSync(instancePath, 'utf8'))

try {
	kill(instance.pid, 0)
} catch {
	console.error(`pid ${instance.pid} is not running`)
	process.exit(1)
}

const health = await fetch(`${instance.url}/resources/healthcheck`)
const healthBody = await health.text()
if (!health.ok || healthBody !== 'OK') {
	console.error(`healthcheck returned ${health.status} ${healthBody}`)
	process.exit(1)
}

const login = await fetch(`${instance.url}/login`)
const loginBody = await login.text()
if (!login.ok || !loginBody.includes('Welcome back!')) {
	console.error(`login page returned ${login.status}`)
	process.exit(1)
}

console.log(
	`doctor ok pid=${instance.pid} url=${instance.url} evidence=${instance.evidenceDir}`,
)
