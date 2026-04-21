# Workflow

## What The User Provides

1. Framework preferences during `intent-compiler init`
2. Environment variables (`DATABASE_URL`, provider API key)
3. Intent prompts in source code or `.intent.txt` files

## What The Compiler Does

When `compile-intent` runs, it:

1. Loads config and environment values
2. Detects intent prompts from:
   - `aiDb.prepare\`...\``
   - `intent\`...\``
   - `intents/*.intent.txt`
3. Converts dynamic segments into placeholders (`$1`, `$2`, or `?`)
4. Gathers project context:
   - dependencies
   - schema snippets
   - migration snippets
5. Calls selected provider with a constrained JSON-output prompt
6. Writes compiled artifacts

## What Gets Returned

The compiler output contains:

- source metadata (file + line)
- normalized placeholder prompt
- compiled SQL/query text
- stable lookup key

Runtime then maps incoming prompt templates to precompiled entries and executes through your adapter.
