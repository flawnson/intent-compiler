import { createIntentClient, type CompiledIntent } from "intent-compiler";
import { pool } from "./db.js";
import { ACTIVE_USERS_PLACEHOLDER_PROMPT, ACTIVE_USERS_SQL } from "./intents.js";
import { compiledIntentMap } from "../../intent-compiler/generated.js";

function resolveCompiledSql(compiled: CompiledIntent): string {
  if (!compiled.sql.trim().startsWith("--")) {
    return compiled.sql;
  }

  if (compiled.placeholderPrompt === ACTIVE_USERS_PLACEHOLDER_PROMPT) {
    return ACTIVE_USERS_SQL;
  }

  throw new Error(
    `No executable SQL is available for intent: "${compiled.placeholderPrompt}". Run npm run compile-intent with an LLM provider key.`
  );
}

export const aiDb = createIntentClient({
  dialect: "postgresql",
  compiledIntents: compiledIntentMap,
  executeCompiled: async (compiled) => {
    const sql = resolveCompiledSql(compiled);
    const result = await pool.query(sql, compiled.params);
    return result.rows;
  }
});
