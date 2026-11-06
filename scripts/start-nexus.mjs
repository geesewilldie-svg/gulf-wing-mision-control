import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startServices, backgroundVoicePython } from "./nexus-launcher-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const privateDir = path.join(root, ".gulf-wing");
const exists = async (file) => {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stateFile = path.join(privateDir, "launcher-processes.json");
const managed = {};
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code !== "ESRCH";
  }
}
async function managedProbe(service) {
  const state = await health(service);
  if (state !== "down") return state;
  const entry = managed[service.id];
  return entry &&
    Number.isSafeInteger(entry.pid) &&
    entry.pid > 0 &&
    alive(entry.pid)
    ? "pending"
    : "down";
}
async function busyPort(port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ host: "127.0.0.1", port });
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      s.destroy();
      resolve(v);
    };
    s.setTimeout(1500, () => finish(true));
    s.once("connect", () => finish(true));
    s.once("error", (e) => finish(e.code !== "ECONNREFUSED"));
  });
}
async function health(service) {
  try {
    const r = await fetch(service.url, {
      signal: AbortSignal.timeout(2000),
      redirect: "error",
    });
    if (!r.ok) return "occupied";
    const d = await r.json();
    if (
      service.id === "server" &&
      typeof d.enabled === "boolean" &&
      typeof d.paired === "boolean"
    )
      return "ready";
    if (service.id === "ollama" && Array.isArray(d.models)) return "ready";
    if (service.id === "voice" && d.available === true)
      return d.speech === true && d.transcription === true
        ? "ready"
        : "degraded";
    return "occupied";
  } catch {
    return (await busyPort(service.port)) ? "occupied" : "down";
  }
}
async function launchLogged(service) {
  const logFile = path.join(privateDir, `launcher-${service.id}.log`);
  try {
    if ((await fs.stat(logFile)).size > 2000000) {
      await fs.rm(logFile + ".old", { force: true });
      await fs.rename(logFile, logFile + ".old");
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const log = await fs.open(logFile, "a", 0o600);
  try {
    await log.write(
      `\n[${new Date().toISOString()}] Launcher starting ${service.id}${service.id === "voice" ? " with console-free Python" : ""}.\n`,
    );
    return await new Promise((resolve, reject) => {
      const child = spawn(service.command, service.args, {
        cwd: root,
        env: service.env || process.env,
        detached: true,
        windowsHide: true,
        stdio: ["ignore", log.fd, log.fd],
      });
      child.once("error", reject);
      child.once("spawn", () => {
        managed[service.id] = { pid: child.pid, command: service.command };
        fs.writeFile(stateFile, JSON.stringify(managed), { mode: 0o600 }).then(
          () => {
            child.unref();
            resolve(child.pid);
          },
          (error) => {
            child.unref();
            reject(error);
          },
        );
      });
    });
  } finally {
    await log.close();
  }
}
async function ollamaPath() {
  const candidate =
    process.env.LOCALAPPDATA &&
    path.join(process.env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe");
  if (candidate && (await exists(candidate))) return candidate;
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    const file = path.join(dir, "ollama.exe");
    if (await exists(file)) return file;
  }
  return null;
}
async function acquireLock() {
  const file = path.join(privateDir, "launcher.lock");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = await fs.open(file, "wx", 0o600);
      try {
        await fd.writeFile(String(process.pid));
      } finally {
        await fd.close();
      }
      return async () => {
        try {
          if ((await fs.readFile(file, "utf8")) === String(process.pid))
            await fs.rm(file, { force: true });
        } catch {}
      };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let alive = true;
      try {
        const pid = Number(await fs.readFile(file, "utf8"));
        if (!Number.isSafeInteger(pid) || pid <= 0) throw Error();
        try {
          process.kill(pid, 0);
        } catch (error) {
          if (error.code === "ESRCH") alive = false;
        }
      } catch {
        console.log(
          "A launcher lock could not be verified. Check .gulf-wing/launcher.lock before retrying.",
        );
        return null;
      }
      if (alive) {
        console.log(
          "Nexus startup is already in progress. Wait for it to finish.",
        );
        return null;
      }
      await fs.rm(file, { force: true });
    }
  }
  return null;
}
async function main() {
  if (process.platform !== "win32")
    throw Error(
      "This launcher is for Windows. Use npm run start on other systems.",
    );
  await fs.mkdir(privateDir, { recursive: true, mode: 0o700 });
  const release = await acquireLock();
  if (!release) return;
  try {
    try {
      const stored = JSON.parse(await fs.readFile(stateFile, "utf8"));
      if (!stored || typeof stored !== "object" || Array.isArray(stored))
        throw Error();
      for (const id of ["server", "voice", "ollama"]) {
        const e = stored[id];
        if (e) {
          if (
            !Number.isSafeInteger(e.pid) ||
            e.pid <= 0 ||
            typeof e.command !== "string"
          )
            throw Error();
          managed[id] = e;
        }
      }
    } catch (e) {
      if (e.code !== "ENOENT") throw Error("Invalid launcher process state.");
    }
    console.log(
      "NEXUS — one-click Windows startup\nNo updates, downloads or pairing changes. Browser listening follows your saved device preference.",
    );
    const ollama = await ollamaPath(),
      voiceScripts = path.join(root, ".venv-voice", "Scripts"),
      python = await backgroundVoicePython(voiceScripts, exists);
    const env = {
      ...process.env,
      PATH: voiceScripts + path.delimiter + (process.env.PATH || ""),
      PYTHONUNBUFFERED: "1",
      NEXUS_WHISPER_MODEL: "",
      NEXUS_KOKORO_PYTHON: "",
      NEXUS_PIPER_MODEL: path.join(
        privateDir,
        "models",
        "piper",
        "en_GB-alba-medium.onnx",
      ),
    };
    const whisper = path.join(privateDir, "models", "whisper-tiny.en");
    if (await exists(path.join(whisper, "model.bin")))
      env.NEXUS_WHISPER_MODEL = whisper;
    const kokoroPython = path.join(
      root,
      ".venv-kokoro",
      "Scripts",
      "python.exe",
    );
    env.NEXUS_KOKORO_MODEL = path.join(
      privateDir,
      "models",
      "kokoro",
      "kokoro-v1.0.onnx",
    );
    env.NEXUS_KOKORO_VOICES = path.join(
      privateDir,
      "models",
      "kokoro",
      "voices-v1.0.bin",
    );
    if (
      (await exists(kokoroPython)) &&
      (await exists(env.NEXUS_KOKORO_MODEL)) &&
      (await exists(env.NEXUS_KOKORO_VOICES))
    )
      env.NEXUS_KOKORO_PYTHON = kokoroPython;
    const services = [
      {
        id: "ollama",
        name: "Ollama",
        port: 11434,
        url: "http://127.0.0.1:11434/api/tags",
        command: ollama,
        args: ["serve"],
        env: { ...process.env, OLLAMA_HOST: "127.0.0.1:11434" },
        timeout: 30000,
      },
      {
        id: "server",
        name: "Mission Control",
        port: 3000,
        url: "http://127.0.0.1:3000/api/sync/session",
        command: process.execPath,
        args: [
          path.join(root, "node_modules", "next", "dist", "bin", "next"),
          "start",
          "--hostname",
          "0.0.0.0",
        ],
        timeout: 45000,
      },
      {
        id: "voice",
        name: "Nexus voice",
        port: 8766,
        url: "http://127.0.0.1:8766/health",
        command: python,
        args: ["-u", path.join(root, "scripts", "voice", "worker.py")],
        env,
        timeout: 90000,
      },
    ];
    const results = await startServices(services, {
      log: console.log,
      probe: managedProbe,
      prepare: async (s) =>
        s.id === "server"
          ? (await exists(path.join(root, ".next", "BUILD_ID"))) &&
            (await exists(s.args[0]))
          : !!s.command && (await exists(s.command)),
      start: launchLogged,
      wait: async (s, pid) => {
        const until = Date.now() + s.timeout;
        do {
          const state = await health(s);
          if (state === "ready" || state === "degraded") return state;
          if (pid && !alive(pid)) return "failed";
          await sleep(1000);
        } while (Date.now() < until);
        return "warming";
      },
    });
    const server = results.find((r) => r.id === "server");
    if (server?.state === "ready" && !process.argv.includes("--no-browser")) {
      // Fixed URL only; do not pass paths or user text through a shell.
      const opener = spawn("explorer.exe", ["http://localhost:3000/nexus"], {
        detached: true,
        windowsHide: true,
        stdio: "ignore",
      });
      opener.on("error", () =>
        console.log("Open http://localhost:3000/nexus in your browser."),
      );
      opener.unref();
    }
    const issue = results.some((r) => r.state !== "ready");
    console.log(
      "\nServices run in the background. Closing the browser does not stop them.",
    );
    console.log(
      "Use Start-Nexus.cmd again to check/reuse them. Logs: .gulf-wing/launcher-*.log",
    );
    if (issue) {
      console.log(
        "Some components need attention. Run npm.cmd run connections:check for local diagnostics.",
      );
      process.exitCode = 1;
    }
  } finally {
    await release();
  }
}
main().catch(() => {
  console.error(
    "Nexus startup failed. Run Start-Nexus.cmd from PowerShell and inspect .gulf-wing/launcher-*.log.",
  );
  process.exitCode = 1;
});
