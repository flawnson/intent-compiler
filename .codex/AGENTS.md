# intent-compiler agent guide

This repository is a TypeScript-first npm package for AOT natural-language intent compilation, plus a docs site and demo apps.

## Project areas

- `src/` and `bin/`: package runtime and CLI (`init`, `compile-intent`)
- `test/`: Node test runner coverage for compiler/runtime behavior
- `docs-site/`: VitePress docs site with TypeDoc API output
- `demos/apps/react-rest-drizzle-postgres/`: standalone demo app (React + REST + Drizzle + Postgres)

## Scope

- Stay inside this repository unless explicitly asked.
- Do not inspect user-home or global Codex config paths unless explicitly requested.

## Hard boundaries

- Do not read, print, modify, create, move, rename, or delete `.env*` files unless explicitly requested.
- Never expose secrets, API keys, tokens, passwords, or credentials in output.
- Do not change deployment or production credential wiring unless explicitly requested.

## Working style

- Prefer minimal, targeted edits over broad refactors.
- Preserve existing package architecture and file layout.
- Keep CLI behavior backward-compatible unless the user requests a breaking change.
- Keep prompt parameterization safe (`$1`, `$2`, `?`) and avoid string-inlined user data in SQL paths.
- Avoid adding dependencies unless there is clear value.

## Package-specific guidance

- For compiler changes, keep deterministic outputs where possible (stable keys, predictable file paths).
- For runtime changes, preserve `createIntentClient` precompiled lookup behavior.
- For docs changes, keep root scripts (`docs:install`, `docs:api`, `docs:dev`, `docs:build`) working.
- For demo changes, keep it independently runnable and aligned with configured stack choices.

## Validation

Use the smallest validation that fits the change:

- package/runtime/CLI changes: `npm test`
- API docs generation: `npm run docs:api`
- docs site changes: `npm run docs:build`
- demo-only changes: validate relevant demo scripts in `demos/apps/react-rest-drizzle-postgres`

## Done means

A task is done when:

- requested behavior is implemented
- unrelated files are not churned
- appropriate validation has run (or limitations are explicitly stated)
- the summary explains what changed and any remaining risk
