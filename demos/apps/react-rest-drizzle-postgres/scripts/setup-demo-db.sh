#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CONTAINER_NAME="${CONTAINER_NAME:-intent-demo-postgres}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-intent_demo}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
APP_PORT="${APP_PORT:-8787}"
SEED_DB="${SEED_DB:-1}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-seed)
      SEED_DB=0
      shift
      ;;
    --seed)
      SEED_DB=1
      shift
      ;;
    --port)
      POSTGRES_PORT="$2"
      shift 2
      ;;
    --container)
      CONTAINER_NAME="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: ./scripts/setup-demo-db.sh [--seed|--no-seed] [--port <port>] [--container <name>]"
      exit 1
      ;;
  esac
done

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    exit 1
  fi
}

require_cmd docker
require_cmd npm

DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}"
ENV_FILE="${APP_DIR}/.env"

ensure_container_running() {
  if docker ps -a --format '{{.Names}}' | grep -Fxq "${CONTAINER_NAME}"; then
    if ! docker ps --format '{{.Names}}' | grep -Fxq "${CONTAINER_NAME}"; then
      echo "Starting existing container: ${CONTAINER_NAME}"
      docker start "${CONTAINER_NAME}" >/dev/null
    else
      echo "Container already running: ${CONTAINER_NAME}"
    fi
    return
  fi

  echo "Creating container: ${CONTAINER_NAME}"
  docker run -d \
    --name "${CONTAINER_NAME}" \
    -e POSTGRES_DB="${POSTGRES_DB}" \
    -e POSTGRES_USER="${POSTGRES_USER}" \
    -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
    -p "${POSTGRES_PORT}:5432" \
    "${POSTGRES_IMAGE}" >/dev/null
}

wait_for_postgres() {
  echo "Waiting for PostgreSQL to become ready..."
  for _ in $(seq 1 60); do
    if docker exec "${CONTAINER_NAME}" pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
      echo "PostgreSQL is ready."
      return
    fi
    sleep 1
  done

  echo "PostgreSQL did not become ready in time."
  exit 1
}

upsert_env_var() {
  local key="$1"
  local value="$2"
  local file="$3"

  if [[ ! -f "${file}" ]]; then
    touch "${file}"
  fi

  awk -v k="${key}" -v v="${value}" '
    BEGIN { replaced = 0 }
    $0 ~ ("^" k "=") {
      print k "=" v
      replaced = 1
      next
    }
    { print }
    END {
      if (!replaced) {
        print k "=" v
      }
    }
  ' "${file}" > "${file}.tmp"

  mv "${file}.tmp" "${file}"
}

write_env() {
  if [[ ! -f "${ENV_FILE}" && -f "${APP_DIR}/.env.example" ]]; then
    cp "${APP_DIR}/.env.example" "${ENV_FILE}"
  fi

  upsert_env_var "DATABASE_URL" "${DATABASE_URL}" "${ENV_FILE}"
  upsert_env_var "PORT" "${APP_PORT}" "${ENV_FILE}"

  if [[ -n "${OPENAI_API_KEY:-}" ]]; then
    upsert_env_var "OPENAI_API_KEY" "${OPENAI_API_KEY}" "${ENV_FILE}"
  else
    upsert_env_var "OPENAI_API_KEY" "" "${ENV_FILE}"
  fi
}

run_schema_setup() {
  cd "${APP_DIR}"

  if [[ ! -d node_modules ]]; then
    echo "Installing npm dependencies..."
    npm install
  fi

  echo "Applying schema with Drizzle..."
  npm run db:push
}

run_seed() {
  if [[ "${SEED_DB}" == "1" ]]; then
    echo "Seeding demo data..."
    npm run db:seed
  fi
}

ensure_container_running
wait_for_postgres
write_env
run_schema_setup
run_seed

echo ""
echo "Demo database setup complete."
echo "DATABASE_URL=${DATABASE_URL}"
echo "App dir: ${APP_DIR}"
echo ""
echo "Next:"
echo "  1) cd ${APP_DIR}"
echo "  2) npm run compile-intent"
echo "  3) npm run dev"
echo ""
echo "To stop PostgreSQL container:"
echo "  docker stop ${CONTAINER_NAME}"
