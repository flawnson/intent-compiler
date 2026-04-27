# intent-compiler

An **ahead-of-time (AOT) intent compiler** that converts natural-language backend queries into precompiled, parameterized SQL at build time — so there is zero LLM overhead at runtime, and no backend code for the developer to write.

You write intents in plain English as tagged template literals in your **frontend** code. The compiler discovers them, calls your LLM of choice once, and generates both a SQL lookup manifest and a ready-to-mount server handler. The backend is completely managed by the package.

---

## How It Works

```
Frontend code                  Build time                    Runtime
─────────────────              ──────────────────────────    ──────────────────────────────
import { aiDb }                intent-compiler               Handler receives POST /api/intents
  from "intent-compiler/       compile-intent                Looks up compiled SQL by key
  client"                 ──►  (calls OpenAI/           ──►  Executes against DB
                               Anthropic/Llama)              Returns rows as JSON
aiDb.query`Get users
  in ${country}`
```

1. **`intent-compiler init`** — scaffolds `intent-compiler/config.json`, `.env` template, a starter intents folder, and stub handler/generated files so your server starts immediately.
2. **`intent-compiler compile-intent`** — discovers every intent in your codebase, compiles each to SQL via the configured LLM, and writes the manifest, SQL lookup module, and server handler.
3. **`import { aiDb } from "intent-compiler/client"`** — browser-safe client; writes intents as tagged template literals, sends them to the generated handler at runtime.
4. **`intent-compiler/handler.ts`** — generated server handler; auto-connects to your DB using `DATABASE_URL`, executes compiled SQL, returns rows. Mount it in one line.

---

## Directory Structure

```
intent-compiler/
├── bin/
│   └── intent-compiler.ts          # Executable entry point for the CLI
├── src/
│   ├── index.ts                    # Public package exports
│   ├── cli.ts                      # Argument parsing; routes to init or compile-intent
│   ├── init.ts                     # `init` command — interactive scaffolding
│   ├── compile-intent.ts           # `compile-intent` command — discovery, LLM calls, artifact writing
│   ├── client.ts                   # `createIntentClient` server-side runtime factory
│   ├── frontend-client.ts          # `aiDb` browser-safe HTTP client
│   ├── parameterize.ts             # Template literal → parameterized SQL conversion
│   ├── keys.ts                     # SHA256-based stable lookup key generation
│   └── config.ts                   # Config file loading and dialect resolution
├── test/
│   ├── parameterize.test.ts        # Unit tests for template parameterization
│   ├── compile-intent.test.ts      # Integration tests for intent discovery and output
│   ├── frontend-client.test.ts     # Unit tests for the browser HTTP client
│   └── handler-gen.test.ts         # Unit tests for generated handler source (all DB/ORM combos)
├── demos/
│   └── apps/
│       └── react-rest-drizzle-postgres/   # Full-stack reference app
├── docs-site/                      # Docusaurus documentation site + TypeDoc API reference
├── dist/                           # Compiled JavaScript output (generated, not committed)
├── package.json
├── tsconfig.json
└── typedoc.docs.json               # TypeDoc config for API reference generation
```

---

## Install

```bash
npm install intent-compiler
```

Or scaffold a new project directly:

```bash
npx intent-compiler init
```

**Requirements:** Node.js ≥ 20

---

## Quick Start

### 1. Initialize

```bash
npx intent-compiler init
```

The CLI walks you through:

1. Framework selection mode (manual pick or auto-detect)
2. LLM provider — `OpenAI`, `Anthropic`, or `Llama`
3. Database — `PostgreSQL`, `MySQL`, or `SQLite`
4. ORM — `Prisma`, `Drizzle`, or raw SQL
5. API architecture — `REST`, `GraphQL`, `tRPC`, or `OpenAPI`
6. App description (used as schema context for the LLM)
7. `DATABASE_URL` and LLM API key

Generated files:

