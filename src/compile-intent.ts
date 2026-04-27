import * as fs from "node:fs";
import * as path from "node:path";
import { buildIntentLookupKey } from "./keys.js";
import { loadIntentCompilerConfig, resolveDialectFromConfig, type IntentCompilerConfig } from "./config.js";
import type { Dialect } from "./parameterize.js";

type CompileIntentCommandOptions = {
  cwd?: string;
  out?: string;
  generated?: string;
  provider?: string;
  model?: string;
  dryRun?: boolean;
};

type DiscoveredIntent = {
  sourceType: "code" | "intent_file";
  sourcePath: string;
  line: number;
  prompt: string;
  placeholderPrompt: string;
  paramExpressions: string[];
};

type ContextSnippet = {
  path: string;
  content: string;
};

type CompilationContext = {
  project: {
    name: string;
    description: string;
  };
  frameworks: IntentCompilerConfig["frameworks"];
  compiler: IntentCompilerConfig["compiler"];
  package: {
    name?: string;
    dependencies: string[];
    devDependencies: string[];
  };
  intentSources: string[];
  schemaSnippets: ContextSnippet[];
};

type CompiledIntentEntry = {
  id: string;
  key: string;
  sourceType: DiscoveredIntent["sourceType"];
  sourcePath: string;
  line: number;
  prompt: string;
  placeholderPrompt: string;
  paramExpressions: string[];
  sql: string;
  dialect: Dialect;
  providerMode: "llm" | "stub";
};

type CompiledIntentManifest = {
  version: 1;
  generatedAt: string;
  dialect: Dialect;
  provider: string;
  model: string;
  context: {
    projectName: string;
    orm: string;
    apiArchitecture: string;
    intentCount: number;
    schemaSnippetCount: number;
  };
  intents: CompiledIntentEntry[];
};

type ProviderName = "openai" | "anthropic" | "llama" | "stub" | "auto";

type ProviderResolution = {
  provider: ProviderName;
  apiKey?: string;
  model: string;
  baseUrl: string;
};

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".idea",
  "intent-compiler",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "tmp"
]);

const TEMPLATE_INTENT_REGEX = /(?:\baiDb\s*\.\s*prepare|\bintent)\s*`([\s\S]*?)`/g;

const DEFAULT_MODELS: Record<Exclude<ProviderName, "stub" | "auto">, string> = {
  openai: "gpt-4.1-mini",
  anthropic: "claude-3-5-sonnet-latest",
  llama: "llama3.1:8b"
};

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function listFilesRecursive(rootDirectory: string): string[] {
  const result: string[] = [];

  function walk(currentDirectory: string): void {
    const entries = fs.readdirSync(currentDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env" && entry.name !== ".env.local") {
        if (entry.isDirectory()) {
          continue;
        }
      }

      const absolutePath = path.join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.has(entry.name)) {
          continue;
        }
        walk(absolutePath);
        continue;
      }

      result.push(absolutePath);
    }
  }

  walk(rootDirectory);
  return result;
}

function lineFromOffset(text: string, offset: number): number {
  if (offset <= 0) {
    return 1;
  }
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text[index] === "\n") {
      line += 1;
    }
  }
  return line;
}

function placeholderToken(dialect: Dialect, index: number): string {
  if (dialect === "postgresql") {
    return `$${index}`;
  }
  return "?";
}

function parseTemplatePrompt(
  templateBody: string,
  dialect: Dialect
): {
  prompt: string;
  placeholderPrompt: string;
  paramExpressions: string[];
} {
  let prompt = "";
  let placeholderPrompt = "";
  const paramExpressions: string[] = [];

  let cursor = 0;
  while (cursor < templateBody.length) {
    const current = templateBody[cursor];
    const next = templateBody[cursor + 1];

    if (current === "$" && next === "{") {
      cursor += 2;
      let depth = 1;
      let expression = "";

      while (cursor < templateBody.length && depth > 0) {
        const char = templateBody[cursor];
        if (char === "{") {
          depth += 1;
          expression += char;
          cursor += 1;
          continue;
        }
        if (char === "}") {
          depth -= 1;
          if (depth > 0) {
            expression += char;
          }
          cursor += 1;
          continue;
        }
        expression += char;
        cursor += 1;
      }

      const cleanedExpression = expression.trim() || `param${paramExpressions.length + 1}`;
      paramExpressions.push(cleanedExpression);
      prompt += `<${cleanedExpression}>`;
      placeholderPrompt += placeholderToken(dialect, paramExpressions.length);
      continue;
    }

    prompt += current;
    placeholderPrompt += current;
    cursor += 1;
  }

  return {
    prompt: prompt.trim(),
    placeholderPrompt: placeholderPrompt.trim(),
    paramExpressions
  };
}

