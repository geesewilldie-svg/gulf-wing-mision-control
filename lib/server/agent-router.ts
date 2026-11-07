import { randomUUID, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { configuredLocalModel } from "./nexus-store";
import { SyncError } from "./sync-store";
import type { ProviderId, ProviderStatus, AgentEvent } from "../agent-router";
import type { ConversationTurn } from "../conversation";
const names = {
  local: "Local Ollama",
  openai: "ChatGPT",
  anthropic: "Claude",
  gemini: "Gemini",
};
const variables = {
  openai: ["GW_NEXUS_OPENAI_KEY", "GW_NEXUS_OPENAI_MODEL"],
  anthropic: ["GW_NEXUS_ANTHROPIC_KEY", "GW_NEXUS_ANTHROPIC_MODEL"],
  gemini: ["GW_NEXUS_GEMINI_KEY", "GW_NEXUS_GEMINI_MODEL"],
} as const;
export async function providerStatus(): Promise<ProviderStatus[]> {
  const local = await configuredLocalModel();
  return [
    {
      id: "local",
      name: names.local,
      configured: !!local,
      external: false,
      detail: local
        ? "Configured on this laptop; availability checked when used."
        : "Run local AI setup.",
    },
    ...(["openai", "anthropic", "gemini"] as const).map((id) => {
      const [key, model] = variables[id],
        configured =
          process.env.GW_NEXUS_ALLOW_EXTERNAL === "1" &&
          !!process.env[key]?.trim() &&
          !!process.env[model]?.trim() &&
          dailyLimit() > 0;
      return {
        id,
        name: names[id],
        configured,
        external: true,
        detail: configured
          ? "Configured, not independently health-checked. Requires per-question permission; provider billing may apply."
          : "Disabled. Requires provider API configuration, an explicit request allowance and per-question sharing permission. Chat subscriptions do not grant API access.",
      };
    }),
  ];
}
const globalAgent = globalThis as typeof globalThis & {
  gwAgentEvents?: AgentEvent[];
  gwAgentQuotaQueue?: Promise<unknown>;
};
export function events() {
  return (globalAgent.gwAgentEvents ?? [])
    .filter((e) => e.started > Date.now() - 15 * 60 * 1000)
    .slice(0, 40);
}
export async function trackAgent<T>(
  agent: string,
  action: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  const e: AgentEvent = {
    id: randomUUID(),
    agent,
    started: Date.now(),
    state: "working",
  };
  globalAgent.gwAgentEvents = [e, ...events()].slice(0, 40);
  try {
    signal.throwIfAborted();
    const result = await action();
    signal.throwIfAborted();
    e.state = "complete";
    return result;
  } catch (error) {
    e.state = signal.aborted ? "cancelled" : "failed";
    throw error;
  } finally {
    e.finished = Date.now();
  }
}
function dailyLimit() {
  const n = Number(process.env.GW_NEXUS_MAX_EXTERNAL_PER_DAY || 0);
  return Number.isInteger(n) && n > 0 && n <= 100 ? n : 0;
}
async function reserveExternal() {
  const work = (globalAgent.gwAgentQuotaQueue ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const limit = dailyLimit();
      if (!limit)
        throw new SyncError(403, "External model requests are disabled.");
      const root = path.resolve(process.env.GW_SYNC_DATA_DIR || ".gulf-wing"),
        file = path.join(root, "agent-allowance.json"),
        today = new Date().toISOString().slice(0, 10);
      let used = 0;
      try {
        const d = JSON.parse(await fs.readFile(file, "utf8"));
        if (
          typeof d.day !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(d.day) ||
          !Number.isSafeInteger(d.used) ||
          d.used < 0
        )
          throw Error();
        if (d.day === today) used = d.used;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT")
          throw new SyncError(
            503,
            "Agent request allowance could not be read; external requests stopped.",
          );
      }
      if (used >= limit)
        throw new SyncError(
          429,
          "Daily external request allowance reached. No external request was sent.",
        );
      await fs.mkdir(root, { recursive: true, mode: 0o700 });
      const temp = file + "." + randomBytes(8).toString("hex") + ".tmp";
      try {
        await fs.writeFile(
          temp,
          JSON.stringify({ day: today, used: used + 1 }),
          { mode: 0o600, flag: "wx" },
        );
        await fs.rename(temp, file);
      } finally {
        await fs.rm(temp, { force: true });
      }
    });
  globalAgent.gwAgentQuotaQueue = work.catch(() => {});
  await work;
}
export async function boundedJSON(r: Response, limit = 500000): Promise<any> {
  if (!r.ok) throw new Error("Upstream service rejected the request.");
  const reader = r.body?.getReader();
  if (!reader) throw Error("Empty upstream response.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw Error("Upstream response exceeded the limit.");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function callProvider(
  id: ProviderId,
  query: string,
  system: string,
  history: ConversationTurn[],
  signal: AbortSignal,
): Promise<string> {
  const timeout = AbortSignal.any([
    signal,
    AbortSignal.timeout(id === "local" ? 90000 : 30000),
  ]);
  const messages = [
    { role: "system", content: system },
    ...history,
    { role: "user", content: query },
  ];
  let url: string,
    headers: Record<string, string> = { "Content-Type": "application/json" },
    body: unknown;
  if (id === "local") {
    const model = await configuredLocalModel();
    if (!model) throw Error("Local model not configured.");
    url = "http://127.0.0.1:11434/api/chat";
    body = {
      model,
      stream: false,
      keep_alive: "2m",
      options: { num_ctx: 4096, num_predict: 256 },
      messages,
    };
  } else {
    const [keyVar, modelVar] = variables[id],
      key = process.env[keyVar]?.trim(),
      model = process.env[modelVar]?.trim();
    if (process.env.GW_NEXUS_ALLOW_EXTERNAL !== "1" || !key || !model)
      throw Error("Provider is not configured.");
    timeout.throwIfAborted();
    await reserveExternal();
    timeout.throwIfAborted();
    if (id === "openai") {
      url = "https://api.openai.com/v1/chat/completions";
      headers.Authorization = "Bearer " + key;
      body = { model, messages, max_completion_tokens: 512 };
    } else if (id === "anthropic") {
      url = "https://api.anthropic.com/v1/messages";
      headers["x-api-key"] = key;
      headers["anthropic-version"] = "2023-06-01";
      body = { model, max_tokens: 512, system, messages: messages.slice(1) };
    } else {
      if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model))
        throw Error("Invalid Gemini model name.");
      url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(model) +
        ":generateContent";
      headers["x-goog-api-key"] = key;
      body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [
          ...history.map((h) => ({
            role: h.role === "assistant" ? "model" : "user",
            parts: [{ text: h.content }],
          })),
          { role: "user", parts: [{ text: query }] },
        ],
        generationConfig: { maxOutputTokens: 512 },
      };
    }
  }
  const result = await boundedJSON(
    await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: timeout,
      redirect: "error",
    }),
  );
  const answer =
    id === "local"
      ? result.message?.content
      : id === "openai"
        ? result.choices?.[0]?.message?.content
        : id === "anthropic"
          ? result.content
              ?.filter((x: { type: string }) => x.type === "text")
              .map((x: { text: string }) => x.text)
              .join("\n")
          : result.candidates?.[0]?.content?.parts
              ?.map((p: { text?: string }) => p.text || "")
              .join("\n");
  if (typeof answer !== "string" || !answer.trim())
    throw Error("Provider returned no text.");
  return answer.slice(0, 12000);
}

// All local reasoning paths share one process-local inference slot on the 8 GB host.
const localInference = globalThis as typeof globalThis & {
  nexusLocalInferenceBusy?: boolean;
};
export async function askProvider(
  id: ProviderId,
  query: string,
  system: string,
  history: ConversationTurn[],
  signal: AbortSignal,
): Promise<string> {
  if (id !== "local") return callProvider(id, query, system, history, signal);
  if (localInference.nexusLocalInferenceBusy)
    throw new SyncError(
      429,
      "Local inference is busy. No cloud fallback was used.",
    );
  localInference.nexusLocalInferenceBusy = true;
  try {
    return await callProvider(id, query, system, history, signal);
  } finally {
    localInference.nexusLocalInferenceBusy = false;
  }
}
