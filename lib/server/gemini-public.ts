import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { SyncError } from "./sync-store";
import {
  validatePublicConfig,
  isGeminiApiKey,
  MAX_GEMINI_KEY_CHARS,
} from "../../scripts/gemini-public-lib.mjs";
const root = () => path.resolve(process.env.GW_SYNC_DATA_DIR || ".gulf-wing");
export async function hasPublicGeminiPolicy() {
  try {
    await fs.lstat(path.join(root(), "gemini-public.json"));
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== "ENOENT";
  }
}
async function configuration() {
  let h;
  try {
    h = await fs.open(path.join(root(), "gemini-public.json"), "r");
    const stat = await h.stat();
    if (stat.size > 30000) throw Error();
    const b = Buffer.alloc(30001),
      read = await h.read(b, 0, b.length, 0);
    if (read.bytesRead > 30000) throw Error();
    return validatePublicConfig(
      JSON.parse(b.subarray(0, read.bytesRead).toString("utf8")),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new SyncError(
      503,
      "Public Gemini setup cannot be read. Private-context Gemini stays blocked; rerun Setup-Nexus-Gemini.cmd.",
    );
  } finally {
    await h?.close();
  }
}
const shared = globalThis as typeof globalThis & {
  geminiPublicQueue?: Promise<unknown>;
  geminiPublicBusy?: boolean;
};
async function atomic(file: string, value: unknown) {
  await fs.mkdir(root(), { recursive: true, mode: 0o700 });
  const target = path.join(root(), file),
    temp = target + "." + randomBytes(8).toString("hex") + ".tmp";
  try {
    await fs.writeFile(temp, JSON.stringify(value), {
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temp, target);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
async function reserve(limit: number) {
  const work = (shared.geminiPublicQueue ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const day = new Date().toISOString().slice(0, 10);
      let used = 0;
      try {
        const v = JSON.parse(
          await fs.readFile(
            path.join(root(), "gemini-public-allowance.json"),
            "utf8",
          ),
        );
        if (
          typeof v.day !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(v.day) ||
          !Number.isSafeInteger(v.used) ||
          v.used < 0
        )
          throw Error();
        if (v.day === day) used = v.used;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT")
          throw new SyncError(
            503,
            "Public Gemini allowance cannot be read; requests stopped.",
          );
      }
      if (used >= limit)
        throw new SyncError(
          429,
          "Daily public Gemini allowance reached. No Google request was sent.",
        );
      await atomic("gemini-public-allowance.json", { day, used: used + 1 });
    });
  shared.geminiPublicQueue = work.catch(() => {});
  await work;
}
// Fixed DPAPI decode only. Ciphertext travels on stdin, never in command arguments.
const UNLOCK_SCRIPT = `$ErrorActionPreference='Stop'; $p=[IntPtr]::Zero; try { $v=[Console]::In.ReadToEnd() | ConvertFrom-Json; $s=ConvertTo-SecureString $v.protectedKey; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)) } catch { exit 1 } finally { if($p -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)} }`;
async function unlock(protectedKey: string, signal: AbortSignal) {
  if (process.platform !== "win32")
    throw new SyncError(
      503,
      "Public Gemini key unlock requires the Windows laptop user that saved it.",
    );
  signal.throwIfAborted();
  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", UNLOCK_SCRIPT],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], shell: false },
    );
    let output = "";
    let settled = false;
    const finish = (key?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (isGeminiApiKey(key)) resolve(key!);
      else
        reject(
          new SyncError(
            503,
            "Gemini key could not be unlocked. Run setup as the same Windows user.",
          ),
        );
    };
    const abort = () => {
      child.kill();
      finish();
    };
    const timer = setTimeout(abort, 10000);
    signal.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      if (output.length > MAX_GEMINI_KEY_CHARS) {
        child.kill();
        finish();
      }
    });
    child.stderr.on("data", () => {});
    child.on("error", () => finish());
    child.stdin.on("error", () => finish());
    child.on("close", (code) => finish(code === 0 ? output : undefined));
    child.stdin.end(JSON.stringify({ protectedKey }));
  });
}
export async function publicGeminiStatus() {
  try {
    const v = await configuration();
    return {
      configured: !!v,
      enabled: !!v?.enabled,
      supported: process.platform === "win32",
      policy: "public-only",
      model: v?.model || null,
      dailyLimit: v?.dailyLimit || 0,
    };
  } catch {
    return {
      configured: false,
      enabled: false,
      supported: process.platform === "win32",
      policy: "public-only",
      model: null,
      dailyLimit: 0,
      warning:
        "Public Gemini setup needs repair. Private-context Gemini remains blocked.",
    };
  }
}
export function publicQuestion(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SyncError(
      400,
      "Enter a public question and confirm it contains no private information.",
    );
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some((k) => !["question", "confirmedPublic"].includes(k)) ||
    v.confirmedPublic !== true ||
    typeof v.question !== "string" ||
    !v.question.trim() ||
    v.question.length > 2000
  )
    throw new SyncError(
      400,
      "Public Gemini accepts only a fresh question of up to 2,000 characters and explicit public-data confirmation. Sources, history and attachments are not accepted.",
    );
  return v.question.trim();
}
export async function askPublicGemini(
  value: unknown,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
  unlockKey: typeof unlock = unlock,
) {
  const question = publicQuestion(value);
  signal.throwIfAborted();
  if (shared.geminiPublicBusy)
    throw new SyncError(429, "Another public Gemini question is running.");
  shared.geminiPublicBusy = true;
  try {
    const v = await configuration();
    if (!v?.enabled)
      throw new SyncError(
        409,
        "Public Gemini is not enabled. Run Setup-Nexus-Gemini.cmd on the laptop.",
      );
    const timeout = AbortSignal.any([signal, AbortSignal.timeout(45000)]),
      key = await unlockKey(v.protectedKey, timeout);
    timeout.throwIfAborted();
    await reserve(v.dailyLimit);
    timeout.throwIfAborted();
    const current = await configuration();
    if (
      !current?.enabled ||
      current.model !== v.model ||
      current.protectedKey !== v.protectedKey ||
      current.dailyLimit !== v.dailyLimit
    )
      throw new SyncError(
        409,
        "Public Gemini setup changed or was disabled before sending. Retry only after checking its status.",
      );
    timeout.throwIfAborted();
    // Build this payload here. This module has no knowledge/calendar/history/memory imports.
    const r = await transport(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(v.model) +
        ":generateContent",
      {
        method: "POST",
        redirect: "error",
        signal: timeout,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "You are Nexus Public, a general-information assistant. You have no private documents, account access, conversation history or tools. Answer the current public question only. Do not claim to have searched files, consulted other agents or performed actions. State uncertainty plainly.",
              },
            ],
          },
          contents: [{ role: "user", parts: [{ text: question }] }],
          generationConfig: { maxOutputTokens: 1024 },
        }),
      },
    );
    if (!r.ok || !r.body)
      throw new SyncError(
        502,
        "Gemini rejected the public request. Check free quota, model availability and key access. No private sources or fallback were sent.",
      );
    const reader = r.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 500000) {
        await reader.cancel();
        throw new SyncError(502, "Gemini response exceeded its limit.");
      }
      chunks.push(value);
    }
    let result;
    try {
      result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new SyncError(502, "Gemini returned an invalid response.");
    }
    const parts = result.candidates?.[0]?.content?.parts;
    const answer = Array.isArray(parts)
      ? parts
          .filter(
            (p: any) => p && p.thought !== true && typeof p.text === "string",
          )
          .map((p: any) => p.text)
          .join("\n")
      : "";
    if (!answer.trim())
      throw new SyncError(
        502,
        "Gemini returned no visible answer. No private sources or hidden fallback were used.",
      );
    return {
      engine: "Gemini Public · " + v.model,
      answer: answer.slice(0, 12000),
      policy: "public-only",
      sources: [],
      truncated: result.candidates?.[0]?.finishReason === "MAX_TOKENS",
    };
  } finally {
    shared.geminiPublicBusy = false;
  }
}
export async function disablePublicGemini() {
  const v = await configuration();
  if (v) await atomic("gemini-public.json", { ...v, enabled: false });
  return publicGeminiStatus();
}
