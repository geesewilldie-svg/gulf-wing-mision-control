import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { SyncError } from "./sync-store";
import {
  validateElevenConfig,
  writeElevenConfig,
  validVoiceKey,
} from "../../scripts/elevenlabs-lib.mjs";
const root = () => path.resolve(process.env.GW_SYNC_DATA_DIR || ".gulf-wing");
async function readJson(file: string, max = 30000) {
  const handle = await fs.open(path.join(root(), file), "r");
  try {
    const bytes = Buffer.alloc(max + 1),
      { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > max) throw Error();
    return JSON.parse(bytes.subarray(0, bytesRead).toString("utf8"));
  } finally {
    await handle.close();
  }
}
async function configuration() {
  try {
    return validateElevenConfig(await readJson("elevenlabs.json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new SyncError(
      503,
      "ElevenLabs configuration cannot be read. Rerun Setup-Nexus-ElevenLabs.cmd.",
    );
  }
}
async function allowance() {
  try {
    const value = await readJson("elevenlabs-allowance.json", 2000);
    if (
      !value ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.day) ||
      !Number.isSafeInteger(value.used) ||
      value.used < 0
    )
      throw Error();
    return value.day === new Date().toISOString().slice(0, 10)
      ? (value.used as number)
      : 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw new SyncError(
      503,
      "ElevenLabs usage accounting cannot be read. Cloud speech stopped.",
    );
  }
}
async function reserve(limit: number, count: number) {
  await fs.mkdir(root(), { recursive: true, mode: 0o700 });
  const lock = path.join(root(), "elevenlabs-allowance.lock");
  let handle;
  try {
    handle = await fs.open(lock, "wx", 0o600);
  } catch {
    throw new SyncError(
      429,
      "ElevenLabs usage accounting is locked. Wait for the other request; if it persists, stop Nexus before repairing the lock.",
    );
  }
  const target = path.join(root(), "elevenlabs-allowance.json"),
    temp = target + "." + randomBytes(8).toString("hex") + ".tmp";
  try {
    const used = await allowance();
    if (used + count > limit)
      throw new SyncError(
        429,
        "Daily ElevenLabs character limit reached. No speech request was sent. Choose local speech or wait until the next UTC day.",
      );
    await fs.writeFile(
      temp,
      JSON.stringify({
        day: new Date().toISOString().slice(0, 10),
        used: used + count,
      }),
      { mode: 0o600, flag: "wx" },
    );
    await fs.rename(temp, target);
  } finally {
    await fs.rm(temp, { force: true });
    await handle.close();
    await fs.rm(lock, { force: true });
  }
}
const UNLOCK_SCRIPT = `$ErrorActionPreference='Stop'; $p=[IntPtr]::Zero; try { $v=[Console]::In.ReadToEnd() | ConvertFrom-Json; $s=ConvertTo-SecureString $v.protectedKey; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)) } catch { exit 1 } finally { if($p -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)} }`;
async function unlock(protectedKey: string, signal: AbortSignal) {
  if (process.platform !== "win32")
    throw new SyncError(
      503,
      "ElevenLabs key unlock requires the Windows laptop user that saved it.",
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
      if (validVoiceKey(key)) resolve(key!);
      else
        reject(
          new SyncError(
            503,
            "ElevenLabs key could not be unlocked. Run setup as the same Windows user.",
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
      if (output.length > 4096) {
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
export async function elevenSpeechStatus() {
  try {
    const c = await configuration();
    return {
      configured: !!c,
      enabled: !!c?.enabled,
      supported: process.platform === "win32",
      voiceName: "Stephanie",
      voiceId: c?.voiceId ?? null,
      model: c?.model ?? null,
      dailyCharacters: c?.dailyCharacters ?? 0,
      usedCharacters: c ? await allowance() : 0,
    };
  } catch {
    return {
      configured: false,
      enabled: false,
      supported: process.platform === "win32",
      voiceName: "Stephanie",
      voiceId: null,
      model: null,
      dailyCharacters: 0,
      usedCharacters: 0,
      warning:
        "ElevenLabs setup or usage accounting needs repair; cloud speech is unavailable.",
    };
  }
}
export function speechInput(value: unknown) {
  const v = value as Record<string, unknown>;
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !["text", "cloudSpeechConsent"].includes(k)) ||
    typeof v.text !== "string" ||
    !v.text.trim() ||
    v.text.length > 3000
  )
    throw new SyncError(
      400,
      "Speech text must be 1–3,000 characters with no extra fields.",
    );
  if (v.cloudSpeechConsent !== true)
    throw new SyncError(
      403,
      "Allow cloud speech before sending spoken text to ElevenLabs. Paid credits and provider data terms apply.",
    );
  return v.text.trim();
}
const shared = globalThis as typeof globalThis & {
  elevenSpeechBusy?: boolean;
  elevenSpeechAbort?: AbortController;
};
export async function disableElevenSpeech() {
  const c = await configuration();
  if (c) await writeElevenConfig({ ...c, enabled: false }, root());
  shared.elevenSpeechAbort?.abort();
  return elevenSpeechStatus();
}
export async function generateElevenSpeech(
  value: unknown,
  signal: AbortSignal,
  options: {
    transport?: typeof fetch;
    unlock?: (cipher: string, signal: AbortSignal) => Promise<string>;
  } = {},
) {
  const text = speechInput(value);
  if (shared.elevenSpeechBusy)
    throw new SyncError(429, "ElevenLabs speech is busy. Try again shortly.");
  shared.elevenSpeechBusy = true;
  const controller = new AbortController();
  shared.elevenSpeechAbort = controller;
  const combined = AbortSignal.any([
    signal,
    controller.signal,
    AbortSignal.timeout(60000),
  ]);
  try {
    combined.throwIfAborted();
    const c = await configuration();
    if (!c?.enabled)
      throw new SyncError(
        503,
        "ElevenLabs is not enabled. Run Setup-Nexus-ElevenLabs.cmd or choose local speech.",
      );
    const key = await (options.unlock || unlock)(c.protectedKey, combined);
    if (!validVoiceKey(key))
      throw new SyncError(503, "ElevenLabs key could not be unlocked.");
    const current = await configuration();
    if (!current?.enabled || JSON.stringify(current) !== JSON.stringify(c))
      throw new SyncError(
        409,
        "ElevenLabs setup changed. Retry after reviewing the voice settings.",
      );
    combined.throwIfAborted();
    await reserve(c.dailyCharacters, text.length);
    combined.throwIfAborted();
    const response = await (options.transport || fetch)(
      `https://api.elevenlabs.io/v1/text-to-speech/${c.voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": key,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({ text, model_id: c.model }),
        redirect: "error",
        signal: combined,
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      const message =
        response.status === 401 || response.status === 403
          ? "ElevenLabs rejected access. Check API key permissions, Stephanie voice access and account eligibility."
          : response.status === 429
            ? "ElevenLabs quota or rate limit reached. No automatic retry was made."
            : "ElevenLabs speech generation failed. Check account status, selected model and voice availability.";
      throw new SyncError(503, message);
    }
    if (
      !response.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("audio/mpeg")
    ) {
      await response.body?.cancel();
      throw new SyncError(
        503,
        "ElevenLabs returned an unexpected audio format.",
      );
    }
    const reader = response.body?.getReader();
    if (!reader) throw new SyncError(503, "ElevenLabs returned no audio.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      combined.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8_000_000) {
        await reader.cancel();
        throw new SyncError(
          503,
          "ElevenLabs audio exceeded the response limit.",
        );
      }
      chunks.push(value);
    }
    combined.throwIfAborted();
    if (!size) throw new SyncError(503, "ElevenLabs returned no audio.");
    return Buffer.concat(chunks);
  } catch (error) {
    if (error instanceof SyncError) throw error;
    if (combined.aborted)
      throw new SyncError(
        408,
        "Cloud speech stopped or timed out. Reserved allowance is retained; the provider may already have processed the request.",
      );
    throw new SyncError(
      503,
      "Could not complete ElevenLabs speech. No automatic retry or paid fallback was made.",
    );
  } finally {
    if (shared.elevenSpeechAbort === controller)
      shared.elevenSpeechAbort = undefined;
    shared.elevenSpeechBusy = false;
  }
}
