import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import type { IntentCompilerConfig } from "./config.js";

const LLM_PROVIDERS = ["OpenAI", "Anthropic", "Llama"] as const;
const DATABASES = ["PostgreSQL", "MySQL", "SQLite"] as const;
const ORMS = ["Prisma", "Drizzle", "None (raw SQL)"] as const;
const APIS = ["REST", "GraphQL", "tRPC", "OpenAPI"] as const;

type LlmProvider = (typeof LLM_PROVIDERS)[number] | "Auto";
type Database = (typeof DATABASES)[number];
type Orm = (typeof ORMS)[number];
type ApiArchitecture = (typeof APIS)[number];

const PROVIDER_API_KEY_ENV: Record<LlmProvider, string> = {
  OpenAI: "OPENAI_API_KEY",
  Anthropic: "ANTHROPIC_API_KEY",
  Llama: "LLAMA_API_KEY",
  Auto: "API_KEY"
};

type InitOptions = {
  yes?: boolean;
  force?: boolean;
  cwd?: string;
};

type WriteStatus = "created" | "overwritten" | "skipped";
type ScriptStatus = "created" | "updated" | "skipped" | "not_found" | "invalid";

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[()]/g, "")
    .replace(/__+/g, "_");
}

function normalizeEnvVarName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/__+/g, "_")
    .replace(/^(\d)/, "_$1")
    .toUpperCase();
}

function resolveProjectName(targetDirectory: string): string {
  const packagePath = path.join(targetDirectory, "package.json");
  if (!fs.existsSync(packagePath)) {
    return path.basename(targetDirectory);
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8")) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "name" in parsed &&
      typeof parsed.name === "string" &&
      parsed.name.trim().length > 0
    ) {
      return parsed.name.trim();
    }
  } catch {
    return path.basename(targetDirectory);
  }

  return path.basename(targetDirectory);
}

function parseBoolean(value: string, defaultValue: boolean): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return defaultValue;
  }
  if (["y", "yes", "true", "1"].includes(normalized)) {
    return true;
  }
  if (["n", "no", "false", "0"].includes(normalized)) {
    return false;
  }
  return undefined;
}

async function askYesNo(
  rl: readline.Interface,
  question: string,
  defaultValue = true
): Promise<boolean> {
  const suffix = defaultValue ? "Y/n" : "y/N";
  while (true) {
    const answer = await rl.question(`${question} (${suffix}): `);
    const parsed = parseBoolean(answer, defaultValue);
    if (parsed !== undefined) {
      return parsed;
    }
    console.log("Please answer with y or n.");
  }
}

async function askChoice<T extends string>(
  rl: readline.Interface,
  question: string,
  options: readonly T[],
  defaultIndex = 0
): Promise<T> {
  while (true) {
    console.log(question);
    options.forEach((option, index) => {
      console.log(`  ${index + 1}. ${option}`);
    });
    const answer = await rl.question(`Select [1-${options.length}] (default ${defaultIndex + 1}): `);
    const trimmed = answer.trim();

    if (trimmed.length === 0) {
      return options[defaultIndex];
    }

    const asNumber = Number.parseInt(trimmed, 10);
    if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= options.length) {
      return options[asNumber - 1];
    }

    const matched = options.find((option) => option.toLowerCase() === trimmed.toLowerCase());
    if (matched) {
      return matched;
    }

    console.log("Invalid choice. Please enter a number from the list.");
  }
}

async function askText(
  rl: readline.Interface,
  question: string,
  defaultValue = ""
): Promise<string> {
  const suffix = defaultValue ? ` (default: ${defaultValue})` : "";
  const answer = await rl.question(`${question}${suffix}: `);
  const trimmed = answer.trim();
  return trimmed.length > 0 ? trimmed : defaultValue;
}

function buildEnvExampleValue(name: string): string {
  if (name === "DATABASE_URL") {
    return "postgresql://user:password@localhost:5432/app_db";
  }
  return "replace_me";
}

function writeFileSafely(filePath: string, content: string, force: boolean): WriteStatus {
  const exists = fs.existsSync(filePath);
  if (exists && !force) {
    return "skipped";
  }
  fs.writeFileSync(filePath, content, "utf8");
  return exists ? "overwritten" : "created";
}

