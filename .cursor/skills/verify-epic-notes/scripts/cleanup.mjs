import { readFileSync, rmSync } from 'node:fs'
import { kill } from 'node:process'
import { setTimeout } from 'node:timers/promises'

const instancePath = process.argv[2]
if (!instancePath) {
	console.error('usage: node cleanup.mjs <instance.json>')
	process.exit(2)
}

const instance = JSON.parse(readFileSync(instancePath, 'utf8'))

try {
	kill(instance.pid, 'SIGTERM')
} catch {
	// The server is already gone. Cleanup still removes its data dir.
}
for (let attempt = 0; attempt < 30; attempt += 1) {
	try {
		kill(instance.pid, 0)
	} catch {
		break
	}
	if (attempt === 29) {
		try {
			kill(instance.pid, 'SIGKILL')
		} catch {
			// Already exited between the check and the signal.
		}
	}
	await setTimeout(100)
}

rmSync(instance.dataDir, { recursive: true, force: true })
console.log(`removed ${instance.dataDir}`)
console.log(`kept evidence at ${instance.evidenceDir}`)
