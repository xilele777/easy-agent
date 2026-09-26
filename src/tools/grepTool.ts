import { execFile, type ExecFileOptions } from "node:child_process";
import { promisify } from "node:util";
import type { Tool, ToolContext, ToolResult } from "./Tool.js";
import { withValidatedWorkspacePath, WorkspacePathError } from "./pathUtils.js";
import { readMergedBooleanSetting } from "../utils/settings.js";

const execFileAsync = promisify(execFile);

interface GrepInput {
  pattern: string;
  path?: string;
  include?: string;
}

type SearchRunner = (
  command: string,
  args: string[],
  options: ExecFileOptions,
) => Promise<{ stdout: string }>;

function isMissingExecutable(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

export async function executeGrepSearch(
  input: GrepInput,
  targetPath: string,
  targetIsDirectory: boolean,
  respectGitignore: boolean,
  run: SearchRunner = execFileAsync,
): Promise<string> {
  const rgArgs = ["-n", "--hidden"];
  if (!respectGitignore) rgArgs.push("--no-ignore");
  if (input.include) rgArgs.push("-g", input.include);
  rgArgs.push("--", input.pattern, targetIsDirectory ? "." : targetPath);

  try {
    const { stdout } = await run("rg", rgArgs, {
      cwd: targetIsDirectory ? targetPath : undefined,
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim();
  } catch (error) {
    if (!isMissingExecutable(error)) throw error;
  }

  try {
    const { stdout } = await run("grep", ["-rIn", "--", input.pattern, targetPath], {
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim();
  } catch (error) {
    if (!isMissingExecutable(error)) throw error;
    throw new Error("Neither rg (ripgrep) nor grep is available on PATH. Install ripgrep or add grep to PATH.");
  }
}

export const grepTool: Tool = {
  name: "Grep",
  searchHint: "search file contents with regex (ripgrep)",
  description: "Search file contents by regex pattern. Prefer this over Bash for code search.",
  inputSchema: {
    type: "object" as const,
    properties: {
      pattern: { type: "string", description: "Regex pattern to search for" },
      path: { type: "string", description: "Directory or file path to search within" },
      include: { type: "string", description: "Optional glob filter, e.g. *.ts" },
    },
    required: ["pattern"],
  },
  async call(rawInput: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const input = rawInput as unknown as GrepInput;
    if (!input.pattern) {
      return { content: "Error: pattern is required", isError: true };
    }

    const respectGitignore = (await readMergedBooleanSetting(context.cwd, "respectGitignore").catch(() => undefined)) !== false;

    try {
      return await withValidatedWorkspacePath(
        input.path ?? ".",
        context.cwd,
        async (targetPath, stats) => {
          const output = await executeGrepSearch(input, targetPath, stats.isDirectory(), respectGitignore);
          return {
            content: output ? output : `No matches found for pattern: ${input.pattern}`,
          };
        }
      );
    } catch (error: unknown) {
      if (error instanceof WorkspacePathError) {
        return { content: `Error: ${error.message}`, isError: true };
      }
      if ((error as { code?: unknown })?.code === 1) {
        return { content: `No matches found for pattern: ${input.pattern}` };
      }
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("code 1")) {
        return { content: `No matches found for pattern: ${input.pattern}` };
      }
      return { content: `Error running grep search: ${message}`, isError: true };
    }
  },
  isReadOnly(): boolean {
    return true;
  },
  isEnabled(): boolean {
    return true;
  },
  isConcurrencySafe(): boolean {
    // Spawns ripgrep as a child process; no shared state. Multiple
    // concurrent searches just stack subprocesses, which the OS handles.
    return true;
  },
};
