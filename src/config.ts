import * as fs from "node:fs";
import * as path from "node:path";
import type { Dialect } from "./parameterize.js";

export type IntentCompilerConfig = {
  $schema?: string;
  version: number;
  project?: {
    name?: string;
    description?: string;
  };
  onboarding?: {
    selectedFrameworks?: boolean;
    allowFrameworkSwitching?: boolean;
  };
  compiler?: {
    mode?: string;
    persistedQueries?: boolean;
    dynamicTemplateParameterization?: boolean;
    frameworkResolution?: "manual" | "auto";
  };
  frameworks?: {
    llmProvider?: string;
    database?: string;
    orm?: string;
    apiArchitecture?: string;
  };
  env?: {
    databaseUrl?: string;
    apiKey?: string;
  };
};

function normalizeConfig(raw: unknown): IntentCompilerConfig {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid intent-compiler config: expected an object.");
  }

  const version = "version" in raw && typeof raw.version === "number" ? raw.version : 1;
  const candidate = raw as IntentCompilerConfig;

  return {
    ...candidate,
    version
  };
}

export function loadIntentCompilerConfig(cwd: string): IntentCompilerConfig {
  const configPath = path.join(cwd, "intent-compiler", "config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Missing intent-compiler/config.json in ${cwd}. Run "intent-compiler init" first.`
    );
  }

  const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as unknown;
  return normalizeConfig(raw);
}

export function resolveDialectFromConfig(config: IntentCompilerConfig): Dialect {
  const raw = String(config.frameworks?.database || "postgresql").toLowerCase();
  if (raw.includes("mysql")) {
    return "mysql";
  }
  if (raw.includes("sqlite")) {
    return "sqlite";
  }
  return "postgresql";
}
