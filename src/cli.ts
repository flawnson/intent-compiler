import { runInitCommand } from "./init.js";
import { runCompileIntentCommand } from "./compile-intent.js";

type InitOptions = {
  yes: boolean;
  force: boolean;
  cwd?: string;
  help?: boolean;
};

type CompileOptions = {
  cwd?: string;
  out?: string;
  generated?: string;
  provider?: string;
  model?: string;
  dryRun?: boolean;
  help?: boolean;
};

function printUsage(): void {
  console.log("intent-compiler");
  console.log("");
  console.log("Usage:");
  console.log("  intent-compiler init [--yes] [--force] [--cwd <path>]");
  console.log("  intent-compiler compile-intent [--cwd <path>] [--out <path>] [--generated <path>]");
  console.log("");
  console.log("Options:");
  console.log("  -y, --yes      Use defaults and skip interactive prompts");
  console.log("  -f, --force    Overwrite existing generated files");
  console.log("      --cwd      Target directory for generated files");
  console.log("      --out      Output path for compiled manifest JSON");
  console.log("      --generated Output path for generated TS compiled-intent map");
  console.log("      --provider LLM provider override (openai|anthropic|llama|stub|auto)");
  console.log("      --model    LLM model override");
  console.log("      --dry-run  Discover and compile without writing files");
  console.log("  -h, --help     Show help");
}

function parseInitArgs(args: string[]): InitOptions {
  const options: InitOptions = {
    yes: false,
    force: false,
    cwd: undefined
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "-y" || arg === "--yes") {
      options.yes = true;
      continue;
    }
    if (arg === "-f" || arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--cwd") {
      const cwd = args[index + 1];
      if (!cwd) {
        throw new Error("--cwd expects a path value");
      }
      options.cwd = cwd;
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function parseCompileArgs(args: string[]): CompileOptions {
  const options: CompileOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--cwd") {
      const cwd = args[index + 1];
      if (!cwd) {
        throw new Error("--cwd expects a path value");
      }
      options.cwd = cwd;
      index += 1;
      continue;
    }
    if (arg === "--out") {
      const out = args[index + 1];
      if (!out) {
        throw new Error("--out expects a path value");
      }
      options.out = out;
      index += 1;
      continue;
    }
    if (arg === "--generated") {
      const generated = args[index + 1];
      if (!generated) {
        throw new Error("--generated expects a path value");
      }
      options.generated = generated;
      index += 1;
      continue;
    }
    if (arg === "--provider") {
      const provider = args[index + 1];
      if (!provider) {
        throw new Error("--provider expects a value");
      }
      options.provider = provider;
      index += 1;
      continue;
    }
    if (arg === "--model") {
      const model = args[index + 1];
      if (!model) {
        throw new Error("--model expects a value");
      }
      options.model = model;
      index += 1;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<void> {
  const [command, ...args] = argv;

  if (!command || command === "help" || command === "-h" || command === "--help") {
    printUsage();
    return;
  }

  if (command === "init") {
    const options = parseInitArgs(args);
    if (options.help) {
      printUsage();
      return;
    }
    await runInitCommand(options);
    return;
  }

  if (command === "compile-intent") {
    const options = parseCompileArgs(args);
    if (options.help) {
      printUsage();
      return;
    }
    await runCompileIntentCommand(options);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}
