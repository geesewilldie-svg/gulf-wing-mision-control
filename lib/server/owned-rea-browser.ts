import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { SyncError } from "./sync-store";
import type { OwnedReaInspection } from "./rea-protocol";
export class OwnedBrowserCleanupError extends SyncError {
  constructor(public ownedProcess: ChildProcess | undefined) {
    super(
      503,
      "Owned browser cleanup could not be confirmed. No successful browser readiness was recorded; temporary fixture files were retained.",
    );
  }
}
export type OwnedBrowserFixtureOptions = {
  executable?: string;
  testNoSandbox?: boolean;
};
async function browserExecutable() {
  const candidates =
    process.platform === "win32"
      ? [
          path.join(
            process.env.ProgramFiles || "C:\\Program Files",
            "Google",
            "Chrome",
            "Application",
            "chrome.exe",
          ),
          path.join(
            process.env.ProgramFiles || "C:\\Program Files",
            "Microsoft",
            "Edge",
            "Application",
            "msedge.exe",
          ),
          path.join(
            process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
            "Microsoft",
            "Edge",
            "Application",
            "msedge.exe",
          ),
          ...(process.env.LOCALAPPDATA
            ? [
                path.join(
                  process.env.LOCALAPPDATA,
                  "Google",
                  "Chrome",
                  "Application",
                  "chrome.exe",
                ),
              ]
            : []),
        ]
      : [
          "/usr/bin/google-chrome",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
        ];
  for (const candidate of candidates) {
    try {
      const stat = await fs.lstat(candidate);
      if (stat.isFile() && !stat.isSymbolicLink()) return candidate;
    } catch {}
  }
  throw new SyncError(
    409,
    "A supported installed Chrome/Edge browser was not found. No browser was downloaded.",
  );
}
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
async function closed(child: ChildProcess, ms: number) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      child.removeListener("close", done);
      resolve(false);
    }, ms);
    function done() {
      clearTimeout(timer);
      resolve(true);
    }
    child.once("close", done);
  });
}
export async function withOwnedReaBrowser<T>(
  signal: AbortSignal,
  run: (fixture: OwnedReaInspection, activeSignal: AbortSignal) => Promise<T>,
  options: OwnedBrowserFixtureOptions = {},
) {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  bounded.throwIfAborted();
  const executable = options.executable || (await browserExecutable());
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-rea-owned-"));
  const nonce = randomBytes(16).toString("hex"),
    title = "Nexus REA self-test " + nonce,
    urlPath = "/nexus-rea-self-test/" + nonce;
  const server = http.createServer((request, response) => {
    if (request.method !== "GET" || request.url !== urlPath) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'",
    });
    response.end(
      "<!doctype html><html><head><title>" +
        title +
        "</title></head><body><h1>" +
        title +
        "</h1><p>Owned loopback-only Nexus inspection fixture.</p></body></html>",
    );
  });
  let browser: ChildProcess | undefined,
    ws: WebSocket | undefined,
    cleanupConfirmed = true,
    browserError = false;
  let rpc: ((method: string, params?: unknown) => Promise<any>) | undefined;
  const abort = () => {
    try {
      ws?.close();
    } catch {}
    browser?.kill();
  };
  bounded.addEventListener("abort", abort, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("No fixture listener");
    const origin = "http://127.0.0.1:" + address.port,
      url = origin + urlPath;
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "production",
      ...Object.fromEntries(
        Object.entries(process.env).filter(([name]) =>
          [
            "PATH",
            "SystemRoot",
            "WINDIR",
            "TEMP",
            "TMP",
            "LANG",
            "HOME",
            "USERPROFILE",
            "LOCALAPPDATA",
            "APPDATA",
            "DISPLAY",
            "XDG_RUNTIME_DIR",
          ].includes(name),
        ),
      ),
    };
    const args = [
      "--headless=new",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      "--user-data-dir=" + profile,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-breakpad",
      ...(options.testNoSandbox ? ["--no-sandbox"] : []),
      "about:blank",
    ];
    bounded.throwIfAborted();
    browser = spawn(executable, args, {
      env: environment,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    browser.on("error", () => {
      browserError = true;
    });
    let diagnosticBytes = 0;
    browser.stderr?.on("data", (chunk: Buffer) => {
      diagnosticBytes += chunk.length;
      if (diagnosticBytes > 64000) {
        browserError = true;
        browser?.kill();
      }
    });
    let port = 0,
      socketPath = "";
    for (let i = 0; i < 100; i++) {
      bounded.throwIfAborted();
      if (
        browserError ||
        browser.exitCode !== null ||
        browser.signalCode !== null
      )
        throw Error("Owned browser unavailable");
      try {
        const filename = path.join(profile, "DevToolsActivePort"),
          stat = await fs.lstat(filename);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 200)
          throw Error("Invalid owned endpoint");
        const lines = (await fs.readFile(filename, "utf8")).trim().split("\n");
        if (
          lines.length === 2 &&
          /^\d{1,5}$/.test(lines[0]) &&
          /^\/devtools\/browser\/[a-f0-9-]{36}$/i.test(lines[1])
        ) {
          port = Number(lines[0]);
          socketPath = lines[1];
          if (port > 0 && port < 65536) break;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await pause(100);
    }
    if (!port || !socketPath) throw Error("Owned endpoint startup timed out");
    bounded.throwIfAborted();
    ws = new WebSocket("ws://127.0.0.1:" + port + socketPath);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Owned socket timeout")),
        3000,
      );
      ws!.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      ws!.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(Error("Owned socket unavailable"));
        },
        { once: true },
      );
    });
    let nextId = 0;
    const pending = new Map<
      number,
      {
        resolve: (value: any) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    >();
    ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string" || event.data.length > 64000) return;
      try {
        const message = JSON.parse(event.data),
          entry = pending.get(message.id);
        if (!entry) return;
        clearTimeout(entry.timer);
        pending.delete(message.id);
        message.error
          ? entry.reject(Error("Owned browser command failed"))
          : entry.resolve(message.result);
      } catch {}
    });
    ws.addEventListener("close", () => {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(Error("Owned socket closed"));
      }
      pending.clear();
    });
    rpc = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(Error("Owned browser command timeout"));
        }, 3000);
        pending.set(id, { resolve, reject, timer });
        try {
          ws!.send(JSON.stringify({ id, method, params }));
        } catch (error) {
          clearTimeout(timer);
          pending.delete(id);
          reject(error);
        }
      });
    const target = await rpc("Target.createTarget", { url });
    if (!/^[a-f0-9]{32}$/i.test(target?.targetId || ""))
      throw Error("Invalid owned target");
    bounded.throwIfAborted();
    for (let i = 0; i < 40; i++) {
      bounded.throwIfAborted();
      const info = await rpc("Target.getTargetInfo", {
        targetId: target.targetId,
      });
      if (info.targetInfo?.url === url && info.targetInfo?.title === title)
        break;
      if (i === 39) throw Error("Owned fixture did not finish loading");
      await pause(50);
    }
    const result = await run(
      {
        endpoint: "http://127.0.0.1:" + port,
        targetId: target.targetId,
        url,
        origin,
        title,
      },
      bounded,
    );
    bounded.throwIfAborted();
    return result;
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError(
      signal.aborted ? 499 : 503,
      signal.aborted
        ? "Owned browser self-test cancelled."
        : "Owned browser self-test failed. No personal browser profile or external site was targeted.",
    );
  } finally {
    bounded.removeEventListener("abort", abort);
    if (browser) {
      if (browser.exitCode === null && browser.signalCode === null) {
        try {
          await rpc?.("Browser.close");
        } catch {}
        if (!(await closed(browser, 3000))) {
          cleanupConfirmed = false;
          browser.kill();
          if (!(await closed(browser, 2000))) {
            browser.kill("SIGKILL");
            await closed(browser, 2000);
          }
        }
      }
      if (browser.exitCode === null && browser.signalCode === null)
        cleanupConfirmed = false;
    }
    try {
      ws?.close();
    } catch {}
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (cleanupConfirmed) {
      try {
        await fs.rm(profile, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 100,
        });
      } catch {
        cleanupConfirmed = false;
      }
    }
    if (!cleanupConfirmed) throw new OwnedBrowserCleanupError(browser);
  }
}
