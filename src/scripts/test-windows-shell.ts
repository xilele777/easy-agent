#!/usr/bin/env tsx

import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { executeHookCommand } from "../hooks/executor.js";
import { loadHooksSettings } from "../hooks/settings.js";
import { resolveApiKeyFromHelper } from "../services/api/apiKeyHelper.js";
import { bashTool } from "../tools/bashTool.js";
import { powerShellTool } from "../tools/powerShellTool.js";
import { getUserSettingsPath } from "../utils/paths.js";

async function waitForPid(file: string): Promise<number> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const pid = Number(await fs.readFile(file, "utf8"));
      if (Number.isSafeInteger(pid) && pid > 0) return pid;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for child PID in ${file}`);
}

async function processAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

async function waitForProcessExit(pid: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!(await processAlive(pid))) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`PowerShell child process ${pid} survived cancellation`);
}

if (process.platform !== "win32") {
  process.stdout.write("Windows shell checks skipped on this platform.\n");
} else {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "easy-agent-windows-shell-"));
  const home = path.join(root, "home");
  const cwd = path.join(root, "workspace");
  const oldEnv = { ...process.env };
  try {
    await fs.mkdir(home);
    await fs.mkdir(cwd);
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    process.env.APPDATA = path.join(home, "AppData", "Roaming");
    process.env.LOCALAPPDATA = path.join(home, "AppData", "Local");
    delete process.env.SHELL;
    delete process.env.EASY_AGENT_POWERSHELL;

    const hookInput = {
      hook_event_name: "UserPromptSubmit" as const,
      session_id: "test",
      cwd,
      prompt: "hello",
    };
    const hook = await executeHookCommand({
      hook: { type: "command", command: "[Console]::Out.Write([Console]::In.ReadToEnd())" },
      hookEvent: "UserPromptSubmit",
      hookName: "native-hook",
      hookInput,
      cwd,
    });
    assert.equal(hook.outcome, "success");
    assert.deepEqual(JSON.parse(hook.stdout), hookInput);

    const native = await powerShellTool.call({ command: "Write-Output native-shell" }, { cwd });
    assert.notEqual(native.isError, true);
    assert.match(String(native.content), /native-shell/);

    const childMarker = path.join(cwd, "powershell-child.pid");
    const quotedMarker = childMarker.replace(/'/g, "''");
    const controller = new AbortController();
    const running = powerShellTool.call({
      command:
        "$child = Start-Process -FilePath powershell.exe " +
        "-ArgumentList @('-NoProfile','-NonInteractive','-Command','Start-Sleep -Seconds 30') " +
        "-PassThru -WindowStyle Hidden; " +
        `[System.IO.File]::WriteAllText('${quotedMarker}', [string]$child.Id); ` +
        "Start-Sleep -Seconds 30",
      timeout: 10_000,
    }, { cwd, abortSignal: controller.signal });
    let childPid = 0;
    try {
      childPid = await waitForPid(childMarker);
    } finally {
      controller.abort();
    }
    const stopped = await running;
    assert.equal(stopped.isError, true);
    assert.match(String(stopped.content), /Command aborted/);
    try {
      await waitForProcessExit(childPid);
    } finally {
      if (await processAlive(childPid)) process.kill(childPid);
    }

    const settingsFile = getUserSettingsPath();
    await fs.mkdir(path.dirname(settingsFile), { recursive: true });
    await fs.writeFile(settingsFile, JSON.stringify({
      apiKeyHelper: "echo helper-token",
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: "command", shell: "powershell", command: "Write-Output configured-hook" }] }],
      },
    }));
    assert.equal(await resolveApiKeyFromHelper(cwd), "helper-token");
    const configuredHook = (await loadHooksSettings(cwd)).UserPromptSubmit?.[0]?.hooks[0];
    assert.equal(configuredHook?.shell, "powershell");
    const configuredResult = await executeHookCommand({
      hook: configuredHook,
      hookEvent: "UserPromptSubmit",
      hookName: "configured-hook",
      hookInput,
      cwd,
    });
    assert.equal(configuredResult.outcome, "success");
    assert.match(configuredResult.stdout, /configured-hook/);

    process.env.EASY_AGENT_POWERSHELL = "missing-easy-agent-powershell.exe";
    const missingHook = await executeHookCommand({
      hook: { type: "command", command: "Write-Output ignored", shell: "powershell" },
      hookEvent: "UserPromptSubmit",
      hookName: "missing-shell",
      hookInput,
      cwd,
    });
    assert.equal(missingHook.outcome, "non_blocking_error");
    assert.match(missingHook.stderr, /Install the shell or set hook\.shell/);

    process.env.SHELL = "missing-easy-agent-bash.exe";
    const missingBash = await bashTool.call({ command: "echo ignored" }, { cwd });
    assert.equal(missingBash.isError, true);
    assert.match(String(missingBash.content), /use the PowerShell tool/);

    process.stdout.write("Windows PowerShell, cancellation, hooks, helper and shell diagnostics passed.\n");
  } finally {
    for (const key of ["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "SHELL", "EASY_AGENT_POWERSHELL"] as const) {
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
    }
    await fs.rm(root, { recursive: true, force: true });
  }
}
