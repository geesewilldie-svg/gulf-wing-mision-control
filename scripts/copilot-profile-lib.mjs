import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
export const COPILOT_VERSION = "1.0.114";
/** @param {string} dataDir
 * @param {Record<string, string | undefined>} source
 * @returns {Record<string, string>}
 */
export function copilotProfileEnvironment(dataDir, source = process.env) {
  const env = {};
  const allowed = new Set([
    "systemroot",
    "windir",
    "comspec",
    "pathext",
    "path",
    "userprofile",
    "appdata",
    "localappdata",
    "temp",
    "tmp",
    "programfiles",
    "programfiles(x86)",
    "programw6432",
  ]);
  for (const [key, value] of Object.entries(source))
    if (allowed.has(key.toLowerCase()) && typeof value === "string")
      env[key] = value;
  return {
    ...env,
    COPILOT_HOME: path.join(dataDir, "copilot-profile"),
    COPILOT_CACHE_HOME: path.join(dataDir, "copilot-cache"),
    COPILOT_ALLOW_ALL: "false",
    COPILOT_ASSISTED_APPROVAL: "false",
    COPILOT_AUTO_UPDATE: "false",
    COPILOT_PLUGIN_DIR_ONLY: "true",
    COPILOT_DISABLE_LOGIN_SHELL_ENV: "true",
    COPILOT_DISABLE_DESKTOP_NOTIFICATIONS: "1",
    COPILOT_TELEMETRY_DISABLED: "true",
    COPILOT_MCP_TOOL_CACHE: "false",
    USE_TGREP: "false",
    NO_COLOR: "1",
  };
}
export async function verifyCopilotEntrypoint(entrypoint) {
  if (
    typeof entrypoint !== "string" ||
    !path.isAbsolute(entrypoint) ||
    path.basename(entrypoint) !== "npm-loader.js"
  )
    throw Error("Select the installed Copilot npm-loader.js entry point.");
  const real = await fs.realpath(entrypoint);
  const stat = await fs.stat(real);
  if (!stat.isFile()) throw Error("Copilot entry point is not a file.");
  const packageFile = path.join(path.dirname(real), "package.json");
  if ((await fs.stat(packageFile)).size > 100000)
    throw Error("Copilot package metadata is oversized.");
  const pkg = JSON.parse(await fs.readFile(packageFile, "utf8"));
  if (
    pkg.name !== "@github/copilot" ||
    pkg.version !== COPILOT_VERSION ||
    pkg.bin?.copilot !== "npm-loader.js"
  )
    throw Error(
      `Expected @github/copilot ${COPILOT_VERSION}. Existing files were not changed.`,
    );
  return real;
}
export async function prepareCopilotProfile(
  dataDir,
  entrypoint,
  platform = process.platform,
) {
  if (platform !== "win32")
    throw Error("Prepare Copilot on the Windows laptop.");
  const verified = await verifyCopilotEntrypoint(entrypoint);
  const filename = path.join(dataDir, "copilot-adapter.json");
  let existing;
  try {
    if ((await fs.stat(filename)).size > 20000) throw Error("Oversized setup");
    existing = JSON.parse(await fs.readFile(filename, "utf8"));
    if (
      existing.version !== 1 ||
      existing.cliVersion !== COPILOT_VERSION ||
      typeof existing.entrypoint !== "string" ||
      existing.stage !== "prepared"
    )
      throw Error("Invalid saved setup");
  } catch (error) {
    if (error.code !== "ENOENT")
      throw Error(
        "Existing Copilot adapter settings cannot be read. They were preserved.",
      );
  }
  if (existing && existing.entrypoint !== verified)
    throw Error(
      "A different Copilot entry point is already prepared. Existing settings were preserved.",
    );
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(path.join(dataDir, "copilot-profile"), {
    recursive: true,
    mode: 0o700,
  });
  await fs.mkdir(path.join(dataDir, "copilot-work"), {
    recursive: true,
    mode: 0o700,
  });
  if (!existing) {
    const temp = filename + "." + randomBytes(8).toString("hex") + ".tmp";
    try {
      await fs.writeFile(
        temp,
        JSON.stringify({
          version: 1,
          cliVersion: COPILOT_VERSION,
          entrypoint: verified,
          stage: "prepared",
        }),
        { flag: "wx", mode: 0o600 },
      );
      await fs.rename(temp, filename);
    } finally {
      await fs.rm(temp, { force: true });
    }
  }
  return {
    entrypoint: verified,
    env: copilotProfileEnvironment(dataDir),
    cwd: path.join(dataDir, "copilot-work"),
  };
}
export async function copilotPreparationStatus(dataDir) {
  let saved = false;
  try {
    const filename = path.join(dataDir, "copilot-adapter.json");
    if ((await fs.stat(filename)).size > 20000) throw Error();
    const value = JSON.parse(await fs.readFile(filename, "utf8"));
    saved = true;
    if (
      value.version !== 1 ||
      value.stage !== "prepared" ||
      value.cliVersion !== COPILOT_VERSION
    )
      throw Error();
    await verifyCopilotEntrypoint(value.entrypoint);
    return { prepared: true, version: COPILOT_VERSION };
  } catch (error) {
    if (error.code === "ENOENT" && !saved)
      return { prepared: false, version: COPILOT_VERSION };
    return {
      prepared: false,
      version: COPILOT_VERSION,
      warning:
        "Copilot preparation needs repair. Existing settings were preserved.",
    };
  }
}
