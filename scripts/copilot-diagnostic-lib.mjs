import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  copilotProfileEnvironment,
  verifyCopilotEntrypoint,
  COPILOT_VERSION,
} from "./copilot-profile-lib.mjs";
import {
  inspectProfile,
  runCopilotTestProcess,
  copilotFailureCategories,
} from "./copilot-check-lib.mjs";

export async function diagnoseCopilot({
  dataDir,
  platform = process.platform,
  run = runCopilotTestProcess,
  now = new Date(),
}) {
  if (platform !== "win32")
    throw Error("Run this diagnostic on the Windows laptop.");
  const configFile = path.join(dataDir, "copilot-adapter.json");
  if ((await fs.stat(configFile)).size > 20000)
    throw Error("Prepared configuration unavailable.");
  const config = JSON.parse(await fs.readFile(configFile, "utf8"));
  if (
    config.version !== 1 ||
    config.stage !== "prepared" ||
    config.cliVersion !== COPILOT_VERSION
  )
    throw Error("Pinned preparation is required.");
  const entry = await verifyCopilotEntrypoint(config.entrypoint);
  await inspectProfile(path.join(dataDir, "copilot-profile"));
  const cwd = await fs.mkdtemp(
    path.join(os.tmpdir(), "nexus-copilot-diagnostic-"),
  );
  const env = copilotProfileEnvironment(dataDir);
  const results = {
    profile: "validated",
    version: "unconfirmed",
    help: "unconfirmed",
    reservation: "none saved today",
    priorCategory: "not recorded",
    modelRequest: "not sent",
  };
  try {
    for (const mode of ["version", "help"]) {
      try {
        const text = await run({
          args: [entry, "--no-auto-update", `--${mode}`],
          cwd,
          env,
        });
        results[mode] =
          mode === "version"
            ? typeof text === "string" &&
              text.includes(`GitHub Copilot CLI ${COPILOT_VERSION}`)
              ? "pinned version confirmed"
              : "version not confirmed"
            : typeof text === "string" &&
                [
                  "--available-tools",
                  "--deny-tool",
                  "--disable-builtin-mcps",
                  "--no-custom-instructions",
                  "--max-ai-credits",
                  "--sync-session",
                ].every((flag) => text.includes(flag))
              ? "restriction flags advertised"
              : "required help flags missing";
      } catch (error) {
        results[mode] = copilotFailureCategories.includes(error?.category)
          ? error.category
          : "local process failed";
      }
    }
    const file = path.join(
      dataDir,
      `copilot-access-check-${now.toISOString().slice(0, 10)}.json`,
    );
    try {
      if ((await fs.stat(file)).size > 10000) throw Error();
      const saved = JSON.parse(await fs.readFile(file, "utf8"));
      results.reservation = [
        "verified",
        "unconfirmed",
        "unexpected-reply",
      ].includes(saved.state)
        ? saved.state
        : "unrecognized saved state";
      results.priorCategory = copilotFailureCategories.includes(saved.category)
        ? saved.category
        : "not recorded; earlier diagnostics cannot be recovered";
    } catch (error) {
      if (error.code !== "ENOENT")
        results.reservation = "saved receipt could not be read";
    }
    return results;
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
}
