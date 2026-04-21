# react-rest-drizzle-postgres

Standalone demo app for the intent-compiler workflow.

Stack:

- TypeScript
- React + Vite
- Tailwind CSS + shadcn-style components
- Express REST API
- Drizzle ORM
- PostgreSQL
- `intent-compiler` AOT prompt compilation

## Run In Docker (Recommended)

From this folder:

```bash
bash ./scripts/run-docker-demo.sh
```

Or directly:

```bash
docker compose up --build
```

This starts:

- `postgres` container (PostgreSQL)
- `app` container (Express REST API + Vite React app)

App URLs:

- Frontend: `http://localhost:5173`
- API: `http://localhost:8787`

Container startup automatically runs:

- `npm run db:push`
- `npm run db:seed` (unless `AUTO_SEED_DB=0`)
- `npm run compile-intent`
- `npm run dev`

Optional env vars for compose:

- `OPENAI_API_KEY` for live LLM compilation output
- `AUTO_SEED_DB=0` to skip reseeding on startup

Stop:

```bash
docker compose down
```

## Run Without Docker

1. Run local DB setup script:

```bash
bash ./scripts/setup-demo-db.sh
```

2. Start app:

```bash
npm run dev
```

## Intent Flow

The REST endpoint in `src/server/index.ts` uses:

```ts
aiDb.prepare`Find active users in ${country} who signed up after ${afterDate} and include their order count and total spend.`
```

`npm run compile-intent` scans project prompts, gathers context (config, deps, schema snippets), and writes:

- `.intent-compiler/compiled-intents.json`
- `src/server/intent-compiler.generated.ts`

Runtime loads compiled query logic from `src/server/intent-compiler.generated.ts`.