function discoverCodeIntents(cwd: string, dialect: Dialect): DiscoveredIntent[] {
  const files = listFilesRecursive(cwd).filter((absolutePath) => {
    const extension = path.extname(absolutePath).toLowerCase();
    return CODE_EXTENSIONS.has(extension);
  });

  const discovered: DiscoveredIntent[] = [];
  for (const absolutePath of files) {
    const content = fs.readFileSync(absolutePath, "utf8");
    TEMPLATE_INTENT_REGEX.lastIndex = 0;

    let match = TEMPLATE_INTENT_REGEX.exec(content);
    while (match) {
      const matchedTemplate = match[1] || "";
      const parsed = parseTemplatePrompt(matchedTemplate, dialect);
      if (parsed.placeholderPrompt.length > 0) {
        discovered.push({
          sourceType: "code",
          sourcePath: path.relative(cwd, absolutePath).replace(/\\/g, "/"),
          line: lineFromOffset(content, match.index),
          prompt: parsed.prompt,
          placeholderPrompt: parsed.placeholderPrompt,
          paramExpressions: parsed.paramExpressions
        });
      }
      match = TEMPLATE_INTENT_REGEX.exec(content);
    }
  }

  return discovered;
}

function discoverIntentFiles(cwd: string): DiscoveredIntent[] {
  const intentsDirectory = path.join(cwd, "intent-compiler", "intents");
  if (!fs.existsSync(intentsDirectory)) {
    return [];
  }

  const intentFiles = listFilesRecursive(intentsDirectory).filter((absolutePath) =>
    absolutePath.toLowerCase().endsWith(".intent.txt")
  );

  const discovered: DiscoveredIntent[] = [];
  for (const absolutePath of intentFiles) {
    const content = fs.readFileSync(absolutePath, "utf8").trim();
    if (content.length === 0) {
      continue;
    }
    discovered.push({
      sourceType: "intent_file",
      sourcePath: path.relative(cwd, absolutePath).replace(/\\/g, "/"),
      line: 1,
      prompt: content,
      placeholderPrompt: content,
      paramExpressions: []
    });
  }

  return discovered;
}

function dedupeIntents(intents: DiscoveredIntent[], dialect: Dialect): DiscoveredIntent[] {
  const map = new Map<string, DiscoveredIntent>();
  for (const intent of intents) {
    const key = buildIntentLookupKey(dialect, intent.placeholderPrompt);
    if (!map.has(key)) {
      map.set(key, intent);
    }
  }
  return [...map.values()];
}

function readContextSnippet(cwd: string, relativePath: string, maxChars = 6000): ContextSnippet | null {
  const absolutePath = path.join(cwd, relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return null;
  }
  const content = fs.readFileSync(absolutePath, "utf8").slice(0, maxChars);
  return {
    path: relativePath.replace(/\\/g, "/"),
    content
  };
}