| File | Purpose |
|------|---------|
| `intent-compiler/config.json` | Compiler configuration (provider, dialect, ORM, etc.) |
| `intent-compiler/generated.ts` | Stub SQL lookup module (populated by `compile-intent`) |
| `intent-compiler/handler.ts` | Stub server handler (populated by `compile-intent`) |
| `intent-compiler/intents/README.md` | Guide for writing `.intent.txt` files |
| `intent-compiler/intents/get-active-users.intent.txt` | Starter intent example |
| `.env.example` | Template listing required environment variables |
| `.env` | Populated only when you supply values during init |

A `compile-intent` script is added to your `package.json` automatically.

### 2. Write Intents in Frontend Code

```tsx
// src/client/App.tsx
import { aiDb } from "intent-compiler/client";

const users = await aiDb.query`Get active users in ${country} signed up after ${date}`;
```

`aiDb.prepare` is also available for the two-step pattern (prepare then query):

```tsx
const statement = aiDb.prepare`Get active users in ${country} signed up after ${date}`;
const users = await aiDb.query(statement, { returnType: toUserShape });
```

`aiDb.query` sends `POST /api/intents` with the lookup key and params. The response is `{ rows: unknown[] }`.

**File-based (`.intent.txt`)** — for intents not tied to specific parameters:

```
# intent-compiler/intents/get-active-users.intent.txt
Get all active users who signed up this year and include their order count.
```

### 3. Compile

```bash
npm run compile-intent
```

The compiler discovers every `aiDb.prepare` template and every `.intent.txt` file, calls the LLM once per unique intent, and writes:

| Artifact | Location | Purpose |
|----------|----------|---------|
| Compiled manifest | `intent-compiler/compiled-intents.json` | Source of truth (gitignore in most projects) |
| SQL lookup module | `intent-compiler/generated.ts` | Imported by the handler at runtime |
| Server handler | `intent-compiler/handler.ts` | Ready-to-mount Express/fetch handler |

### 4. Mount the Handler

Add one line to your server entry point:

```ts
// src/server/index.ts
import { intentHandler } from "./intent-compiler/handler.js";

app.use("/api/intents", intentHandler);
```

The handler reads `DATABASE_URL` from the environment, connects to your database, and serves compiled SQL for any known intent key. Unknown keys return 404. Uncompiled (stub) SQL returns 503 with a clear message.

To protect the endpoint, wrap it with your existing auth middleware:

```ts
app.use("/api/intents", authMiddleware, intentHandler);
```

---

## CLI Reference

### `intent-compiler init`

```bash
intent-compiler init [options]
```

| Flag | Description |
|------|-------------|
| `--yes` | Skip all prompts and accept defaults |
| `--force` | Overwrite existing generated files |
| `--cwd <path>` | Target directory (default: `.`) |

### `intent-compiler compile-intent`

```bash
intent-compiler compile-intent [options]
```

| Flag | Description |
|------|-------------|
| `--cwd <path>` | Root directory to scan for intents |
| `--out <path>` | Output path for the compiled manifest JSON |
| `--generated <path>` | Output path for the generated TypeScript module |
| `--provider <name>` | Override LLM provider (`openai`, `anthropic`, `llama`, `stub`, `auto`) |
| `--model <name>` | Override model selection |
| `--dry-run` | Discover and compile without writing any files |

---

## Runtime API

### Frontend Client (`intent-compiler/client`)

```ts
import { aiDb, createFrontendIntentClient } from "intent-compiler/client";

// Default instance — reads endpoint from VITE_INTENT_ENDPOINT or NEXT_PUBLIC_INTENT_ENDPOINT env,
// falls back to /api/intents.
const users = await aiDb.query`Get active users in ${country}`;

// Custom instance
const client = createFrontendIntentClient({
  endpoint: "/api/intents",  // where intentHandler is mounted
  dialect: "postgresql",     // must match config.json
});
```

**Methods:**
- **`aiDb.prepare\`...\``** — parameterizes the template locally, returns an `IntentTemplate` (no network call)
- **`aiDb.query(template, options?)`** — sends `POST /api/intents`, returns rows; apply `returnType` to transform
- **`aiDb.mutate(template, options?)`** — identical to `query`; semantic alias for writes

**Endpoint configuration:**

