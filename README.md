# intent-compiler

Intent compiler scaffolding for natural-language backend workflows.

It gives you:

- An npm-installable CLI: `intent-compiler init`
- Interactive onboarding for framework selection
- Generated `intent-compiler.config.json` + `.env.example` (and optional `.env`)
- A starter runtime API for prepared intent templates and compiled query execution

## Install

```bash
npm install intent-compiler
```

Or run onboarding directly:

```bash
npx intent-compiler init
```

## Onboarding Flow

Run:

```bash
intent-compiler init
```

The CLI asks:

1. Do you want to pick frameworks or let the system decide?
2. LLM provider (`OpenAI`, `Anthropic`, `Llama`) when choosing manually
3. Database (`PostgreSQL`, `MySQL`, `SQLite`)
4. ORM (`Prisma`, `Drizzle`, `None (raw SQL)`)
5. API architecture (`REST`, `GraphQL`, `tRPC`, `OpenAPI`)
6. Allow framework switching (`y/n`)
7. App description
8. `DATABASE_URL` and API key env var/value

Generated files:

- `intent-compiler.config.json`
- `.env.example`
- `.env` (only if values were provided)
- `./intents/README.md`
- `./intents/get-active-users.intent.txt`
- Adds `compile-intent` npm script to `package.json` when available

## CLI Options

```bash
intent-compiler init --yes --force --cwd ./my-app
```

- `--yes`: skip prompts and use defaults
- `--force`: overwrite generated files
- `--cwd`: target directory

Compile intents:

```bash
npm run compile-intent
```

Equivalent command:

```bash
intent-compiler compile-intent --cwd . --provider openai
```

Generated artifacts:

- `.intent-compiler/compiled-intents.json` (manifest + persisted query logic)
- `src/intent-compiler.generated.ts` (compiled map for runtime lookup)

## Runtime Example (TypeScript)

```ts
import { createIntentClient } from "intent-compiler";
import { compiledIntentMap } from "./intent-compiler.generated";

const aiDb = createIntentClient({
  dialect: "postgresql",
  compiledIntents: compiledIntentMap,
  // Replace with real LLM compile step at build time
  compile: async (intent) => ({
    sql: "SELECT * FROM users WHERE country = $1 AND signup_date > $2",
    params: intent.params
  }),
  // Replace with your DB driver call
  executeCompiled: async (compiled) => db.query(compiled.sql, compiled.params)
});

const statement = aiDb.prepare`Get users in ${req.body.country} who signed up after ${req.body.date}`;
const rows = await aiDb.query(statement);
```

`aiDb.prepare` maps dynamic template values into parameterized placeholders (`$1`, `$2`, ... for PostgreSQL).
When a compiled entry exists, `createIntentClient` uses that SQL directly and skips live LLM compilation.

## Status

This package is a foundation for an AOT intent compiler workflow. The default compiler is intentionally a stub and should be replaced with your provider + prompt strategy for NL-to-SQL/NL-to-API compilation.

## Local Development

```bash
npm install
npm run build
npm test
```

The package publishes compiled files from `dist/` and includes TypeScript declaration files.

## Demos

See [demos/README.md](demos/README.md) for standalone demo apps.
