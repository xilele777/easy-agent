#!/usr/bin/env tsx

import assert from "node:assert/strict";
import type { ExecFileOptions } from "node:child_process";
import { executeGrepSearch } from "../tools/grepTool.js";

type RunCommand = (
  command: string,
  args: string[],
  options: ExecFileOptions,
) => Promise<{ stdout: string }>;

function commandError(code: string | number): Error & { code: string | number } {
  return Object.assign(new Error(`Command failed: ${code}`), { code });
}

async function main(): Promise<void> {
  const called: string[] = [];
  const rgOnly: RunCommand = async (command, args, options) => {
    called.push(command);
    assert.equal(command, "rg");
    assert.deepEqual(args, ["-n", "--hidden", "-g", "*.ts", "--", "-needle", "."]);
    assert.equal(options.cwd, "workspace");
    return { stdout: "file.ts:1:-needle\n" };
  };
  assert.equal(
    await executeGrepSearch({ pattern: "-needle", include: "*.ts" }, "workspace", true, true, rgOnly),
    "file.ts:1:-needle",
  );
  assert.deepEqual(called, ["rg"]);

  called.length = 0;
  const grepOnly: RunCommand = async (command, args) => {
    called.push(command);
    if (command === "rg") throw commandError("ENOENT");
    assert.deepEqual(args, ["-rIn", "--", "needle", "workspace/file.ts"]);
    return { stdout: "workspace/file.ts:1:needle\n" };
  };
  assert.equal(
    await executeGrepSearch({ pattern: "needle" }, "workspace/file.ts", false, true, grepOnly),
    "workspace/file.ts:1:needle",
  );
  assert.deepEqual(called, ["rg", "grep"]);

  const noSearchCommand: RunCommand = async () => { throw commandError("ENOENT"); };
  await assert.rejects(
    executeGrepSearch({ pattern: "needle" }, "workspace", true, true, noSearchCommand),
    /Neither rg \(ripgrep\) nor grep is available on PATH/,
  );

  called.length = 0;
  const invalidPattern: RunCommand = async (command) => {
    called.push(command);
    throw commandError(2);
  };
  await assert.rejects(
    executeGrepSearch({ pattern: "[" }, "workspace", true, true, invalidPattern),
    { code: 2 },
  );
  assert.deepEqual(called, ["rg"]);

  process.stdout.write("Grep command fallback and errors passed\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
