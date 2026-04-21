# Runtime Integration

`createIntentClient` is the runtime bridge between intent prompts and real execution.

## Typical Setup

```ts
import { createIntentClient } from "intent-compiler";
import { compiledIntentMap } from "./intent-compiler.generated";

export const aiDb = createIntentClient({
  dialect: "postgresql",
  compiledIntents: compiledIntentMap,
  executeCompiled: async (compiled) => db.query(compiled.sql, compiled.params)
});
```

## Execution Path

1. Template literal values become parameters (`params`)
2. Placeholder prompt gets normalized
3. Stable lookup key is generated
4. Precompiled SQL is selected
5. Adapter executes SQL with positional params
6. Optional `returnType` parser validates output

## Safety Model

The runtime path keeps values separate from query text:

- prompt variables map to query parameters
- query text is precompiled and persisted
- dynamic user input is never injected directly into SQL text
