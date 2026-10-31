#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
RUN_ID="${RUN_ID:-$$}"
DATA="${DATA_DIR:-/tmp/epic-notes-verify-$RUN_ID}"
EVIDENCE="${EVIDENCE_DIR:-/tmp/epic-notes-proof}"
PORT="${PORT:-4317}"
mkdir -p "$DATA" "$EVIDENCE"
LOG="$DATA/server.log"
: >"$LOG"

export NODE_ENV=development
export MOCKS=true
export PORT
export DATABASE_PATH="$DATA/data.db"
export DATABASE_URL="file:$DATA/data.db?connection_limit=1"
export CACHE_DATABASE_PATH="$DATA/cache.db"
if [[ ! -f "$ROOT/.env" ]]; then
	cp "$ROOT/.env.example" "$ROOT/.env"
fi

cd "$ROOT"
npx prisma migrate deploy
npx prisma db seed

setsid nohup node index.ts >"$LOG" 2>&1 < /dev/null &
PID=$!

ready=0
for _ in $(seq 1 90); do
	if grep -q "We have liftoff!" "$LOG"; then
		ready=1
		break
	fi
	if ! kill -0 "$PID" 2>/dev/null; then
		echo "server exited before liftoff" >&2
		cat "$LOG" >&2
		exit 1
	fi
	sleep 1
done
if [[ "$ready" != 1 ]]; then
	echo "timed out waiting for liftoff" >&2
	cat "$LOG" >&2
	kill "$PID" 2>/dev/null || true
	exit 1
fi

URL="$(grep -oE 'http://localhost:[0-9]+' "$LOG" | head -n 1)"
if [[ -z "$URL" ]]; then
	echo "liftoff log did not include a localhost url" >&2
	cat "$LOG" >&2
	kill "$PID" 2>/dev/null || true
	exit 1
fi

cat >"$DATA/instance.json" <<EOF
{
  "pid": $PID,
  "url": "$URL",
  "dataDir": "$DATA",
  "evidenceDir": "$EVIDENCE",
  "log": "$LOG"
}
EOF

echo "$DATA/instance.json"