function ensureCompileIntentScript(targetDirectory: string, force: boolean): ScriptStatus {
  const packageJsonPath = path.join(targetDirectory, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return "not_found";
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
      [key: string]: unknown;
    };
    const scripts = parsed.scripts && typeof parsed.scripts === "object" ? parsed.scripts : {};
    const desired = "intent-compiler compile-intent";
    const existing = scripts["compile-intent"];

    if (existing === desired) {
      return "skipped";
    }
    if (existing && !force) {
      return "skipped";
    }

    scripts["compile-intent"] = desired;
    parsed.scripts = scripts;
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    return existing ? "updated" : "created";
  } catch {
    return "invalid";
  }
}

type CreateConfigInput = {
  projectName: string;
  selectedFrameworks: boolean;
  llmProvider: LlmProvider;
  database: Database;
  orm: Orm;
  apiArchitecture: ApiArchitecture;
  allowFrameworkSwitching: boolean;
  appDescription: string;
  apiKeyEnvVarName: string;
};

function createConfig({
  projectName,
  selectedFrameworks,
  llmProvider,
  database,
  orm,
  apiArchitecture,
  allowFrameworkSwitching,
  appDescription,
  apiKeyEnvVarName
}: CreateConfigInput): IntentCompilerConfig {
  const normalizedProvider = selectedFrameworks ? toSlug(llmProvider) : "auto";
  const normalizedDb = selectedFrameworks ? toSlug(database) : "auto";
  const normalizedOrm = selectedFrameworks ? toSlug(orm) : "auto";
  const normalizedApi = selectedFrameworks ? toSlug(apiArchitecture) : "auto";

  return {
    $schema: "https://intent-compiler.dev/schemas/config-v1.json",
    version: 1,
    project: {
      name: projectName,
      description: appDescription
    },
    onboarding: {
      selectedFrameworks,
      allowFrameworkSwitching
    },
    compiler: {
      mode: "aot",
      persistedQueries: true,
      dynamicTemplateParameterization: true,
      frameworkResolution: selectedFrameworks ? "manual" : "auto"
    },
    frameworks: {
      llmProvider: normalizedProvider,
      database: normalizedDb,
      orm: normalizedOrm,
      apiArchitecture: normalizedApi
    },
    env: {
      databaseUrl: "DATABASE_URL",
      apiKey: apiKeyEnvVarName
    }
  };
}

function buildIntentsReadme(): string {
  return [
    "# Intents",
    "",
    "Place app-level natural language intent files here.",
    "The compiler can translate these into persisted SQL/API operations at build time.",
    "",
    "Example:",
    "",
    "```txt",
    "Find all active users who signed up this year and include their orders.",
    "```",
    ""
  ].join("\n");
}

function buildStarterIntentFile(): string {
  return ["Find all active users who signed up this year and include their orders.", ""].join("\n");
}

