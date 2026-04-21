import { createHash } from "node:crypto";
import { parameterizeTemplate, type Dialect, type IntentTemplate } from "./parameterize.js";
import { buildIntentLookupKey } from "./keys.js";

export type IntentText = {
  kind: "intent_text";
  dialect: Dialect;
  prompt: string;
  placeholderPrompt: string;
  params: unknown[];
};

export type IntentInputObject = {
  strings: string[];
  values: unknown[];
};

export type IntentInput = string | IntentTemplate | IntentInputObject;

export type CompiledIntent = {
  id: string;
  sql: string;
  params: unknown[];
  dialect: Dialect;
  prompt: string;
  placeholderPrompt: string;
};

type CompiledIntentPartial = {
  id?: string;
  sql?: string;
  params?: unknown[];
  dialect?: Dialect;
};

export type IntentCompiler = (
  normalizedIntent: IntentTemplate | IntentText,
  compileOptions?: Record<string, unknown>
) => Promise<CompiledIntentPartial> | CompiledIntentPartial;

export type CompiledExecutor = (
  compiled: CompiledIntent,
  executeOptions?: Record<string, unknown>
) => Promise<unknown> | unknown;

export type IntentClientOptions = {
  dialect?: Dialect;
  compile?: IntentCompiler;
  executeCompiled?: CompiledExecutor;
  registry?: Map<string, CompiledIntent>;
  compiledIntents?: CompiledIntentLookupInput;
};

export type ExecuteOptions<T = unknown> = {
  returnType?: ((value: unknown) => T) | { parse: (value: unknown) => T };
} & Record<string, unknown>;

export type CompiledIntentLookupEntry = {
  id?: string;
  sql: string;
  dialect?: Dialect;
};

export type CompiledIntentManifestInput = {
  intents: Array<{
    key?: string;
    id?: string;
    sql: string;
    dialect?: Dialect;
    placeholderPrompt?: string;
  }>;
};

export type CompiledIntentLookupInput =
  | Map<string, CompiledIntentLookupEntry>
  | Record<string, CompiledIntentLookupEntry>
  | CompiledIntentManifestInput;

function isIntentTemplate(input: unknown): input is IntentTemplate {
  return Boolean(
    input &&
      typeof input === "object" &&
      "kind" in input &&
      (input as { kind?: unknown }).kind === "intent_template"
  );
}

function isIntentInputObject(input: unknown): input is IntentInputObject {
  return Boolean(
    input &&
      typeof input === "object" &&
      "strings" in input &&
      Array.isArray((input as { strings?: unknown }).strings) &&
      "values" in input &&
      Array.isArray((input as { values?: unknown }).values)
  );
}

