#!/usr/bin/env node
import { run } from "../src/cli.js";

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`intent-compiler failed: ${message}`);
  process.exitCode = 1;
});
