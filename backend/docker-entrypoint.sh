#!/bin/sh
set -e

echo "[entrypoint] waiting for database..."
i=0
until node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.\$queryRaw\`SELECT 1\`
  .then(async () => { await p.\$disconnect(); process.exit(0); })
  .catch(async () => { await p.\$disconnect().catch(()=>{}); process.exit(1); });
" 2>/dev/null
do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "[entrypoint] database wait timed out"
    exit 1
  fi
  echo "[entrypoint] database not ready (attempt $i), retrying..."
  sleep 2
done

echo "[entrypoint] running migrations..."
npx prisma migrate deploy

if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "[entrypoint] seeding (idempotent)..."
  if ! npx ts-node -r tsconfig-paths/register prisma/seed.ts; then
    echo "[entrypoint] seed with paths failed, trying plain ts-node..."
    npx ts-node prisma/seed.ts || echo "[entrypoint] seed skipped/failed (non-fatal)"
  fi
fi

echo "[entrypoint] starting: $*"
exec "$@"
