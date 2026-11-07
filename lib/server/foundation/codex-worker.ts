import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { candidateSchema, validateCandidate } from "../../foundation/candidate";
import type { NexusTask } from "../../foundation/contracts";
import {
  commandFor,
  workerEnvironment,
  runProcess,
  WorkerProcessError,
} from "./codex-process";
import {
  workerProcessId,
  beginWorkerRun,
  updateWorkerRun,
  stillCurrent,
} from "./store";
import { SyncError } from "../sync-store";
const root = () =>
  path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
  );
export const codexHome = () => path.join(root(), "codex-worker-home");
async function configuration() {
  try {
    const v = JSON.parse(
      await fs.readFile(path.join(root(), "codex-worker.json"), "utf8"),
    );
    if (
      v.version !== 1 ||
      typeof v.enabled !== "boolean" ||
      typeof v.entrypoint !== "string"
    )
      throw Error();
    commandFor(v.entrypoint);
    return v as { version: 1; enabled: boolean; entrypoint: string };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new SyncError(
      503,
      "Local Codex worker configuration cannot be read.",
    );
  }
}
export async function codexWorkerStatus(
  signal: AbortSignal = AbortSignal.timeout(15000),
) {
  const c = await configuration();
  if (!c?.enabled)
    return {
      enabled: false,
      ready: false,
      state: "disabled",
      detail:
        "Run Setup-Nexus-Codex.cmd locally to install the pinned CLI and sign in with ChatGPT.",
    };
  try {
    const cmd = commandFor(c.entrypoint),
      env = workerEnvironment(codexHome()),
      opts = { cwd: root(), env, signal, timeout: 10000 };
    const version = await runProcess(cmd, ["--version"], opts);
    const m = version.match(/codex-cli (\d+)\.(\d+)\.(\d+)/);
    if (!m || m.slice(1).join(".") !== "0.163.0") throw Error();
    const help = await runProcess(cmd, ["exec", "--help"], opts);
    for (const flag of [
      "--ignore-user-config",
      "--ignore-rules",
      "--ephemeral",
      "--output-schema",
    ])
      if (!help.includes(flag)) throw Error();
    const login = await runProcess(
      cmd,
      ["-c", 'forced_login_method="chatgpt"', "login", "status"],
      opts,
    );
    if (
      !/logged in using chatgpt/i.test(login) ||
      /using an? api key/i.test(login)
    )
      return {
        enabled: true,
        ready: false,
        state: "needs-sign-in",
        detail:
          "A ChatGPT sign-in in the dedicated Nexus Codex home is required. API-key fallback is disabled.",
      };
    return {
      enabled: true,
      ready: true,
      state: "ready",
      detail:
        "Compatible CLI and ChatGPT sign-in detected; quota and model availability are checked when used.",
    };
  } catch {
    return {
      enabled: true,
      ready: false,
      state: "unavailable",
      detail:
        "Codex CLI/sign-in is not ready or compatible. Rerun local setup; no API fallback was used.",
    };
  }
}
export function codexArguments(workspace: string) {
  return [
    "-c",
    'approval_policy="never"',
    "-c",
    'forced_login_method="chatgpt"',
    "-c",
    'model_provider="openai"',
    "-c",
    'web_search="disabled"',
    "-c",
    "mcp_servers={}",
    "-c",
    "project_doc_max_bytes=0",
    "-c",
    "skills.include_instructions=false",
    "-c",
    "skills.bundled.enabled=false",
    "exec",
    "--ignore-user-config",
    "--ignore-rules",
    "--ephemeral",
    "--sandbox",
    "read-only",
    ...[
      "shell_tool",
      "unified_exec",
      "apps",
      "plugins",
      "multi_agent",
      "skill_mcp_dependency_install",
      "skill_search",
    ].flatMap((f) => ["--disable", f]),
    "--json",
    "--color",
    "never",
    "--skip-git-repo-check",
    "--cd",
    workspace,
    "--output-schema",
    path.join(workspace, "candidate-schema.json"),
    "--output-last-message",
    path.join(workspace, "candidate.json"),
    "-",
  ];
}
export async function runCodexWorker(t: NexusTask, signal: AbortSignal) {
  const status = await codexWorkerStatus(signal);
  if (!status.ready) throw new SyncError(409, status.detail);
  signal.throwIfAborted();
  if (!stillCurrent(t))
    throw new SyncError(409, "Task or policy changed before worker dispatch.");
  const c = (await configuration())!;
  const runId = beginWorkerRun(t),
    workspace = path.join(root(), "development-workspaces", runId);
  let started = false;
  const abort = new AbortController();
  const cancel = () => abort.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const monitor = setInterval(() => {
    void configuration()
      .then((v) => {
        if (!v?.enabled) abort.abort();
      })
      .catch(() => abort.abort());
  }, 1000);
  try {
    await fs.mkdir(workspace, { recursive: true, mode: 0o700 });
    await fs.writeFile(
      path.join(workspace, "candidate-schema.json"),
      JSON.stringify(candidateSchema),
      { flag: "wx", mode: 0o600 },
    );
    // Establish an empty repository boundary so Codex cannot discover the live
    // project's Git/AGENTS context from ancestor directories.
    const emptyConfig = path.join(workspace, "empty-git-config");
    await fs.writeFile(emptyConfig, "", { flag: "wx", mode: 0o600 });
    await runProcess(
      { file: "git", prefix: [] },
      ["init", "--template=", "--initial-branch=nexus-candidate", workspace],
      {
        cwd: workspace,
        env: {
          ...workerEnvironment(codexHome()),
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: emptyConfig,
        },
        signal: abort.signal,
        timeout: 10000,
      },
    );
    if (signal.aborted) abort.abort();
    if (abort.signal.aborted) throw new WorkerProcessError("aborted");
    updateWorkerRun(
      runId,
      "running",
      "Codex is authoring a candidate. Raw provider output is not retained.",
    );
    started = true;
    await runProcess(commandFor(c.entrypoint), codexArguments(workspace), {
      cwd: workspace,
      env: {
        ...workerEnvironment(codexHome()),
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: emptyConfig,
      },
      signal: abort.signal,
      capture: false,
      onSpawn: (pid) => workerProcessId(runId, pid),
      input: JSON.stringify({
        identity: "Nexus coding worker",
        objective: t.request,
        scope: t.scope,
        contract:
          "Return code candidates only in the required JSON schema. No tools, shell commands, web search, account access, installation or deployment. Do not claim tests ran. Paths must be under src/, tests/ or docs/. Keep total JSON under 30000 UTF-8 bytes. This is an empty candidate workspace; no existing project code or owner memory is supplied.",
      }),
      onLine: (line) => {
        let e;
        try {
          e = JSON.parse(line);
        } catch {
          throw Error("Invalid progress protocol");
        }
        if (
          [
            "thread.started",
            "turn.started",
            "item.started",
            "item.completed",
            "turn.completed",
          ].includes(e.type)
        )
          updateWorkerRun(
            runId,
            "running",
            "Codex progress event received; output remains unverified.",
            true,
          );
      },
    });
    if (
      abort.signal.aborted ||
      !stillCurrent(t) ||
      !(await configuration())?.enabled
    )
      throw new WorkerProcessError("aborted");
    updateWorkerRun(
      runId,
      "validating",
      "Validating candidate structure and relative file paths. Code/tests are not executed.",
    );
    const file = path.join(workspace, "candidate.json");
    const info = await fs.lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 32000)
      throw Error("Candidate file is invalid.");
    const candidate = validateCandidate(
      JSON.parse(await fs.readFile(file, "utf8")),
    );
    const artifact = {
      schemaVersion: 1,
      runId,
      parentTaskId: t.id,
      provider: "Codex via ChatGPT sign-in",
      candidate,
      validation: {
        schema: "passed",
        paths: "passed",
        codeExecution: "not-run",
        tests: "not-run",
        deployment: "not-run",
        promotion: "not-approved",
      },
      sha256: createHash("sha256")
        .update(JSON.stringify(candidate))
        .digest("hex"),
    };
    updateWorkerRun(
      runId,
      "candidate-ready",
      "Candidate structurally validated. Human review and independent tests are still required.",
    );
    return JSON.stringify(artifact, null, 2);
  } catch (e) {
    const unknown =
      e instanceof WorkerProcessError && e.kind === "cleanup-uncertain";
    updateWorkerRun(
      runId,
      unknown
        ? "interrupted"
        : signal.aborted || abort.signal.aborted
          ? "cancelled"
          : "failed",
      unknown
        ? "Child process termination unverified. Confirm it stopped before another cloud attempt."
        : started
          ? "Worker stopped or failed; candidate was not promoted. Check CLI sign-in/quota locally."
          : "Worker preparation failed; no candidate was promoted.",
    );
    throw new SyncError(
      503,
      unknown
        ? "Worker termination is uncertain; review the interrupted run."
        : "Coding worker failed or was cancelled. No code was executed or applied.",
    );
  } finally {
    clearInterval(monitor);
    signal.removeEventListener("abort", cancel);
  }
}

export async function codexWorkerEnabled() {
  return !!(await configuration())?.enabled;
}
