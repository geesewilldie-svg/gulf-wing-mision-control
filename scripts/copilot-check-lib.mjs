import { parse as parseJsonc } from "jsonc-parser";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execFile } from "node:child_process";
import {
  copilotProfileEnvironment,
  verifyCopilotEntrypoint,
  COPILOT_VERSION,
} from "./copilot-profile-lib.mjs";
export const COPILOT_TEST_PROMPT =
  "Reply with exactly NEXUS_COPILOT_OK and nothing else. Do not use tools.";
export function copilotTestArguments(entrypoint) {
  return [
    entrypoint,
    "--no-auto-update",
    "--no-custom-instructions",
    "--disable-builtin-mcps",
    "--no-ask-user",
    "--disallow-temp-dir",
    "--disable-client-telemetry",
    "--no-experimental",
    "--sync-session=off",
    "--log-level",
    "none",
    "--available-tools",
    "--deny-tool",
    "read",
    "write",
    "shell",
    "memory",
    "url",
    "--max-ai-credits",
    "1",
    "--output-format",
    "text",
    "--stream",
    "off",
    "--silent",
    "--prompt",
    COPILOT_TEST_PROMPT,
  ];
}
async function inspectProfile(profile) {
  for (const name of [
    "settings.json",
    "mcp-config.json",
    "providers.json",
    "hooks",
    "plugins",
    "skills",
    "agents",
  ]) {
    try {
      await fs.lstat(path.join(profile, name));
      throw Error(
        "Isolated profile contains additional settings or extensions. Test withheld; existing files were preserved.",
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  let config;
  try {
    const file = path.join(profile, "config.json");
    if ((await fs.stat(file)).size > 100000) throw Error();
    /** @type {import("jsonc-parser").ParseError[]} */
    const errors = [];
    const text = await fs.readFile(file, "utf8");
    config = parseJsonc(text.replace(/^\uFEFF/, ""), errors, {
      allowTrailingComma: true,
      disallowComments: false,
    });
    if (
      errors.length ||
      !config ||
      typeof config !== "object" ||
      Array.isArray(config)
    )
      throw Error("Invalid settings object");
  } catch (error) {
    if (error.code !== "ENOENT")
      throw Error(
        "Isolated profile settings cannot be validated. No test was sent.",
      );
  }
  function check(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      const empty =
        entry === false ||
        entry === null ||
        entry === "" ||
        (Array.isArray(entry) && !entry.length) ||
        (typeof entry === "object" &&
          entry !== null &&
          !Object.keys(entry).length);
      if (
        /hooks|mcp|plugin|skill|allow|trust|provider|instruction|command|memory|agent|tool|extension|experimental|permission/i.test(
          key,
        ) &&
        !empty
      )
        throw Error(
          "Isolated profile has execution-related configuration. Test withheld; existing settings were preserved.",
        );
      check(entry);
    }
  }
  check(config);
}
export function runCopilotTestProcess(plan) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, plan.args, {
      cwd: plan.cwd,
      env: plan.env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      bytes = 0,
      done = false,
      failed = false;
    let cleanup;
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(cleanup);
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      error ? reject(error) : resolve(stdout);
    };
    const stop = () => {
      if (failed || done) return;
      failed = true;
      if (child.pid) {
        if (process.platform === "win32")
          execFile(
            path.join(
              plan.env.SystemRoot || plan.env.SYSTEMROOT || "C:\\Windows",
              "System32",
              "taskkill.exe",
            ),
            ["/PID", String(child.pid), "/T", "/F"],
            { timeout: 3000, windowsHide: true },
            () => {},
          );
        else
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }
      }
      cleanup = setTimeout(
        () =>
          finish(
            Error(
              "Test result is unconfirmed; process cleanup could not be confirmed.",
            ),
          ),
        4000,
      );
    };
    const timer = setTimeout(stop, 60000);
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 65536) stop();
      else stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 65536) stop();
    });
    child.once("error", () =>
      finish(
        Error("Copilot test could not start. No automatic retry will occur."),
      ),
    );
    child.once("close", (code) =>
      finish(
        failed || code !== 0
          ? Error(
              "Copilot did not return a confirmed result. Check sign-in, access and quota locally; no automatic retry will occur.",
            )
          : undefined,
      ),
    );
  });
}
export async function checkCopilotAccess({
  dataDir,
  confirmed,
  platform = process.platform,
  now = new Date(),
  run = runCopilotTestProcess,
}) {
  if (confirmed !== true)
    throw Error("Explicit confirmation of the fixed public test is required.");
  if (platform !== "win32")
    throw Error("Run this check on the Windows laptop.");
  const filename = path.join(dataDir, "copilot-adapter.json");
  if ((await fs.stat(filename)).size > 20000)
    throw Error("Copilot setup is unavailable.");
  const config = JSON.parse(await fs.readFile(filename, "utf8"));
  if (
    config.version !== 1 ||
    config.stage !== "prepared" ||
    config.cliVersion !== COPILOT_VERSION
  )
    throw Error("Prepare the pinned Copilot profile first.");
  const entrypoint = await verifyCopilotEntrypoint(config.entrypoint);
  await inspectProfile(path.join(dataDir, "copilot-profile"));
  const day = now.toISOString().slice(0, 10),
    receiptFile = path.join(dataDir, `copilot-access-check-${day}.json`);
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-copilot-test-"));
  try {
    try {
      await fs.writeFile(
        receiptFile,
        JSON.stringify({
          version: 1,
          at: now.toISOString(),
          state: "unconfirmed",
          detail:
            "A fixed public test was reserved. Do not automatically repeat it.",
        }),
        { flag: "wx", mode: 0o600 },
      );
    } catch (error) {
      if (error.code === "EEXIST")
        throw Error(
          "A test is already reserved for today (UTC). Inspect its saved receipt; it will not be repeated.",
        );
      throw error;
    }
    // Anything after reservation can have consumed provider usage, even if no reply arrives.
    let receipt;
    try {
      await verifyCopilotEntrypoint(config.entrypoint);
      await inspectProfile(path.join(dataDir, "copilot-profile"));
      const output = await run({
        args: copilotTestArguments(entrypoint),
        cwd,
        env: copilotProfileEnvironment(dataDir),
      });
      const matched =
        typeof output === "string" && output.trim() === "NEXUS_COPILOT_OK";
      receipt = {
        version: 1,
        at: now.toISOString(),
        state: matched ? "verified" : "unexpected-reply",
        detail: matched
          ? "Fixed public reply matched. This does not verify tools, private-context access or general Nexus routing."
          : "Reply did not match the fixed test. Output was withheld; do not automatically retry.",
      };
    } catch {
      receipt = {
        version: 1,
        at: now.toISOString(),
        state: "unconfirmed",
        detail:
          "No confirmed test result. Account access or quota may have failed; usage may have occurred. Do not automatically retry.",
      };
    }
    await fs.writeFile(receiptFile, JSON.stringify(receipt), { mode: 0o600 });
    return receipt;
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
}
