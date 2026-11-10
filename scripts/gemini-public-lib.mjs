import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
// Models explicitly advertised with a free tier in the operator-provided pricing table,
// plus stable earlier Flash choices. Never select a paid-only or arbitrary model automatically.
export const PUBLIC_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-3.8-flash",
  "gemini-3.6-flash",
];
export function validatePublicConfig(v) {
  if (
    !v ||
    v.version !== 1 ||
    v.policy !== "public-only" ||
    typeof v.enabled !== "boolean" ||
    v.secretType !== "windows-dpapi" ||
    typeof v.protectedKey !== "string" ||
    !/^01000000[a-f0-9]{100,20000}$/i.test(v.protectedKey) ||
    !PUBLIC_MODELS.includes(v.model) ||
    !Number.isInteger(v.dailyLimit) ||
    v.dailyLimit < 1 ||
    v.dailyLimit > 10
  )
    throw Error(
      "Invalid public Gemini configuration. Re-run Setup-Nexus-Gemini.cmd; private files are unchanged.",
    );
  return {
    version: 1,
    policy: "public-only",
    enabled: v.enabled,
    secretType: "windows-dpapi",
    protectedKey: v.protectedKey,
    model: v.model,
    dailyLimit: v.dailyLimit,
  };
}
export async function availablePublicModels(key, transport = fetch) {
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{20,200}$/.test(key))
    throw Error("The API key format was not recognized. No key was saved.");
  const names = new Set();
  let page = "";
  for (let i = 0; i < 3; i++) {
    const url = new URL(
      "https://generativelanguage.googleapis.com/v1beta/models",
    );
    url.searchParams.set("pageSize", "100");
    if (page) url.searchParams.set("pageToken", page);
    const r = await transport(url.toString(), {
      headers: { "x-goog-api-key": key },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok || !r.body)
      throw Error(
        "Gemini model listing failed. Check the key, API access and network. No key or provider error body was printed.",
      );
    const reader = r.body.getReader(),
      chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 500000) {
        await reader.cancel();
        throw Error("Gemini model list exceeded its limit.");
      }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!Array.isArray(data.models))
      throw Error("Gemini returned an invalid model list.");
    for (const m of data.models)
      if (
        typeof m.name === "string" &&
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes("generateContent")
      )
        names.add(m.name.replace(/^models\//, ""));
    page = typeof data.nextPageToken === "string" ? data.nextPageToken : "";
    if (!page) break;
  }
  const available = PUBLIC_MODELS.filter((model) => names.has(model));
  if (!available.length)
    throw Error(
      "No supported free-tier-listed Flash model was found for this key. No configuration was enabled.",
    );
  return available;
}
export async function writePublicConfig(
  value,
  root = process.env.GW_SYNC_DATA_DIR || path.resolve(".gulf-wing"),
) {
  const v = validatePublicConfig(value),
    target = path.join(root, "gemini-public.json"),
    temp = target + "." + randomBytes(8).toString("hex") + ".tmp";
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  try {
    await fs.writeFile(temp, JSON.stringify(v), { flag: "wx", mode: 0o600 });
    await fs.rename(temp, target);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