function gatherSchemaSnippets(cwd: string): ContextSnippet[] {
  const snippets: ContextSnippet[] = [];
  const directCandidates = [
    "prisma/schema.prisma",
    "schema.prisma",
    "drizzle/schema.ts",
    "drizzle/schema.js",
    "drizzle.config.ts",
    "drizzle.config.js",
    "db/schema.sql",
    "schema.sql",
    "schema.graphql",
    "src/schema.graphql",
    "openapi.yml",
    "openapi.yaml",
    "openapi.json"
  ];

  for (const relativePath of directCandidates) {
    const snippet = readContextSnippet(cwd, relativePath);
    if (snippet) {
      snippets.push(snippet);
    }
  }

  const migrationDirectories = ["prisma/migrations", "migrations"];
  for (const relativeDirectory of migrationDirectories) {
    const absoluteDirectory = path.join(cwd, relativeDirectory);
    if (!fs.existsSync(absoluteDirectory) || !fs.statSync(absoluteDirectory).isDirectory()) {
      continue;
    }

    const files = listFilesRecursive(absoluteDirectory)
      .filter((absolutePath) => absolutePath.toLowerCase().endsWith(".sql"))
      .slice(0, 6);
    for (const file of files) {
      const snippet = readContextSnippet(cwd, path.relative(cwd, file));
      if (snippet) {
        snippets.push(snippet);
      }
    }
  }

  return snippets;
}

function gatherProjectContext(
  cwd: string,
  config: IntentCompilerConfig,
  discoveredIntents: DiscoveredIntent[]
): CompilationContext {
  const packageJsonPath = path.join(cwd, "package.json");
  const packageJson = fs.existsSync(packageJsonPath)
    ? (readJsonFile(packageJsonPath) as {
        name?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      })
    : {};

  const dependencyNames = Object.keys(packageJson.dependencies || {}).sort();
  const devDependencyNames = Object.keys(packageJson.devDependencies || {}).sort();

  const sourceSet = new Set(discoveredIntents.map((intent) => intent.sourcePath));

  return {
    project: {
      name: config.project?.name || packageJson.name || path.basename(cwd),
      description: config.project?.description || ""
    },
    frameworks: config.frameworks,
    compiler: config.compiler,
    package: {
      name: packageJson.name,
      dependencies: dependencyNames,
      devDependencies: devDependencyNames
    },
    intentSources: [...sourceSet].sort(),
    schemaSnippets: gatherSchemaSnippets(cwd)
  };
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const result: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator < 1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }

  return result;
}

function loadEnvForCompilation(cwd: string): Record<string, string> {
  const fromDotEnv = parseEnvFile(path.join(cwd, ".env"));
  const fromDotEnvLocal = parseEnvFile(path.join(cwd, ".env.local"));
  const merged: Record<string, string> = {
    ...fromDotEnv,
    ...fromDotEnvLocal
  };

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      merged[key] = value;
    }
  }

  return merged;
}

function normalizeProviderName(input: string | undefined): ProviderName | "auto" {
  const normalized = String(input || "auto")
    .trim()
    .toLowerCase();

  if (normalized.length === 0 || normalized === "auto") {
    return "auto";
  }
  if (normalized === "openai") {
    return "openai";
  }
  if (normalized === "anthropic") {
    return "anthropic";
  }
  if (normalized === "llama") {
    return "llama";
  }
  return "stub";
}

function resolveApiKey(
  provider: ProviderName,
  env: Record<string, string>,
  config: IntentCompilerConfig
): string | undefined {
  const configuredApiKeyEnv = config.env?.apiKey;
  if (configuredApiKeyEnv && env[configuredApiKeyEnv]) {
    return env[configuredApiKeyEnv];
  }

  if (provider === "openai") {
    return env.OPENAI_API_KEY;
  }
  if (provider === "anthropic") {
    return env.ANTHROPIC_API_KEY;
  }
  if (provider === "llama") {
    return env.LLAMA_API_KEY || env.OLLAMA_API_KEY;
  }

  return undefined;
}

