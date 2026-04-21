#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APP_DIR="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"

cd "${APP_DIR}"

if docker compose version >/dev/null 2>&1; then
  exec docker compose up --build
fi

if command -v docker-compose >/dev/null 2>&1; then
  exec docker-compose up --build
fi

echo "Docker Compose is required (docker compose or docker-compose)."
exit 1
