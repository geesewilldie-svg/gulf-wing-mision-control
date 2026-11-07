import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const root = path.resolve(
  process.env.GW_SYNC_DATA_DIR || path.join(project, ".gulf-wing"),
);
const config = path.join(root, "codex-worker.json");
async function save(value) {
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const temp = config + ".tmp";
  await fs.writeFile(temp, JSON.stringify(value), { mode: 0o600 });
  await fs.rename(temp, config);
}
async function run(file, args, env = process.env) {
  await new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      shell: false,
      stdio: "inherit",
      env,
      windowsHide: false,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(Error("Local setup command failed. No worker was enabled.")),
    );
  });
}
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((a) => a !== "--disable"))
    throw Error("Supported option: --disable");
  if (args.includes("--disable")) {
    let old;
    try {
      old = JSON.parse(await fs.readFile(config, "utf8"));
    } catch {
      console.log("No local coding worker is enabled.");
      process.exit(0);
    }
    await save({ ...old, enabled: false });
    console.log(
      "Worker disabled. Active attempts will be asked to stop; inspect any interrupted run before retrying.",
    );
    process.exit(0);
  }
  if (process.platform !== "win32")
    throw Error(
      "Run this installer on the Windows laptop. No account connection was made.",
    );
  const cliRoot = path.join(root, "codex-cli"),
    entrypoint = path.join(
      cliRoot,
      "node_modules",
      "@openai",
      "codex",
      "bin",
      "codex.js",
    );
  await save({ version: 1, enabled: false, entrypoint });
  const npm = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  await fs.access(npm);
  console.log(
    "Installing official @openai/codex 0.163.0 in the private Nexus directory. Existing global tools are not replaced.",
  );
  await run(process.execPath, [
    npm,
    "install",
    "--prefix",
    cliRoot,
    "--no-save",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--registry=https://registry.npmjs.org",
    "@openai/codex@0.163.0",
  ]);
  const home = path.join(root, "codex-worker-home");
  await fs.mkdir(home, { recursive: true, mode: 0o700 });
  // Authentication is handled by the official CLI, not by Nexus forms or chat.
  const env = { ...process.env, CODEX_HOME: home };
  delete env.OPENAI_API_KEY;
  delete env.CODEX_API_KEY;
  console.log(
    "Sign in with your existing ChatGPT account in the browser. Do not paste keys or login codes into chat. Account quota/terms apply; no API-key fallback is enabled.",
  );
  await run(
    process.execPath,
    [entrypoint, "-c", 'forced_login_method="chatgpt"', "login"],
    env,
  );
  await save({ version: 1, enabled: true, entrypoint });
  console.log(
    "Codex worker locally enabled. In Nexus Foundation, check worker readiness. Each cloud attempt still requires explicit task-objective sharing consent.",
  );
  console.log(
    "Candidates are not executed, promoted, merged or deployed. Disable-Nexus-Codex.cmd revokes future runs.",
  );
} catch {
  console.error(
    "Setup did not complete; the worker remains disabled. Check Node/npm installation, network and ChatGPT sign-in on this laptop. No secrets are needed in chat.",
  );
  process.exitCode = 1;
}
