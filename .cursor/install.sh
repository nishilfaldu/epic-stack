#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
	cp .env.example .env
fi
npm ci
npx prisma generate --sql
npx prisma migrate deploy
npx playwright install chromium
