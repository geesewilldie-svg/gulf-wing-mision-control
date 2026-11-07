import { spawn, execFile } from "node:child_process";
import path from "node:path";
export class WorkerProcessError extends Error {
  constructor(
    public kind: "failed" | "aborted" | "output-limit" | "cleanup-uncertain",
  ) {
    super("Codex process " + kind);
  }
}
export type Command = { file: string; prefix: string[] };
export function commandFor(entrypoint: string): Command {
  if (
    !path.isAbsolute(entrypoint) ||
    entrypoint.includes("\0") ||
    /\.(cmd|bat|ps1)$/i.test(entrypoint)
  )
    throw Error(
      "An absolute native executable or official JavaScript entrypoint is required.",
    );
  return /\.(mjs|js)$/i.test(entrypoint)
    ? { file: process.execPath, prefix: [entrypoint] }
    : { file: entrypoint, prefix: [] };
}
export function workerEnvironment(home: string) {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
  for (const [k, v] of Object.entries(process.env)) {
    if (
      /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|SSL_CERT_FILE|SSL_CERT_DIR|NODE_EXTRA_CA_CERTS|REQUESTS_CA_BUNDLE)$/i.test(
        k,
      )
    )
      env[k] = v;
  }
  env.CODEX_HOME = home;
  env.NO_COLOR = "1";
  return env;
}
export async function runProcess(
  command: Command,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    signal: AbortSignal;
    input?: string;
    timeout?: number;
    capture?: boolean;
    onLine?: (line: string) => void;
    onSpawn?: (pid: number) => void;
  },
): Promise<string> {
  options.signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command.file, [...command.prefix, ...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "",
      line = "",
      bytes = 0,
      done = false,
      closing = false,
      reason: WorkerProcessError["kind"] | null = null;
    const finish = (error?: WorkerProcessError) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      clearTimeout(cleanup);
      options.signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(output);
    };
    let cleanup: ReturnType<typeof setTimeout> | undefined;
    const stop = (kind: WorkerProcessError["kind"]) => {
      if (closing || done) return;
      closing = true;
      reason = kind;
      const pid = child.pid;
      if (pid && child.exitCode === null) {
        if (process.platform === "win32") {
          const taskkill = path.join(
            process.env.SystemRoot || "C:\\Windows",
            "System32",
            "taskkill.exe",
          );
          execFile(
            taskkill,
            ["/PID", String(pid), "/T", "/F"],
            { windowsHide: true, timeout: 3000 },
            () => {},
          );
        } else {
          try {
            process.kill(-pid, "SIGKILL");
          } catch {
            try {
              child.kill("SIGKILL");
            } catch {}
          }
        }
      }
      cleanup = setTimeout(
        () => finish(new WorkerProcessError("cleanup-uncertain")),
        4000,
      );
    };
    const abort = () => stop("aborted");
    const timeout = setTimeout(
      () => stop("aborted"),
      options.timeout ?? 300000,
    );
    options.signal.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (data: Buffer) => {
      bytes += data.length;
      if (bytes > 262144) {
        stop("output-limit");
        return;
      }
      const text = data.toString("utf8");
      if (options.capture !== false) output += text;
      if (options.onLine) {
        line += text;
        if (Buffer.byteLength(line) > 65536) {
          stop("output-limit");
          return;
        }
        let split: number;
        while ((split = line.indexOf("\n")) >= 0) {
          const next = line.slice(0, split);
          line = line.slice(split + 1);
          try {
            options.onLine(next);
          } catch {
            stop("failed");
            return;
          }
        }
      }
    });
    child.stderr.on("data", (data: Buffer) => {
      bytes += data.length;
      if (bytes > 262144) stop("output-limit");
      if (options.capture !== false) output += data.toString("utf8");
    });
    child.on("spawn", () => {
      try {
        if (child.pid) options.onSpawn?.(child.pid);
      } catch {
        stop("failed");
      }
    });
    child.stdin.on("error", () => {});
    child.on("error", () => finish(new WorkerProcessError("failed")));
    child.on("close", (code) => {
      if (reason) finish(new WorkerProcessError(reason));
      else if (code !== 0) finish(new WorkerProcessError("failed"));
      else {
        if (options.onLine && line.trim()) {
          try {
            options.onLine(line);
          } catch {
            finish(new WorkerProcessError("failed"));
            return;
          }
        }
        finish();
      }
    });
    child.stdin.end(options.input || "");
    if (options.signal.aborted) abort();
  });
}
