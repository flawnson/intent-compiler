import { test } from "node:test";
import * as assert from "node:assert/strict";
import { createIntentClient, parameterizeTemplate, buildIntentLookupKey } from "../src/index.js";

test("parameterizeTemplate maps values to postgres placeholders", () => {
  const strings = ["Get users in ", " who signed up after ", ""];
  const values = ["Canada", "2026-01-01"];
  const result = parameterizeTemplate(strings, values, "postgresql");

  assert.equal(result.placeholderPrompt, "Get users in $1 who signed up after $2");
  assert.deepEqual(result.params, ["Canada", "2026-01-01"]);
});

test("intent client compiles and executes with injected executor", async () => {
  const aiDb = createIntentClient({
    compile: async (intent) => ({
      sql: "SELECT * FROM users WHERE country = $1 AND signup_date > $2",
      params: intent.params
    }),
    executeCompiled: async (compiled) => ({
      sql: compiled.sql,
      params: compiled.params,
      rows: [{ id: 1 }]
    })
  });

  const prepared = aiDb.prepare`Get users in ${"Canada"} who signed up after ${"2026-01-01"}`;
  const result = await aiDb.query(prepared);

  assert.equal(
    (result as { sql: string }).sql,
    "SELECT * FROM users WHERE country = $1 AND signup_date > $2"
  );
  assert.deepEqual((result as { params: unknown[] }).params, ["Canada", "2026-01-01"]);
  assert.deepEqual((result as { rows: Array<{ id: number }> }).rows, [{ id: 1 }]);
});

test("intent client prefers precompiled entries when key exists", async () => {
  const placeholderPrompt = "Get users in $1 who signed up after $2";
  const key = buildIntentLookupKey("postgresql", placeholderPrompt);
  const aiDb = createIntentClient({
    compiledIntents: {
      [key]: {
        id: key,
        sql: "SELECT * FROM users WHERE country = $1 AND signup_date > $2",
        dialect: "postgresql"
      }
    }
  });

  const prepared = aiDb.prepare`Get users in ${"Canada"} who signed up after ${"2026-01-01"}`;
  const compiled = await aiDb.compileIntent(prepared);

  assert.equal(compiled.sql, "SELECT * FROM users WHERE country = $1 AND signup_date > $2");
  assert.deepEqual(compiled.params, ["Canada", "2026-01-01"]);
});