export async function runInitCommand(options: InitOptions = {}): Promise<void> {
  const targetDirectory = path.resolve(options.cwd || process.cwd());
  const projectName = resolveProjectName(targetDirectory);

  if (!fs.existsSync(targetDirectory)) {
    fs.mkdirSync(targetDirectory, { recursive: true });
  }

  const useDefaults = Boolean(options.yes);
  const force = Boolean(options.force);

  let selectedFrameworks = true;
  let llmProvider: LlmProvider = "OpenAI";
  let database: Database = "PostgreSQL";
  let orm: Orm = "Prisma";
  let apiArchitecture: ApiArchitecture = "REST";
  let allowFrameworkSwitching = true;
  let appDescription = "";
  let databaseUrlValue = "";
  let apiKeyEnvVarName = "OPENAI_API_KEY";
  let apiKeyValue = "";

  if (useDefaults) {
    appDescription = "An app powered by compiled natural-language backend intents.";
  } else {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    try {
      selectedFrameworks = await askYesNo(rl, "Do you want to pick your frameworks now?", true);

      if (selectedFrameworks) {
        llmProvider = await askChoice(rl, "What LLM provider do you want to use?", LLM_PROVIDERS, 0);
        database = await askChoice(rl, "What database do you want to use?", DATABASES, 0);
        orm = await askChoice(rl, "Which ORM do you want to use?", ORMS, 0);
        apiArchitecture = await askChoice(
          rl,
          "Which API architecture do you want to use?",
          APIS,
          0
        );
      } else {
        llmProvider = "Auto";
      }

      allowFrameworkSwitching = await askYesNo(
        rl,
        "Allow switching frameworks based on detected use cases?",
        true
      );

      appDescription = await askText(rl, "Tell us about your app; what are you building?");
      databaseUrlValue = await askText(rl, "Provide DATABASE_URL now (leave blank to fill later)");

      const defaultApiKeyName = PROVIDER_API_KEY_ENV[llmProvider] || "API_KEY";
      const enteredApiKeyEnvVarName = await askText(rl, "API key env var name", defaultApiKeyName);
      apiKeyEnvVarName = normalizeEnvVarName(enteredApiKeyEnvVarName || defaultApiKeyName);
      apiKeyValue = await askText(rl, `Provide ${apiKeyEnvVarName} now (leave blank to fill later)`);
    } finally {
      rl.close();
    }
  }

  if (useDefaults) {
    apiKeyEnvVarName = PROVIDER_API_KEY_ENV[llmProvider];
  }

  const config = createConfig({
    projectName,
    selectedFrameworks,
    llmProvider,
    database,
    orm,
    apiArchitecture,
    allowFrameworkSwitching,
    appDescription,
    apiKeyEnvVarName
  });

  const managedDirectory = path.join(targetDirectory, "intent-compiler");
  const configPath = path.join(managedDirectory, "config.json");
  const envPath = path.join(targetDirectory, ".env");
  const envExamplePath = path.join(targetDirectory, ".env.example");
  const intentsDirectoryPath = path.join(managedDirectory, "intents");
  const intentsReadmePath = path.join(intentsDirectoryPath, "README.md");
  const starterIntentPath = path.join(intentsDirectoryPath, "get-active-users.intent.txt");

  if (!fs.existsSync(intentsDirectoryPath)) {
    fs.mkdirSync(intentsDirectoryPath, { recursive: true });
  }

  const statuses: Array<[string, WriteStatus]> = [];
  statuses.push([configPath, writeFileSafely(configPath, `${JSON.stringify(config, null, 2)}\n`, force)]);
  statuses.push([intentsReadmePath, writeFileSafely(intentsReadmePath, buildIntentsReadme(), force)]);
  statuses.push([starterIntentPath, writeFileSafely(starterIntentPath, buildStarterIntentFile(), force)]);

  const envNames = ["DATABASE_URL", apiKeyEnvVarName];
  const envExampleLines = envNames.map((name) => `${name}=${buildEnvExampleValue(name)}`);
  statuses.push([envExamplePath, writeFileSafely(envExamplePath, `${envExampleLines.join("\n")}\n`, force)]);

  const envActualLines: string[] = [];
  if (databaseUrlValue.trim().length > 0) {
    envActualLines.push(`DATABASE_URL=${databaseUrlValue}`);
  }
  if (apiKeyValue.trim().length > 0) {
    envActualLines.push(`${apiKeyEnvVarName}=${apiKeyValue}`);
  }
  if (envActualLines.length > 0) {
    statuses.push([envPath, writeFileSafely(envPath, `${envActualLines.join("\n")}\n`, force)]);
  }
  const scriptStatus = ensureCompileIntentScript(targetDirectory, force);

  console.log("");
  console.log(`Initialized intent-compiler in ${targetDirectory}`);
  statuses.forEach(([filePath, status]) => {
    console.log(`  ${status.padEnd(11)} ${path.relative(targetDirectory, filePath) || filePath}`);
  });
  if (scriptStatus === "created" || scriptStatus === "updated") {
    console.log(`  ${scriptStatus.padEnd(11)} package.json (script: compile-intent)`);
  }
  if (scriptStatus === "invalid") {
    console.log("  note        package.json could not be parsed; script was not added.");
  }
  if (scriptStatus === "not_found") {
    console.log("  note        package.json not found; add script manually: compile-intent");
  }
  if (envActualLines.length === 0) {
    console.log("  note        No .env file written because no secrets were provided.");
  }
  console.log("");
  console.log("Next:");
  console.log("  1) Review intent-compiler/config.json");
  console.log("  2) Add or update secrets in .env");
  console.log("  3) Add intents in intent-compiler/intents/");
}
