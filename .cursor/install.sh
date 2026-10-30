#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
	cp .env.example .env
fi
npm ci
npx prisma migrate deploy
npx prisma generate --sql
npx playwright install chromium
