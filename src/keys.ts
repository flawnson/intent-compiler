import { createHash } from "node:crypto";
import type { Dialect } from "./parameterize.js";

export function buildIntentLookupKey(dialect: Dialect, placeholderPrompt: string): string {
  return createHash("sha256").update(`${dialect}:${placeholderPrompt}`).digest("hex").slice(0, 24);
}
