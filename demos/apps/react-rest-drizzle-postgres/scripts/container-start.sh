#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APP_DIR="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"

cd "${APP_DIR}"

echo "Waiting for database and applying schema..."

attempt=1
max_attempts=30
while true; do
  if npm run db:push; then
    break
  fi

  if [ "${attempt}" -ge "${max_attempts}" ]; then
    echo "Failed to apply schema after ${max_attempts} attempts."
    exit 1
  fi

  attempt=$((attempt + 1))
  sleep 2
done

if [ "${AUTO_SEED_DB:-1}" = "1" ]; then
  echo "Seeding demo data..."
  npm run db:seed
fi

echo "Compiling intents..."
npm run compile-intent

echo "Starting demo app..."
exec npm run dev