function stableId(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function parseWithReturnType<T>(value: unknown, returnType: ExecuteOptions<T>["returnType"]): T | unknown {
  if (!returnType) {
    return value;
  }
  if (typeof returnType === "function") {
    return returnType(value);
  }
  if (typeof returnType.parse === "function") {
    return returnType.parse(value);
  }
  return value;
}

function normalizePromptInput(input: IntentInput, dialect: Dialect): IntentTemplate | IntentText {
  if (typeof input === "string") {
    return {
      kind: "intent_text",
      prompt: input,
      placeholderPrompt: input,
      params: [],
      dialect
    };
  }

  if (isIntentTemplate(input)) {
    return {
      kind: "intent_template",
      prompt: input.prompt,
      placeholderPrompt: input.placeholderPrompt,
      params: Array.isArray(input.params) ? [...input.params] : [],
      dialect: input.dialect || dialect
    };
  }

  if (isIntentInputObject(input)) {
    return parameterizeTemplate(input.strings, input.values, dialect);
  }

  throw new Error("Unsupported prompt input. Use a string or template-generated intent object.");
}

function normalizeCompiledIntents(
  compiledIntents: CompiledIntentLookupInput | undefined,
  dialect: Dialect
): Map<string, CompiledIntentLookupEntry> {
  const result = new Map<string, CompiledIntentLookupEntry>();
  if (!compiledIntents) {
    return result;
  }

  if (compiledIntents instanceof Map) {
    for (const [key, value] of compiledIntents.entries()) {
      if (value && typeof value.sql === "string" && value.sql.length > 0) {
        result.set(key, value);
      }
    }
    return result;
  }

  if ("intents" in compiledIntents && Array.isArray(compiledIntents.intents)) {
    for (const item of compiledIntents.intents) {
      if (!item || typeof item.sql !== "string" || item.sql.length === 0) {
        continue;
      }
      const itemDialect = item.dialect || dialect;
      const key =
        item.key ||
        (item.placeholderPrompt
          ? buildIntentLookupKey(itemDialect, item.placeholderPrompt)
          : undefined);
      if (!key) {
        continue;
      }
      result.set(key, {
        id: item.id,
        sql: item.sql,
        dialect: itemDialect
      });
    }
    return result;
  }

  for (const [key, value] of Object.entries(compiledIntents)) {
    if (!value || typeof value.sql !== "string" || value.sql.length === 0) {
      continue;
    }
    result.set(key, {
      id: value.id,
      sql: value.sql,
      dialect: value.dialect || dialect
    });
  }

  return result;
}

async function defaultCompiler(normalizedIntent: IntentTemplate | IntentText): Promise<CompiledIntentPartial> {
  const preview = normalizedIntent.placeholderPrompt.replace(/\s+/g, " ").trim();
  return {
    sql: `-- TODO: compile intent with an LLM provider\n-- intent: ${preview}`,
    params: normalizedIntent.params,
    dialect: normalizedIntent.dialect
  };
}

function toCompiledShape(
  normalizedIntent: IntentTemplate | IntentText,
  compiled: CompiledIntentPartial
): CompiledIntent {
  const sql = typeof compiled.sql === "string" ? compiled.sql : "";
  const params = Array.isArray(compiled.params) ? compiled.params : normalizedIntent.params;
  const id =
    typeof compiled.id === "string" && compiled.id.length > 0
      ? compiled.id
      : stableId(`${normalizedIntent.placeholderPrompt}:${sql}`);

  return {
    id,
    sql,
    params,
    dialect: compiled.dialect || normalizedIntent.dialect,
    prompt: normalizedIntent.prompt,
    placeholderPrompt: normalizedIntent.placeholderPrompt
  };
}

export function createIntentClient(options: IntentClientOptions = {}) {
  const dialect: Dialect = options.dialect || "postgresql";
  const compile = typeof options.compile === "function" ? options.compile : defaultCompiler;
  const executeCompiled = typeof options.executeCompiled === "function" ? options.executeCompiled : null;
  const registry = options.registry instanceof Map ? options.registry : new Map<string, CompiledIntent>();
  const compiledLookup = normalizeCompiledIntents(options.compiledIntents, dialect);

  function prepare(strings: TemplateStringsArray, ...values: unknown[]): IntentTemplate {
    return parameterizeTemplate([...strings], values, dialect);
  }

  async function compileIntent(
    input: IntentInput,
    compileOptions: Record<string, unknown> = {}
  ): Promise<CompiledIntent> {
    const normalized = normalizePromptInput(input, dialect);
    const lookupKey = buildIntentLookupKey(normalized.dialect, normalized.placeholderPrompt);
    const precompiled = compiledLookup.get(lookupKey) || compiledLookup.get(normalized.placeholderPrompt);
    if (precompiled) {
      const shaped: CompiledIntent = {
        id: precompiled.id || lookupKey,
        sql: precompiled.sql,
        params: normalized.params,
        dialect: precompiled.dialect || normalized.dialect,
        prompt: normalized.prompt,
        placeholderPrompt: normalized.placeholderPrompt
      };
      registry.set(shaped.id, shaped);
      return shaped;
    }

    const compiled = await compile(normalized, compileOptions);
    const shaped = toCompiledShape(normalized, compiled);
    registry.set(shaped.id, shaped);
    return shaped;
  }

  async function execute<T = unknown>(
    input: IntentInput | CompiledIntent,
    executeOptions: ExecuteOptions<T> = {}
  ): Promise<T | CompiledIntent | unknown> {
    const compiled =
      input && typeof input === "object" && "sql" in input && typeof input.sql === "string"
        ? (input as CompiledIntent)
        : await compileIntent(input as IntentInput, executeOptions);

    if (!executeCompiled) {
      return compiled;
    }

    const raw = await executeCompiled(compiled, executeOptions);
    return parseWithReturnType(raw, executeOptions.returnType);
  }

  async function query<T = unknown>(input: IntentInput | CompiledIntent, optionsForQuery: ExecuteOptions<T> = {}) {
    return execute(input, optionsForQuery);
  }

  async function mutate<T = unknown>(
    input: IntentInput | CompiledIntent,
    optionsForMutation: ExecuteOptions<T> = {}
  ) {
    return execute(input, optionsForMutation);
  }

  function getCompiled(id: string): CompiledIntent | undefined {
    return registry.get(id);
  }

  return {
    dialect,
    registry,
    prepare,
    compileIntent,
    execute,
    query,
    mutate,
    getCompiled
  };
}
