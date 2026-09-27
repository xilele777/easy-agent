#!/usr/bin/env tsx

/** Three small live-model coding tasks. Run only with an explicitly configured profile. */
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

interface Task {
  id: string;
  source: string;
  test: string;
  prompt: string;
}

const tasks: Task[] = [
  {
    id: "retry-boundary",
    source: "export function shouldRetry(status) {\n  return status > 500 && status < 504;\n}\n",
    test: `import { test } from "node:test";
import { strict as assert } from "node:assert";
import { shouldRetry } from "../src/retry.js";
test("retry 500 through 504", () => {
  for (const status of [500, 501, 502, 503, 504]) assert.equal(shouldRetry(status), true);
});
test("do not retry client errors or 505", () => {
  for (const status of [400, 429, 499, 505]) assert.equal(shouldRetry(status), false);
});
`,
    prompt: "Read src/retry.js and test/retry.test.js. Fix shouldRetry so it returns true for HTTP 500 through 504 inclusive and false otherwise. Only edit src/retry.js. Use PowerShell on Windows if a shell is needed; do not use Bash. Run node --test, then summarize the result.",
  },
  {
    id: "parse-list",
    source: "export function parseList(text) {\n  return text.split(',');\n}\n",
    test: `import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseList } from "../src/list.js";
test("trims, drops blanks, and preserves first occurrence", () => {
  assert.deepEqual(parseList(" red, blue, red, , green ,blue "), ["red", "blue", "green"]);
});
test("empty input returns an empty list", () => {
  assert.deepEqual(parseList(" ,  , "), []);
});
`,
    prompt: "Read src/list.js and test/list.test.js. Make parseList return trimmed nonempty entries, removing duplicates while preserving the first occurrence order. Only edit src/list.js. Use PowerShell on Windows if a shell is needed; do not use Bash. Run node --test, then summarize the result.",
  },
  {
    id: "sorted-report",
    source: "export function formatReport(entries) {\n  return entries.sort((a, b) => a.score - b.score).map((entry) => `${entry.name}:${entry.score}`).join('\\n');\n}\n",
    test: `import { test } from "node:test";
import { strict as assert } from "node:assert";
import { formatReport } from "../src/report.js";
test("sorts score descending, then name ascending", () => {
  const entries = [{ name: "zoe", score: 8 }, { name: "amy", score: 8 }, { name: "max", score: 10 }];
  assert.equal(formatReport(entries), "max:10\\namy:8\\nzoe:8");
});
test("does not mutate the caller's list", () => {
  const entries = [{ name: "a", score: 1 }, { name: "b", score: 2 }];
  const before = structuredClone(entries);
  formatReport(entries);
  assert.deepEqual(entries, before);
});
`,
    prompt: "Read src/report.js and test/report.test.js. Fix formatReport to sort by score descending, then name ascending for ties, without mutating the input array. Only edit src/report.js. Use PowerShell on Windows if a shell is needed; do not use Bash. Run node --test, then summarize the result.",
  },
];

const repo = resolve(import.meta.dirname, "..");
const cli = join(repo, "dist", "eagent.js");
const profile = process.env.EASY_AGENT_BENCHMARK_PROFILE ?? "deepseek";
const root = await mkdtemp(join(tmpdir(), "easy-agent-benchmark-"));
const results: Record<string, unknown>[] = [];

function run(command: string, args: string[], cwd: string, timeout = 180_000) {
  return spawnSync(command, args, {
    cwd, env: process.env, encoding: "utf8", timeout, maxBuffer: 4 * 1024 * 1024,
  });
}

try {
  for (const task of tasks) {
    const cwd = join(root, task.id);
    await mkdir(join(cwd, "src"), { recursive: true });
    await mkdir(join(cwd, "test"));
    const sourceName = task.id === "retry-boundary" ? "retry" : task.id === "parse-list" ? "list" : "report";
    const sourcePath = join("src", `${sourceName}.js`);
    await writeFile(join(cwd, "package.json"), '{"type":"module"}\n');
    await writeFile(join(cwd, sourcePath), task.source);
    await writeFile(join(cwd, "test", `${sourceName}.test.js`), task.test);
    run("git", ["init", "-q"], cwd);
    run("git", ["config", "core.autocrlf", "false"], cwd);
    run("git", ["add", "."], cwd);
    const baseline = run("git", ["-c", "user.name=Benchmark", "-c", "user.email=benchmark@example.invalid", "commit", "-qm", "baseline"], cwd);
    if (baseline.status !== 0) throw new Error(`${task.id}: failed to create baseline`);

    const initial = run(process.execPath, ["--test"], cwd);
    if (initial.status === 0) throw new Error(`${task.id}: fixture unexpectedly passes before model edit`);

    const started = Date.now();
    const agent = run(process.execPath, [cli, "--model", profile, "--print", task.prompt, "--output-format", "json", "--dangerously-skip-permissions", "--trust-project-config"], cwd);
    const wallMs = Date.now() - started;
    let result: { subtype?: string; is_error?: boolean; duration_ms?: number; num_turns?: number; usage?: { input_tokens?: number; output_tokens?: number } } = {};
    try { result = JSON.parse(agent.stdout.trim()); } catch { /* Report parse failure without printing provider output. */ }
    const test = run(process.execPath, ["--test"], cwd);
    const status = run("git", ["status", "--porcelain", "--untracked-files=all"], cwd);
    const changedFiles = status.stdout.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).trim());
    const changed = await readFile(join(cwd, sourcePath), "utf8");
    const success = agent.status === 0 && result.subtype === "success" && !result.is_error
      && test.status === 0 && status.status === 0 && changed !== task.source
      && changedFiles.length === 1 && changedFiles[0]?.replaceAll("\\", "/") === sourcePath.replaceAll("\\", "/");
    const item = {
      id: task.id, success, cliExit: agent.status, subtype: result.subtype ?? "unparsed",
      testExit: test.status, changedFiles, wallMs, modelDurationMs: result.duration_ms ?? null,
      turns: result.num_turns ?? null, inputTokens: result.usage?.input_tokens ?? null,
      outputTokens: result.usage?.output_tokens ?? null,
      failureType: success ? null : agent.error ? "environment" : agent.status !== 0 ? "agent" : test.status !== 0 ? "assertion" : "scope",
    };
    results.push(item);
    process.stdout.write(`${JSON.stringify(item)}\n`);
  }
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

const passed = results.filter((item) => item.success).length;
process.stdout.write(`${JSON.stringify({ summary: { passed, total: results.length } })}\n`);
if (passed !== tasks.length) process.exitCode = 1;
