#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QueryEngine, type QueryEngineEvent } from "../core/queryEngine.js";
import { getFlagSettings, setFlagSettings } from "../config/sources.js";
import { resetGlobalStateCache } from "../config/globalState.js";
import { configureFileHistory } from "../session/fileHistory.js";
import { initSessionStorage } from "../session/storage.js";

type ScriptedTurn =
  | { type: "tool"; name: string; input: Record<string, unknown> }
  | { type: "text"; text: string };

const model = "workflow-fixture";
const originalFetch = globalThis.fetch;
const originalFlags = getFlagSettings();
const savedEnv = new Map(
  ["HOME", "USERPROFILE", "ANTHROPIC_AUTH_TOKEN", "EASY_AGENT_DISABLE_HOOKS", "EASY_AGENT_ENABLE_TOOL_SEARCH"]
    .map((key) => [key, process.env[key]] as const),
);
const root = await mkdtemp(join(tmpdir(), "easy-agent-workflow-"));
const cwd = join(root, "project");
const home = join(root, "home");
const file = join(cwd, "example.txt");
const initial = "ALPHA\n";
const changed = "BETA\n";
const script: ScriptedTurn[] = [
  { type: "tool", name: "Grep", input: { path: ".", pattern: "ALPHA" } },
  { type: "text", text: "The example contains ALPHA." },
  { type: "tool", name: "Write", input: { file_path: file, content: changed } },
  { type: "text", text: "The plan-mode edit was rejected." },
  { type: "tool", name: "Write", input: { file_path: file, content: changed } },
  { type: "text", text: "The approved edit is complete." },
];
let requestCount = 0;
let permissionRequests = 0;
const requestBodies: string[] = [];

function event(type: string, value: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(value)}\n\n`;
}

function streamedResponse(turn: ScriptedTurn): string {
  requestCount += 1;
  const isTool = turn.type === "tool";
  const content = isTool
    ? { type: "tool_use", id: `workflow-tool-${requestCount}`, name: turn.name, input: {} }
    : { type: "text", text: "" };
  const delta = isTool
    ? { type: "input_json_delta", partial_json: JSON.stringify(turn.input) }
    : { type: "text_delta", text: turn.text };
  return [
    event("message_start", { type: "message_start", message: {
      id: `workflow-message-${requestCount}`, type: "message", role: "assistant", model,
      content: [], stop_reason: null, stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 0 },
    } }),
    event("content_block_start", { type: "content_block_start", index: 0, content_block: content }),
    event("content_block_delta", { type: "content_block_delta", index: 0, delta }),
    event("content_block_stop", { type: "content_block_stop", index: 0 }),
    event("message_delta", { type: "message_delta", delta: {
      stop_reason: isTool ? "tool_use" : "end_turn", stop_sequence: null,
    }, usage: { output_tokens: 10 } }),
    event("message_stop", { type: "message_stop" }),
  ].join("");
}

async function drive(engine: QueryEngine, input: string): Promise<QueryEngineEvent[]> {
  const events: QueryEngineEvent[] = [];
  for await (const item of engine.submitMessage(input)) events.push(item);
  return events;
}

try {
  await mkdir(cwd);
  await mkdir(home);
  await writeFile(file, initial);
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["config", "core.autocrlf", "false"], { cwd });
  execFileSync("git", ["add", "example.txt"], { cwd });
  execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "baseline"], { cwd });

  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.ANTHROPIC_AUTH_TOKEN = "fixture-token";
  process.env.EASY_AGENT_DISABLE_HOOKS = "1";
  process.env.EASY_AGENT_ENABLE_TOOL_SEARCH = "false";
  resetGlobalStateCache();
  setFlagSettings({ models: { [model]: {
    protocol: "anthropic", model: "claude-sonnet-4-5", baseURL: "https://workflow.invalid", apiKey: "fixture-token",
  } } });
  await configureFileHistory(cwd, "workflow-session");
  await initSessionStorage({
    sessionId: "workflow-session", cwd, model, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    assert.equal(request.url.startsWith("https://workflow.invalid"), true);
    const body = JSON.parse(await request.text()) as { stream?: boolean };
    assert.equal(body.stream, true);
    requestBodies.push(JSON.stringify(body));
    const turn = script.shift();
    assert.ok(turn, "The model requested more turns than the fixture defines");
    return new Response(streamedResponse(turn), { headers: { "content-type": "text/event-stream" } });
  }) as typeof fetch;

  const engine = new QueryEngine({
    model,
    toolContext: { cwd, sessionId: "workflow-session" },
    permissionMode: "default",
    permissionSettings: { allow: [], deny: [], mode: "default" },
    onPermissionRequest: async (request) => {
      assert.equal(request.toolName, "Write");
      permissionRequests += 1;
      return "allow_once";
    },
  });

  await drive(engine, "/mode plan");
  assert.equal(engine.getPermissionMode(), "plan");
  const search = await drive(engine, "Find ALPHA in this project.");
  assert.ok(search.some((item) => item.type === "tool_use_start" && item.name === "Grep"));
  assert.match(JSON.stringify(search), /ALPHA/);
  assert.equal(await readFile(file, "utf8"), initial);

  await drive(engine, "Try to write BETA while in plan mode.");
  assert.equal(await readFile(file, "utf8"), initial);
  assert.equal(permissionRequests, 0, "Plan mode must deny writes without prompting");

  await drive(engine, "/mode default");
  assert.equal(engine.getPermissionMode(), "default");
  await drive(engine, "Write BETA to example.txt.");
  assert.equal(permissionRequests, 1, "The write must request approval");
  assert.equal(await readFile(file, "utf8"), changed);

  const diff = await drive(engine, "/diff");
  const diffView = diff.find((item) => item.type === "diff_view");
  assert.ok(diffView && diffView.type === "diff_view");
  assert.equal(diffView.data.isRepo, true);
  assert.ok(diffView.data.files.some((item) => item.path.endsWith("example.txt")));

  const rewind = await drive(engine, "/rewind");
  assert.match(JSON.stringify(rewind), /Rewound 1 turn/);
  assert.equal(await readFile(file, "utf8"), initial);
  assert.equal(script.length, 0);
  assert.equal(requestCount, 6);
  for (const index of [1, 3, 5]) {
    assert.match(requestBodies[index]!, /"type":"tool_result"/, `Request ${index + 1} must include the prior tool result`);
  }
  process.stdout.write("Offline search, plan, permission, diff and rewind workflow passed.\n");
} finally {
  globalThis.fetch = originalFetch;
  setFlagSettings(originalFlags);
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetGlobalStateCache();
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
