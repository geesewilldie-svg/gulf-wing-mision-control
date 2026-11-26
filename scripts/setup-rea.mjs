import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { setupRea } from "./rea-setup-lib.mjs";
import { reaTarget } from "./rea-target.mjs";
const source = fileURLToPath(new URL("./rea-runtime/", import.meta.url));
const root = path.resolve(
  process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
);
const tools = path.join(root, "tools"),
  target = path.join(tools, "rea"),
  cache = path.join(tools, "rea-npm-cache");
let lockBytes, lockHash, owned;
async function directory(name, create = false) {
  if (create) await fs.mkdir(name, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(name);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw Error(
      "Managed REA directory is unsafe; existing paths were preserved.",
    );
  return stat;
}
async function readFile(name, limit) {
  const stat = await fs.lstat(name);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit)
    throw Error("Unsupported isolated REA file.");
  const handle = await fs.open(name, "r");
  try {
    const opened = await handle.stat();
    if (
      opened.ino !== stat.ino ||
      opened.dev !== stat.dev ||
      opened.size > limit
    )
      throw Error("REA file changed during verification.");
    const bytes = Buffer.alloc(limit + 1),
      result = await handle.read(bytes, 0, bytes.length, 0);
    if (result.bytesRead > limit) throw Error("REA file exceeds limit.");
    return bytes.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function verify() {
  await directory(target);
  await directory(path.join(target, "node_modules"));
  await directory(path.join(target, "node_modules", "rea-agents"));
  await directory(path.join(target, "node_modules", "rea-agents", "scripts"));
  if (
    hash(await readFile(path.join(target, "package-lock.json"), 500000)) !==
    lockHash
  )
    throw Error("Installed REA lock changed. No tool was enabled.");
  const pkg = JSON.parse(
    (
      await readFile(
        path.join(target, "node_modules", "rea-agents", "package.json"),
        64000,
      )
    ).toString("utf8"),
  );
  if (
    pkg.name !== reaTarget.package ||
    pkg.version !== reaTarget.version ||
    pkg.engines?.node !== reaTarget.engines
  )
    throw Error("Installed REA metadata does not match the pinned package.");
  await readFile(
    path.join(target, "node_modules", "rea-agents", "scripts", "rea.mjs"),
    256000,
  );
  const packageRoot = path.join(target, "node_modules", "rea-agents");
  for (const [folder, name] of [
    ["mcp", "main.js"],
    ["cli-runtime", "cliBuiltinArguments.js"],
  ]) {
    await directory(path.join(packageRoot, "dist"));
    await directory(path.join(packageRoot, "dist", folder));
    const stat = await fs.lstat(path.join(packageRoot, "dist", folder, name));
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size === 0 ||
      stat.size > 50000000
    )
      throw Error(
        "Pinned REA compiled entry is unavailable; no tool was enabled.",
      );
  }
}
async function npmCi() {
  const candidates = [
    path.join(
      path.dirname(process.execPath),
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    ),
    path.resolve(
      path.dirname(process.execPath),
      "../lib/node_modules/npm/bin/npm-cli.js",
    ),
  ];
  let cli;
  for (const candidate of candidates) {
    try {
      if ((await fs.stat(candidate)).isFile()) {
        cli = candidate;
        break;
      }
    } catch {}
  }
  if (!cli)
    throw Error(
      "The npm CLI beside this Node installation is unavailable. No alternate executable was started.",
    );
  await directory(cache, true);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/^npm_config_|^(NODE_OPTIONS|NODE_PATH|NPM_TOKEN|NODE_AUTH_TOKEN)$/i.test(
          key,
        ),
    ),
  );
  const args = [
    cli,
    "ci",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--engine-strict=true",
    "--registry=https://registry.npmjs.org",
    "--cache",
    cache,
    "--userconfig",
    path.join(target, ".npmrc"),
    "--globalconfig",
    path.join(target, ".npmrc-global"),
  ];
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: target,
      env,
      stdio: "inherit",
      windowsHide: true,
      timeout: 600000,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(
            Error(
              `Isolated npm install stopped (${signal || code}). Partial tool files are retained; no REA process or agent setup was run.`,
            ),
          ),
    );
  });
}
try {
  console.log(
    "Nexus isolated REA package staging — no REA CLI/MCP/setup execution.",
  );
  const result = await setupRea({
    nodeVersion: process.version,
    async readLock() {
      lockBytes = await readFile(
        path.join(source, "package-lock.json"),
        500000,
      );
      lockHash = hash(lockBytes);
      return JSON.parse(lockBytes.toString("utf8"));
    },
    async withLock(run) {
      await directory(root, true);
      await directory(tools, true);
      const filename = path.join(tools, "rea-install.lock");
      const lock = await fs.open(filename, "wx", 0o600);
      try {
        return await run();
      } finally {
        await lock.close();
        await fs.rm(filename, { force: true });
      }
    },
    async exists() {
      try {
        await fs.lstat(target);
        return true;
      } catch (error) {
        if (error.code === "ENOENT") return false;
        throw error;
      }
    },
    async verifyExisting() {
      await verify();
      const receipt = JSON.parse(
        (
          await readFile(path.join(target, ".nexus-rea-install.json"), 5000)
        ).toString("utf8"),
      );
      if (
        receipt.state !== "staged" ||
        receipt.lockSha256 !== lockHash ||
        receipt.archiveIntegrity !== reaTarget.archiveIntegrity
      )
        throw Error(
          "Existing/partial REA location was preserved; installation was not replayed.",
        );
    },
    async reserve() {
      await fs.mkdir(target, { mode: 0o700 });
      owned = await directory(target);
      await fs.writeFile(
        path.join(target, ".nexus-rea-install.json"),
        JSON.stringify({
          state: "preparing",
          id: randomUUID(),
          at: new Date().toISOString(),
        }),
        { flag: "wx", mode: 0o600 },
      );
    },
    async copyInputs() {
      await fs.writeFile(
        path.join(target, "package.json"),
        await readFile(path.join(source, "package.json"), 5000),
        { flag: "wx", mode: 0o600 },
      );
      await fs.writeFile(path.join(target, "package-lock.json"), lockBytes, {
        flag: "wx",
        mode: 0o600,
      });
      await fs.writeFile(
        path.join(target, ".npmrc"),
        "registry=https://registry.npmjs.org\nignore-scripts=true\naudit=false\nfund=false\n",
        { flag: "wx", mode: 0o600 },
      );
      await fs.writeFile(
        path.join(target, ".npmrc-global"),
        "# isolated Nexus tool configuration\n",
        { flag: "wx", mode: 0o600 },
      );
    },
    install: npmCi,
    async verifyInstalled() {
      const current = await directory(target);
      if (
        current.ino !== owned.ino ||
        current.dev !== owned.dev ||
        current.birthtimeMs !== owned.birthtimeMs
      )
        throw Error("REA directory changed; no ready record was written.");
      await verify();
    },
    async record() {
      const filename = path.join(target, ".nexus-rea-install.json"),
        temporary = path.join(target, randomUUID() + ".tmp");
      await fs.writeFile(
        temporary,
        JSON.stringify({
          state: "staged",
          version: 1,
          package: reaTarget.package,
          packageVersion: reaTarget.version,
          archiveIntegrity: reaTarget.archiveIntegrity,
          lockSha256: lockHash,
          at: new Date().toISOString(),
          lifecycleScripts: false,
          reaExecuted: false,
        }),
        { flag: "wx", mode: 0o600 },
      );
      await fs.rename(temporary, filename);
    },
  });
  console.log(
    `REA ${result.state}: ${reaTarget.version}; ${result.packages} locked packages. No REA setup, agent registration or browser attachment was run. Execution remains unverified.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