function resolveProvider(
  options: CompileIntentCommandOptions,
  config: IntentCompilerConfig,
  env: Record<string, string>
): ProviderResolution {
  const fromCli = normalizeProviderName(options.provider);
  const fromConfig = normalizeProviderName(config.frameworks?.llmProvider);
  const candidate = fromCli === "auto" ? fromConfig : fromCli;

  const resolved =
    candidate === "auto"
      ? env.OPENAI_API_KEY
        ? "openai"
        : env.ANTHROPIC_API_KEY
          ? "anthropic"
          : env.LLAMA_API_KEY || env.OLLAMA_API_KEY || env.LLAMA_BASE_URL || env.OLLAMA_BASE_URL
            ? "llama"
            : "stub"
      : candidate;

  const provider = resolved;
  const apiKey = resolveApiKey(provider, env, config);

  if (provider === "openai") {
    return {
      provider: apiKey ? "openai" : "stub",
      apiKey,
      model: options.model || env.INTENT_COMPILER_MODEL || DEFAULT_MODELS.openai,
      baseUrl: (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "")
    };
  }

  if (provider === "anthropic") {
    return {
      provider: apiKey ? "anthropic" : "stub",
      apiKey,
      model: options.model || env.INTENT_COMPILER_MODEL || DEFAULT_MODELS.anthropic,
      baseUrl: (env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1").replace(/\/+$/, "")
    };
  }

  if (provider === "llama") {
    return {
      provider: "llama",
      apiKey,
      model: options.model || env.INTENT_COMPILER_MODEL || DEFAULT_MODELS.llama,
      baseUrl: (env.LLAMA_BASE_URL || env.OLLAMA_BASE_URL || "http://localhost:11434/v1").replace(
        /\/+$/,
        ""
      )
    };
  }

  return {
    provider: "stub",
    model: "stub-model",
    baseUrl: ""
  };
}

function buildCompilerMessages(
  intent: DiscoveredIntent,
  context: CompilationContext,
  dialect: Dialect
): { system: string; user: string } {
  const system = [
    "You compile natural language backend intents into parameterized query logic.",
    "Return JSON only.",
    "Output schema:",
    '{"sql":"string"}',
    "Rules:",
    `- Target dialect: ${dialect}`,
    "- Respect placeholders from placeholderPrompt exactly ($1/$2... or ?).",
    "- Never inline user data values.",
    "- Produce one executable query string."
  ].join("\n");

  const userPayload = {
    task: "Compile intent to query logic",
    intent,
    context
  };

  return {
    system,
    user: JSON.stringify(userPayload, null, 2)
  };
}

function parseJsonObjectFromText(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // no-op
  }

  const firstCurly = trimmed.indexOf("{");
  const lastCurly = trimmed.lastIndexOf("}");
  if (firstCurly >= 0 && lastCurly > firstCurly) {
    const maybeJson = trimmed.slice(firstCurly, lastCurly + 1);
    try {
      const parsed = JSON.parse(maybeJson) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function fallbackSql(intent: DiscoveredIntent): string {
  const oneLineIntent = intent.placeholderPrompt.replace(/\s+/g, " ").trim();
  return `-- TODO: replace stub with provider-backed SQL\n-- intent: ${oneLineIntent}`;
}

async function callOpenAi(
  provider: ProviderResolution,
  messages: { system: string; user: string }
): Promise<string> {
  if (!provider.apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: messages.system },
        { role: "user", content: messages.user }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI error ${response.status}: ${await response.text()}`);
  }

  const parsed = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return parsed.choices?.[0]?.message?.content || "";
}

async function callAnthropic(
  provider: ProviderResolution,
  messages: { system: string; user: string }
): Promise<string> {
  if (!provider.apiKey) {
    throw new Error("ANTHROPIC_API_KEY is missing.");
  }

  const response = await fetch(`${provider.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 1024,
      temperature: 0,
      system: messages.system,
      messages: [{ role: "user", content: messages.user }]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic error ${response.status}: ${await response.text()}`);
  }

  const parsed = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  return parsed.content?.find((item) => item.type === "text")?.text || "";
}

async function callLlama(
  provider: ProviderResolution,
  messages: { system: string; user: string }
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (provider.apiKey) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: provider.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: messages.system },
        { role: "user", content: messages.user }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Llama provider error ${response.status}: ${await response.text()}`);
  }

  const parsed = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return parsed.choices?.[0]?.message?.content || "";
}

async function compileIntentWithProvider(
  intent: DiscoveredIntent,
  context: CompilationContext,
  dialect: Dialect,
  provider: ProviderResolution
): Promise<{ sql: string; mode: "llm" | "stub" }> {
  if (provider.provider === "stub") {
    return {
      sql: fallbackSql(intent),
      mode: "stub"
    };
  }

  const messages = buildCompilerMessages(intent, context, dialect);

  try {
    const text =
      provider.provider === "openai"
        ? await callOpenAi(provider, messages)
        : provider.provider === "anthropic"
          ? await callAnthropic(provider, messages)
          : await callLlama(provider, messages);

    const parsed = parseJsonObjectFromText(text);
    const sqlCandidate =
      (typeof parsed?.sql === "string" && parsed.sql) ||
      (typeof parsed?.query === "string" && parsed.query) ||
      "";
    if (sqlCandidate.trim().length > 0) {
      return {
        sql: sqlCandidate.trim(),
        mode: "llm"
      };
    }

    return {
      sql: fallbackSql(intent),
      mode: "stub"
    };
  } catch {
    return {
      sql: fallbackSql(intent),
      mode: "stub"
    };
  }
}

function defaultGeneratedModulePath(cwd: string): string {
  return path.join(cwd, "intent-compiler", "generated.ts");
}

type DbAdapter = {
  driverImport: string;
  setupLines: string[];
  executeLines: string[];
};

function selectDbAdapter(database: string, orm: string, dbUrlEnvVar: string): DbAdapter {
  const normalized = database.toLowerCase();
  const normalizedOrm = orm.toLowerCase();

  if (normalizedOrm === "prisma") {
    return {
      driverImport: 'import { PrismaClient } from "@prisma/client";',
      setupLines: ["const prisma = new PrismaClient();"],
      executeLines: [
        "const rows = await prisma.$queryRawUnsafe(entry.sql, ...(params as unknown[]));",
        "return rows as unknown[];"
      ]
    };
  }

  if (normalized.includes("mysql")) {
    return {
      driverImport: 'import { createPool } from "mysql2/promise";',
      setupLines: [
        `const DATABASE_URL = process.env.${dbUrlEnvVar};`,
        `if (!DATABASE_URL) throw new Error("[intent-compiler] ${dbUrlEnvVar} env var is required.");`,
        "const pool = createPool({ uri: DATABASE_URL });"
      ],
      executeLines: [
        "const [rows] = await pool.execute(entry.sql, params as unknown[]);",
        "return rows as unknown[];"
      ]
    };
  }

  if (normalized.includes("sqlite")) {
    return {
      driverImport: 'import Database from "better-sqlite3";',
      setupLines: [
        `const DATABASE_FILE = (process.env.${dbUrlEnvVar} || "").replace(/^file:/, "");`,
        "const db = new Database(DATABASE_FILE);"
      ],
      executeLines: [
        "return db.prepare(entry.sql).all(...(params as unknown[]));"
      ]
    };
  }

  // postgresql — drizzle or none both use raw pg Pool
  return {
    driverImport: 'import { Pool } from "pg";',
    setupLines: [
      `const DATABASE_URL = process.env.${dbUrlEnvVar};`,
      `if (!DATABASE_URL) throw new Error("[intent-compiler] ${dbUrlEnvVar} env var is required.");`,
      "const pool = new Pool({ connectionString: DATABASE_URL });"
    ],
    executeLines: [
      "const result = await pool.query(entry.sql, params);",
      "return result.rows;"
    ]
  };
}

export function generateHandlerSource(config: IntentCompilerConfig): string {
  const database = String(config.frameworks?.database || "postgresql");
  const orm = String(config.frameworks?.orm || "none");
  const dbUrlEnvVar = config.env?.databaseUrl || "DATABASE_URL";
  const adapter = selectDbAdapter(database, orm, dbUrlEnvVar);

  const setupBlock = adapter.setupLines.join("\n");
  const executeBlock = adapter.executeLines.map((line) => `  ${line}`).join("\n");

  return [
    "/* eslint-disable */",
    "// AUTO-GENERATED by `intent-compiler compile-intent`. Do not edit.",
    "// Re-run `npm run compile-intent` to regenerate after changing intents.",
    "",
    'import * as http from "node:http";',
    adapter.driverImport,
    'import { compiledIntentMap } from "./generated.js";',
    "",
    setupBlock,
    "",
    "type IntentRequest = { key: string; params: unknown[] };",
    "",
    "function parseBody(req: http.IncomingMessage): Promise<IntentRequest> {",
    "  return new Promise((resolve, reject) => {",
    '    let data = "";',
    '    req.on("data", (chunk: Buffer) => { data += chunk.toString(); });',
    '    req.on("end", () => {',
    "      try { resolve(JSON.parse(data) as IntentRequest); }",
    '      catch { reject(new Error("Invalid JSON")); }',
    "    });",
    '    req.on("error", reject);',
    "  });",
    "}",
    "",
    "async function executeIntent(key: string, params: unknown[]): Promise<unknown[]> {",
    "  const entry = compiledIntentMap[key];",
    "  if (!entry) {",
    '    throw Object.assign(new Error("Intent not found"), { status: 404 });',
    "  }",
    '  if (entry.sql.trim().startsWith("-- TODO:")) {',
    "    throw Object.assign(",
    '      new Error("Intent not compiled — run compile-intent with an LLM provider key."),',
    "      { status: 503 }",
    "    );",
    "  }",
    executeBlock,
    "}",
    "",
    "function sendJson(res: http.ServerResponse, status: number, body: unknown): void {",
    "  const payload = JSON.stringify(body);",
    '  res.writeHead(status, { "Content-Type": "application/json" });',
    "  res.end(payload);",
    "}",
    "",
    "export function intentHandler(",
    "  req: http.IncomingMessage,",
    "  res: http.ServerResponse,",
    "  next?: (err?: unknown) => void",
    "): void {",
    '  if (req.method !== "POST") {',
    '    sendJson(res, 405, { error: "Method not allowed" });',
    "    return;",
    "  }",
    "  parseBody(req)",
    "    .then(({ key, params }) => executeIntent(key, params))",
    "    .then((rows) => sendJson(res, 200, { rows }))",
    "    .catch((err: unknown) => {",
    "      const status =",
    "        typeof (err as { status?: number }).status === \"number\"",
    "          ? (err as { status: number }).status",
    "          : 500;",
    "      sendJson(res, status, { error: err instanceof Error ? err.message : \"Internal error\" });",
    '      if (status === 500 && typeof next === "function") next(err);',
    "    });",
    "}",
    "",
    "export async function intentFetchHandler(request: Request): Promise<Response> {",
    '  if (request.method !== "POST") {',
    '    return new Response(JSON.stringify({ error: "Method not allowed" }), {',
    '      status: 405, headers: { "Content-Type": "application/json" }',
    "    });",
    "  }",
    "  let body: IntentRequest;",
    "  try {",
    "    body = (await request.json()) as IntentRequest;",
    "  } catch {",
    '    return new Response(JSON.stringify({ error: "Invalid JSON" }), {',
    '      status: 400, headers: { "Content-Type": "application/json" }',
    "    });",
    "  }",
    "  try {",
    "    const rows = await executeIntent(body.key, body.params);",
    '    return new Response(JSON.stringify({ rows }), {',
    '      status: 200, headers: { "Content-Type": "application/json" }',
    "    });",
    "  } catch (err) {",
    "    const status =",
    "      typeof (err as { status?: number }).status === \"number\"",
    "        ? (err as { status: number }).status",
    "        : 500;",
    "    return new Response(",
    "      JSON.stringify({ error: err instanceof Error ? err.message : \"Internal error\" }),",
    '      { status, headers: { "Content-Type": "application/json" } }',
    "    );",
    "  }",
    "}",
    ""
  ].join("\n");
}

function writeHandlerFile(cwd: string, config: IntentCompilerConfig): void {
  const handlerPath = path.join(cwd, "intent-compiler", "handler.ts");
  fs.mkdirSync(path.dirname(handlerPath), { recursive: true });
  fs.writeFileSync(handlerPath, generateHandlerSource(config), "utf8");
}

function writeManifest(
  manifestPath: string,
  generatedModulePath: string,
  manifest: CompiledIntentManifest,
  cwd: string,
  config: IntentCompilerConfig
): void {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const generatedModule = [
    "/* eslint-disable */",
    "// This file is auto-generated by `intent-compiler compile-intent`.",
    "",
    `export const compiledIntentManifest = ${JSON.stringify(manifest, null, 2)} as const;`,
    "",
    "export type CompiledIntentMap = Record<string, { id: string; sql: string; dialect: string }>;",
    "",
    "export const compiledIntentMap: CompiledIntentMap = {};",
    "for (const item of compiledIntentManifest.intents) {",
    "  compiledIntentMap[item.key] = {",
    "    id: item.id,",
    "    sql: item.sql,",
    "    dialect: item.dialect",
    "  };",
    "}",
    ""
  ].join("\n");

  fs.mkdirSync(path.dirname(generatedModulePath), { recursive: true });
  fs.writeFileSync(generatedModulePath, generatedModule, "utf8");

  writeHandlerFile(cwd, config);
}

export async function runCompileIntentCommand(
  options: CompileIntentCommandOptions = {}
): Promise<void> {
  const cwd = path.resolve(options.cwd || process.cwd());
  const config = loadIntentCompilerConfig(cwd);
  const dialect = resolveDialectFromConfig(config);
  const env = loadEnvForCompilation(cwd);

  const discovered = dedupeIntents(
    [...discoverIntentFiles(cwd), ...discoverCodeIntents(cwd, dialect)],
    dialect
  );

  if (discovered.length === 0) {
    console.log("No intents found. Add .intent.txt files or tagged templates (aiDb.prepare / intent).");
    return;
  }

  const context = gatherProjectContext(cwd, config, discovered);
  const provider = resolveProvider(options, config, env);
  const compiledEntries: CompiledIntentEntry[] = [];

  for (const discoveredIntent of discovered) {
    const compiled = await compileIntentWithProvider(discoveredIntent, context, dialect, provider);
    const key = buildIntentLookupKey(dialect, discoveredIntent.placeholderPrompt);
    compiledEntries.push({
      id: key,
      key,
      sourceType: discoveredIntent.sourceType,
      sourcePath: discoveredIntent.sourcePath,
      line: discoveredIntent.line,
      prompt: discoveredIntent.prompt,
      placeholderPrompt: discoveredIntent.placeholderPrompt,
      paramExpressions: discoveredIntent.paramExpressions,
      sql: compiled.sql,
      dialect,
      providerMode: compiled.mode
    });
  }

  const manifest: CompiledIntentManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    dialect,
    provider: provider.provider,
    model: provider.model,
    context: {
      projectName: context.project.name,
      orm: String(config.frameworks?.orm || "auto"),
      apiArchitecture: String(config.frameworks?.apiArchitecture || "auto"),
      intentCount: compiledEntries.length,
      schemaSnippetCount: context.schemaSnippets.length
    },
    intents: compiledEntries
  };

  const manifestPath = path.resolve(cwd, options.out || "intent-compiler/compiled-intents.json");
  const generatedModulePath = path.resolve(cwd, options.generated || defaultGeneratedModulePath(cwd));

  const handlerPath = path.resolve(cwd, "intent-compiler/handler.ts");

  if (!options.dryRun) {
    writeManifest(manifestPath, generatedModulePath, manifest, cwd, config);
  }

  console.log("");
  console.log(`Compiled ${compiledEntries.length} intent(s) in ${cwd}`);
  console.log(`  provider     ${provider.provider}`);
  console.log(`  model        ${provider.model}`);
  console.log(`  manifest     ${path.relative(cwd, manifestPath).replace(/\\/g, "/")}`);
  console.log(`  generated    ${path.relative(cwd, generatedModulePath).replace(/\\/g, "/")}`);
  console.log(`  handler      ${path.relative(cwd, handlerPath).replace(/\\/g, "/")}`);
  if (compiledEntries.some((entry) => entry.providerMode === "stub")) {
    console.log("  note         Some intents used stub SQL (provider unavailable or response invalid).");
  }
}
