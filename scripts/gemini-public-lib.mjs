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
    throw setupError("KEY_FORMAT");
  const names = new Set();
  let page = "";
  for (let i = 0; i < 3; i++) {
    const url = new URL(
      "https://generativelanguage.googleapis.com/v1beta/models",
    );
    url.searchParams.set("pageSize", "100");
    if (page) url.searchParams.set("pageToken", page);
    let r;
    try {
      r = await transport(url.toString(), {
        headers: { "x-goog-api-key": key },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      throw networkError(error);
    }
    if (!r.ok) {
      let reason;
      try {
        const raw = await readModelResponse(r, 64000);
        const data = JSON.parse(raw);
        const details = Array.isArray(data?.error?.details)
          ? data.error.details
          : [];
        reason = details
          .map((d) => d?.reason)
          .find((value) => SAFE_REASONS.has(value));
      } catch {
        /* Raw provider text is never printed or retained in a diagnostic. */
      }
      throw setupError("HTTP_REJECTED", { status: r.status, reason });
    }
    if (!r.body) throw setupError("MODEL_LIST_INVALID");
    let data;
    try {
      data = JSON.parse(await readModelResponse(r, 500000));
    } catch (error) {
      if (error?.setupCode) throw error;
      throw setupError("MODEL_LIST_INVALID");
    }
    if (!Array.isArray(data.models)) throw setupError("MODEL_LIST_INVALID");
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
    throw setupError("NO_SUPPORTED_MODEL", { availableCount: names.size });
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

const SAFE_REASONS = new Set([
  "SERVICE_DISABLED",
  "API_KEY_INVALID",
  "API_KEY_SERVICE_BLOCKED",
  "API_KEY_IP_ADDRESS_BLOCKED",
  "API_KEY_HTTP_REFERRER_BLOCKED",
  "BILLING_DISABLED",
  "RATE_LIMIT_EXCEEDED",
  "QUOTA_EXCEEDED",
  "CONSUMER_SUSPENDED",
]);
function setupError(setupCode, fields = {}) {
  const error = new Error("Gemini setup stopped.");
  error.setupCode = setupCode;
  if (Number.isInteger(fields.status)) error.httpStatus = fields.status;
  if (SAFE_REASONS.has(fields.reason)) error.safeReason = fields.reason;
  if (
    Number.isSafeInteger(fields.availableCount) &&
    fields.availableCount >= 0 &&
    fields.availableCount <= 10000
  )
    error.availableCount = fields.availableCount;
  return error;
}
function networkError(error) {
  const code = error?.cause?.code || error?.code;
  if (
    [
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "SELF_SIGNED_CERT_IN_CHAIN",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "ERR_TLS_CERT_ALTNAME_INVALID",
      "CERT_HAS_EXPIRED",
    ].includes(code)
  )
    return setupError("TLS_ERROR");
  if (code === "ENOTFOUND" || code === "EAI_AGAIN")
    return setupError("DNS_ERROR");
  if (
    ["UND_ERR_CONNECT_TIMEOUT", "ETIMEDOUT"].includes(code) ||
    ["TimeoutError", "AbortError"].includes(error?.name)
  )
    return setupError("NETWORK_TIMEOUT");
  return setupError("NETWORK_ERROR");
}
async function readModelResponse(response, limit) {
  if (!response.body) throw setupError("MODEL_LIST_INVALID");
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw setupError("MODEL_LIST_TOO_LARGE");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error?.setupCode) throw error;
    throw networkError(error);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export function parseGeminiSetupInput(buffer) {
  try {
    if (buffer.length > 30000) throw Error();
    const text =
      buffer[0] === 0xff && buffer[1] === 0xfe
        ? buffer.subarray(2).toString("utf16le")
        : buffer.toString("utf8").replace(/^\uFEFF/, "");
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error();
    return value;
  } catch {
    throw setupError("SETUP_INPUT_INVALID");
  }
}
export function safeGeminiSetupDiagnostic(error) {
  let code = error?.setupCode;
  if (code === "HTTP_REJECTED") {
    if (error.safeReason === "SERVICE_DISABLED") code = "API_DISABLED";
    else if (error.safeReason === "API_KEY_INVALID" || error.httpStatus === 401)
      code = "KEY_REJECTED";
    else if (
      [
        "API_KEY_SERVICE_BLOCKED",
        "API_KEY_IP_ADDRESS_BLOCKED",
        "API_KEY_HTTP_REFERRER_BLOCKED",
      ].includes(error.safeReason)
    )
      code = "KEY_RESTRICTION";
    else if (error.safeReason === "BILLING_DISABLED")
      code = "BILLING_REQUIRED_BY_PROVIDER";
    else if (
      ["RATE_LIMIT_EXCEEDED", "QUOTA_EXCEEDED"].includes(error.safeReason) ||
      error.httpStatus === 429
    )
      code = "FREE_QUOTA_UNAVAILABLE";
    else if (error.httpStatus === 403) code = "GOOGLE_ACCESS_DENIED";
    else code = "GOOGLE_HTTP_ERROR";
  }
  const messages = {
    KEY_FORMAT: [
      "The pasted value is not a supported raw API key.",
      "Use AI Studio's copy-key button. Paste only the full key into the hidden prompt, without code, quotes or a label.",
    ],
    KEY_REJECTED: [
      "Google rejected the API key.",
      "Check the key belongs to the intended AI Studio project and is enabled. Do not paste it into chat.",
    ],
    API_DISABLED: [
      "Google reports the Generative Language API is disabled for this project.",
      "Enable Generative Language API in the same Nexus Google Cloud project, then retry. Leave billing unchanged.",
    ],
    KEY_RESTRICTION: [
      "Google reports an API-key application or service restriction.",
      "Review the key's Generative Language API permission and appropriate server-side application restrictions. Do not remove all restrictions blindly.",
    ],
    BILLING_REQUIRED_BY_PROVIDER: [
      "Google requested billing for this access.",
      "Stop here and keep billing unchanged. Share this diagnostic code so a free-compatible path can be reviewed.",
    ],
    FREE_QUOTA_UNAVAILABLE: [
      "Google reports quota or rate-limit unavailability.",
      "Check the project's free quota in AI Studio or retry later. This installer does not enable billing or paid fallback.",
    ],
    GOOGLE_ACCESS_DENIED: [
      "Google denied access (HTTP 403).",
      "Check Generative Language API enablement, project/key restrictions and account eligibility. Share this code; keep the key private.",
    ],
    GOOGLE_HTTP_ERROR: [
      "Google rejected the model-list request.",
      "Share only this code and its HTTP status. No raw provider body or API key is included.",
    ],
    NO_SUPPORTED_MODEL: [
      "Google accepted the key but returned no model matching the public-mode allowlist.",
      "Share this code and the model count. No unsupported or paid-only model was selected automatically.",
    ],
    MODEL_LIST_INVALID: [
      "Google returned an unreadable model list.",
      "Share this diagnostic code. Existing setup was preserved.",
    ],
    MODEL_LIST_TOO_LARGE: [
      "The model-list response exceeded the local limit.",
      "Share this diagnostic code. Existing setup was preserved.",
    ],
    NETWORK_ERROR: [
      "Node could not reach the Gemini service.",
      "Check the laptop's internet/proxy connection. No raw network error or key is printed.",
    ],
    DNS_ERROR: [
      "Node could not resolve the Gemini service.",
      "Check the laptop's DNS/internet connection.",
    ],
    NETWORK_TIMEOUT: [
      "The Gemini metadata request timed out.",
      "Check internet/proxy access and retry later.",
    ],
    TLS_ERROR: [
      "Node could not verify the Gemini HTTPS certificate.",
      "Check the system clock and trusted proxy/certificate configuration. Do not disable TLS verification.",
    ],
    SETUP_INPUT_INVALID: [
      "The local setup input could not be decoded.",
      "Use the updated Setup-Nexus-Gemini.cmd. Do not paste the key into a command line.",
    ],
    SETUP_FAILED: [
      "Gemini setup did not complete.",
      "Existing setup was preserved. Share only this code, never the key.",
    ],
  };
  if (!Object.hasOwn(messages, code)) code = "SETUP_FAILED";
  const result = { code, message: messages[code][0], next: messages[code][1] };
  if (
    Number.isInteger(error?.httpStatus) &&
    error.httpStatus >= 400 &&
    error.httpStatus <= 599
  )
    result.httpStatus = error.httpStatus;
  if (
    code === "NO_SUPPORTED_MODEL" &&
    Number.isSafeInteger(error.availableCount) &&
    error.availableCount >= 0 &&
    error.availableCount <= 10000
  )
    result.availableModels = error.availableCount;
  return result;
}
