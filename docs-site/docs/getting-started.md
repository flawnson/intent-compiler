---
title: Getting Started
sidebar_position: 2
---

## Install

```bash
npm install intent-compiler
```

## Initialize

```bash
npx intent-compiler init
```

Generated assets:

- `intent-compiler.config.json`
- `.env.example` (+ optional `.env`)
- starter `intents/` files
- `compile-intent` script in `package.json` when available

## Write Intents

Use template prompts in app code:

```ts
const statement = aiDb.prepare`Find active users in ${country} who signed up after ${afterDate}.`;
```

Or store intents in `intents/*.intent.txt`.

## Compile

```bash
npm run compile-intent
```

By default this writes:

- `.intent-compiler/compiled-intents.json`
- `src/intent-compiler.generated.ts`

## Run

Load compiled maps in runtime and execute with your DB adapter:

```ts
import { createIntentClient } from "intent-compiler";
import { compiledIntentMap } from "./intent-compiler.generated";

const aiDb = createIntentClient({
  dialect: "postgresql",
  compiledIntents: compiledIntentMap,
  executeCompiled: async (compiled) => db.query(compiled.sql, compiled.params)
});
```
