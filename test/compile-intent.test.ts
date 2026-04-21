import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runCompileIntentCommand } from "../src/compile-intent.js";

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

test("compile-intent discovers code prompts and writes generated artifacts", async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "intent-compiler-test-"));

  try {
    writeFile(
      path.join(tempDirectory, "package.json"),
      JSON.stringify({ name: "fixture-app", scripts: {} }, null, 2)
    );
    writeFile(
      path.join(tempDirectory, "intent-compiler.config.json"),
      JSON.stringify(
        {
          version: 1,
          frameworks: {
            llmProvider: "openai",
            database: "postgresql",
            orm: "prisma",
            apiArchitecture: "rest"
          },
          env: {
            databaseUrl: "DATABASE_URL",
            apiKey: "OPENAI_API_KEY"
          }
        },
        null,
        2
      )
    );
    writeFile(
      path.join(tempDirectory, "src", "queries.ts"),
      [
        "export async function run(aiDb: { prepare: Function; query: Function }, req: { body: { country: string; date: string } }) {",
        "  const statement = aiDb.prepare`Get users in ${req.body.country} who signed up after ${req.body.date}`;",
        "  return aiDb.query(statement);",
        "}",
        ""
      ].join("\n")
    );

    await runCompileIntentCommand({
      cwd: tempDirectory,
      provider: "stub"
    });

    const manifestPath = path.join(tempDirectory, ".intent-compiler", "compiled-intents.json");
    const generatedPath = path.join(tempDirectory, "src", "intent-compiler.generated.ts");

    assert.equal(fs.existsSync(manifestPath), true);
    assert.equal(fs.existsSync(generatedPath), true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      intents: Array<{ placeholderPrompt: string; sql: string; sourcePath: string }>;
      provider: string;
    };

    assert.equal(manifest.provider, "stub");
    assert.equal(manifest.intents.length, 1);
    assert.equal(manifest.intents[0].sourcePath, "src/queries.ts");
    assert.equal(manifest.intents[0].placeholderPrompt, "Get users in $1 who signed up after $2");
    assert.match(manifest.intents[0].sql, /TODO: replace stub/i);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
