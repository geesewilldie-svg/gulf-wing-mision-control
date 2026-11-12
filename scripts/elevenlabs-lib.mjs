import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
export const STEPHANIE_VOICE = "oT5lntmfa8t37GiBBd3k";
export const ELEVEN_MODEL = "eleven_flash_v2_5";
export const validVoiceKey = (key) =>
  typeof key === "string" &&
  key.length >= 20 &&
  key.length <= 4096 &&
  /^[A-Za-z0-9._~+/-]+={0,2}$/.test(key) &&
  !/\.{2,}/.test(key);
export function validateElevenConfig(v) {
  if (
    !v ||
    v.version !== 1 ||
    typeof v.enabled !== "boolean" ||
    v.secretType !== "windows-dpapi" ||
    typeof v.protectedKey !== "string" ||
    !/^01000000[a-f0-9]{100,20000}$/i.test(v.protectedKey) ||
    v.voiceId !== STEPHANIE_VOICE ||
    v.model !== ELEVEN_MODEL ||
    !Number.isSafeInteger(v.dailyCharacters) ||
    v.dailyCharacters < 100 ||
    v.dailyCharacters > 100000 ||
    v.cloudSpeechAccepted !== true
  )
    throw Error(
      "Invalid ElevenLabs configuration. Rerun Setup-Nexus-ElevenLabs.cmd.",
    );
  return {
    version: 1,
    enabled: v.enabled,
    secretType: "windows-dpapi",
    protectedKey: v.protectedKey,
    voiceId: STEPHANIE_VOICE,
    voiceName: "Stephanie",
    model: ELEVEN_MODEL,
    dailyCharacters: v.dailyCharacters,
    cloudSpeechAccepted: true,
  };
}
export function parseElevenInput(bytes) {
  let b = Buffer.from(bytes);
  let text;
  if (b[0] === 0xff && b[1] === 0xfe) text = b.subarray(2).toString("utf16le");
  else text = b.toString("utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text);
}
export async function writeElevenConfig(
  value,
  root = process.env.GW_SYNC_DATA_DIR || path.resolve(".gulf-wing"),
) {
  const config = validateElevenConfig(value);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const target = path.join(root, "elevenlabs.json"),
    temp = target + "." + randomBytes(8).toString("hex") + ".tmp";
  try {
    await fs.writeFile(temp, JSON.stringify(config), {
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temp, target);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
export async function verifyStephanie(key, transport = fetch) {
  if (!validVoiceKey(key))
    throw Error(
      "KEY_FORMAT: Copy the full API key without quotes, spaces or code.",
    );
  let response;
  try {
    response = await transport(
      `https://api.elevenlabs.io/v1/voices/${STEPHANIE_VOICE}`,
      {
        headers: { "xi-api-key": key },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    throw Error(
      "CONNECTION: Could not reach ElevenLabs. No configuration changed.",
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw Error(
      `HTTP_${response.status}: Voice access was not confirmed. Check the key's Voices read permission and add Stephanie to My Voices. No configuration changed.`,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("VOICE_CHECK: No voice metadata returned.");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 64000) {
      await reader.cancel();
      throw Error("VOICE_CHECK: Voice metadata exceeded limits.");
    }
    chunks.push(value);
  }
  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Error("VOICE_CHECK: Invalid metadata response.");
  }
  if (data.voice_id !== STEPHANIE_VOICE)
    throw Error("VOICE_CHECK: The selected voice was not confirmed.");
  return true;
}
