# intent-compiler

An **ahead-of-time (AOT) intent compiler** that converts natural-language backend queries into precompiled, parameterized SQL at build time — so there is zero LLM overhead at runtime.

You write intents in plain English (as template literals in code or as `.intent.txt` files). The compiler discovers them, calls your LLM of choice once, stores the resulting SQL in a manifest, and generates a typed TypeScript module your runtime client can use for instant lookups.

---

## How It Works

```
Developer writes intent              LLM compiles at build time       Runtime uses precompiled SQL
─────────────────────────            ──────────────────────────       ────────────────────────────
aiDb.prepare`Get users               intent-compiler                  createIntentClient loads
  in ${country}`            ──────►  compile-intent     ──────────►   compiledIntentMap and
                                     (calls OpenAI/                   skips the LLM entirely
                                     Anthropic/Llama)
```

1. **`intent-compiler init`** — scaffolds your config, `.env` template, and a starter intents folder.
2. **`intent-compiler compile-intent`** — discovers every intent in your codebase, compiles each to SQL via the configured LLM, and writes a manifest + generated TypeScript module.
3. **`createIntentClient`** — runtime factory that uses the precompiled manifest for instant, injection-safe query execution.

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
│   ├── client.ts                   # `createIntentClient` runtime factory
│   ├── parameterize.ts             # Template literal → parameterized SQL conversion
│   ├── keys.ts                     # SHA256-based stable lookup key generation
│   └── config.ts                   # Config file loading and dialect resolution
├── test/
│   ├── parameterize.test.ts        # Unit tests for template parameterization
│   └── compile-intent.test.ts      # Integration tests for intent discovery and output
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
| `intent-compiler/intents/README.md` | Guide for writing `.intent.txt` files |
| `intent-compiler/intents/get-active-users.intent.txt` | Starter intent example |
| `.env.example` | Template listing required environment variables |
| `.env` | Populated only when you supply values during init |

A `compile-intent` script is added to your `package.json` automatically.

### 2. Write Intents

**Inline (tagged template literal):**

```ts
import { createIntentClient } from "intent-compiler";

const aiDb = createIntentClient({ dialect: "postgresql", ... });

// intent-compiler discovers this at compile time
const statement = aiDb.prepare`Get users in ${req.body.country} who signed up after ${req.body.date}`;
```

**File-based (`.intent.txt`):**

```
# intent-compiler/intents/get-active-users.intent.txt
Get all active users where plan is ${plan} and created after ${since}
```

### 3. Compile

```bash
npm run compile-intent
```

The compiler discovers every `aiDb.prepare` template and every `.intent.txt` file, calls the LLM once per unique intent, and writes:

| Artifact | Location |
|----------|----------|
| Compiled manifest | `intent-compiler/compiled-intents.json` |
| Runtime lookup module | `intent-compiler/generated.ts` |

### 4. Use at Runtime

```ts
import { createIntentClient } from "intent-compiler";
import { compiledIntentMap } from "./intent-compiler/generated";

const aiDb = createIntentClient({
  dialect: "postgresql",
  compiledIntents: compiledIntentMap,
  executeCompiled: async (compiled) => db.query(compiled.sql, compiled.params),
});

const statement = aiDb.prepare`Get users in ${req.body.country} who signed up after ${req.body.date}`;
const rows = await aiDb.query(statement);
```

`aiDb.prepare` converts template values into dialect-specific placeholders (`$1`/`$2` for PostgreSQL, `?` for MySQL/SQLite). When a compiled entry exists in `compiledIntentMap`, the LLM is never called at runtime.

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

### `createIntentClient(options)`

```ts
import { createIntentClient } from "intent-compiler";

const aiDb = createIntentClient({
  dialect: "postgresql" | "mysql" | "sqlite",
  compiledIntents?: CompiledIntentMap,          // precompiled lookup (from generated module)
  compile?: (intent: Intent) => Promise<CompiledIntent>,    // fallback LLM compile step
  executeCompiled: (compiled: CompiledIntent) => Promise<unknown>,
});
```

Returns `{ prepare, query }`:

- **`aiDb.prepare\`...\``** — tagged template that returns a parameterized `IntentStatement`
- **`aiDb.query(statement)`** — executes the statement; uses precompiled SQL when available, falls back to live compilation otherwise

### `parameterizeTemplate(strings, values, dialect)`

Low-level utility that converts a template literal into `{ sql, params }`. Exported for advanced use cases.

### `buildIntentLookupKey(template)`

Generates a stable SHA256-based key for a given intent template string. Used internally for manifest deduplication.

---

## Configuration (`intent-compiler/config.json`)

```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "dialect": "postgresql",
  "orm": "drizzle",
  "apiArchitecture": "rest",
  "allowFrameworkSwitch": false,
  "appDescription": "A SaaS dashboard for tracking user activity"
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

- **CLI commands** are implemented in `src/init.ts` and `src/compile-intent.ts`. Each exports a single async function called by `src/cli.ts`.
- **Public API** is exported from `src/index.ts`. Anything not re-exported there is internal.
- **Runtime client** logic lives entirely in `src/client.ts`. It has no CLI dependencies.
- The `bin/intent-compiler.ts` entry point is thin — it imports `src/cli.ts` and delegates immediately.
- Tests import from `dist/` (compiled output), so always run `npm run build` before `npm test`, or just use `npm test` which does both.

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
