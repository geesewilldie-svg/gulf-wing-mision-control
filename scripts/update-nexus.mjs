import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  updateNexus,
  nextServerPattern,
  stopOwnedNextScript,
  sameGeneratedNextEnvironment,
  verifyNexusAssets,
} from "./nexus-update-lib.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const privateDir = path.join(root, ".gulf-wing"),
  lockFile = path.join(privateDir, "update.lock"),
  stateFile = path.join(privateDir, "update-state.json");
const execute = promisify(execFile);
const git = async (...args) =>
  (
    await execute("git.exe", args, {
      cwd: root,
      windowsHide: true,
      timeout: 180000,
      maxBuffer: 256000,
    })
  ).stdout.trim();
const run = (file, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            Error(
              "Update command failed. Inspect the output above; Mission Control may remain stopped.",
            ),
          ),
    );
  });
const free = () =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: 3000 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", (error) => {
      socket.destroy();
      resolve(error.code === "ECONNREFUSED");
    });
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
let lock;
try {
  if (process.platform !== "win32")
    throw Error("Run Update-Nexus.cmd on the Windows laptop.");
  await fs.mkdir(privateDir, { recursive: true, mode: 0o700 });
  lock = await fs.open(lockFile, "wx", 0o600);
  const lockHash = async () =>
    createHash("sha256")
      .update(await fs.readFile(path.join(root, "package-lock.json")))
      .digest("hex");
  await updateNexus({
    log: console.log,
    branch: () => git("branch", "--show-current"),
    dirty: async () => {
      let status = await git("status", "--porcelain", "--untracked-files=no");
      if (
        status === "M next-env.d.ts" &&
        !(await git("diff", "--cached", "--name-only", "--", "next-env.d.ts"))
      ) {
        const before = await git("show", "HEAD:next-env.d.ts"),
          after = await fs.readFile(path.join(root, "next-env.d.ts"), "utf8");
        if (sameGeneratedNextEnvironment(before, after.trim())) {
          await git("restore", "--worktree", "--", "next-env.d.ts");
          status = await git("status", "--porcelain", "--untracked-files=no");
        }
      }
      return !!status;
    },
    pull: (branch) => git("pull", "--ff-only", "origin", branch),
    stopOwnedServer: () =>
      execute(
        "powershell.exe",
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(stopOwnedNextScript, "utf16le").toString("base64"),
        ],
        {
          cwd: root,
          windowsHide: true,
          timeout: 20000,
          env: {
            ...process.env,
            NEXUS_UPDATE_PATTERN: nextServerPattern(root),
          },
        },
      ),
    portFree: async () => {
      for (let attempt = 0; attempt < 20; attempt++) {
        if (await free()) return true;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return false;
    },
    dependenciesChanged: async () => {
      try {
        await fs.access(
          path.join(root, "node_modules", "next", "dist", "bin", "next"),
        );
        const saved = JSON.parse(await fs.readFile(stateFile, "utf8"));
        return saved.lockHash !== (await lockHash());
      } catch {
        return true;
      }
    },
    dependencies: () =>
      run("cmd.exe", [
        "/d",
        "/s",
        "/c",
        "npm.cmd ci --ignore-scripts --no-audit --no-fund",
      ]),
    build: () => run("cmd.exe", ["/d", "/s", "/c", "npm.cmd run build"]),
    start: () =>
      run(process.execPath, [path.join(root, "scripts", "start-nexus.mjs")]),
    verifyAssets: () => verifyNexusAssets(),
    saveSuccess: async () => {
      const temp = stateFile + ".tmp";
      await fs.writeFile(
        temp,
        JSON.stringify({
          version: 1,
          lockHash: await lockHash(),
          commit: await git("rev-parse", "HEAD"),
          finishedAt: new Date().toISOString(),
        }),
        { mode: 0o600 },
      );
      await fs.rename(temp, stateFile);
    },
  });
} catch (error) {
  console.error(
    error.code === "EEXIST"
      ? "An update lock already exists. No second update was started. Inspect any earlier update before removing the stale lock."
      : error.message,
  );
  process.exitCode = 1;
} finally {
  if (lock) {
    await lock.close();
    await fs.rm(lockFile, { force: true });
  }
}