| Variable | Used by |
|----------|---------|
| `VITE_INTENT_ENDPOINT` | Vite projects |
| `NEXT_PUBLIC_INTENT_ENDPOINT` | Next.js projects |
| `options.endpoint` | Custom / other frameworks |

### Generated Server Handler (`intent-compiler/handler.ts`)

The handler is auto-generated by `compile-intent` based on your `config.json`. It exports:

```ts
// Express/Connect middleware
export function intentHandler(req, res, next?): void

// Fetch API handler (Next.js App Router, Cloudflare Workers, etc.)
export async function intentFetchHandler(request: Request): Promise<Response>
```

**Security model:** Only keys present in the compiled manifest can be executed. All params are passed to parameterized driver APIs — SQL injection via params is impossible at the driver level.

**Handler generation by DB/ORM:**

| Database | ORM | Driver used |
|----------|-----|-------------|
| PostgreSQL | Drizzle / raw | `pg` Pool |
| PostgreSQL | Prisma | `@prisma/client` |
| MySQL | Drizzle / raw | `mysql2/promise` |
| MySQL | Prisma | `@prisma/client` |
| SQLite | Drizzle / raw | `better-sqlite3` |
| SQLite | Prisma | `@prisma/client` |

### Advanced: Server-side Client (`createIntentClient`)

For advanced use cases where you want to wire your own DB execution (e.g., multi-tenant routing, custom middleware):

```ts
import { createIntentClient } from "intent-compiler";
import { compiledIntentMap } from "./intent-compiler/generated.js";

const aiDb = createIntentClient({
  dialect: "postgresql",
  compiledIntents: compiledIntentMap,
  executeCompiled: async (compiled) => db.query(compiled.sql, compiled.params),
});
```

---

## Configuration (`intent-compiler/config.json`)

```json
{
  "$schema": "https://intent-compiler.dev/schemas/config-v1.json",
  "version": 1,
  "project": { "name": "my-app", "description": "A SaaS dashboard" },
  "frameworks": {
    "llmProvider": "openai",
    "database": "postgresql",
    "orm": "drizzle",
    "apiArchitecture": "rest"
  },
  "env": {
    "databaseUrl": "DATABASE_URL",
    "apiKey": "OPENAI_API_KEY"
  }
}
```

The compiler also auto-detects schema context from Prisma schema files, Drizzle config, database migration files, and OpenAPI specs in your project.

---

## Local Development

### Setup

```bash
git clone https://github.com/your-org/intent-compiler.git
cd intent-compiler
npm install
npm run build
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Clean `dist/` and compile TypeScript |
| `npm run clean` | Remove `dist/` |
| `npm test` | Build then run all tests |
| `npm run docs:install` | Install docs-site dependencies |
| `npm run docs:dev` | Start Docusaurus dev server |
| `npm run docs:build` | Production build of the docs site |
| `npm run docs:api` | Regenerate TypeDoc API reference |

### Running Tests

```bash
npm test
```

Tests use Node's built-in `node:test` module — no external test runner required. Test files live in `test/` and are compiled to `dist/test/` before running.

### Project Structure Notes for Contributors

- **CLI commands** — `src/init.ts` and `src/compile-intent.ts`. Each exports a single async function called by `src/cli.ts`.
- **Frontend client** — `src/frontend-client.ts`. Must have zero `node:*` imports. Exported as `intent-compiler/client` subpath.
- **Server-side client** — `src/client.ts`. For advanced manual wiring. Exported from `intent-compiler` main entry.
- **Handler generation** — `generateHandlerSource()` in `src/compile-intent.ts`. Selects DB adapter from config and emits complete TypeScript source.
- **Public API** — `src/index.ts`. Anything not re-exported there is internal.
- Tests import from `dist/` (compiled output), so always run `npm run build` before `npm test`, or use `npm test` which does both.

---

## Documentation Site

The `docs-site/` directory contains a [Docusaurus](https://docusaurus.io/) site with a full TypeDoc API reference.

```bash
npm run docs:install   # install docs-site deps (run once)
npm run docs:dev       # http://localhost:3000
```

---

## Demos

See [`demos/README.md`](demos/README.md) for the full-stack reference app (React + Express + Drizzle + PostgreSQL).

---

## License

MIT
