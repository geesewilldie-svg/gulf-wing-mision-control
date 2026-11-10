import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  writePublicConfig,
  availablePublicModels,
  validatePublicConfig,
  PUBLIC_MODELS,
} from "../scripts/gemini-public-lib.mjs";
import {
  askPublicGemini,
  publicQuestion,
  publicGeminiStatus,
  disablePublicGemini,
  hasPublicGeminiPolicy,
} from "../lib/server/gemini-public";
import { providerStatus, askProvider } from "../lib/server/agent-router";
import { planAgents } from "../lib/agent-router";
const key = "synthetic_key_012345678901234567890";
const base = {
  version: 1,
  policy: "public-only",
  enabled: true,
  secretType: "windows-dpapi",
  protectedKey: "01000000" + "ab".repeat(100),
  model: "gemini-3.5-flash-lite",
  dailyLimit: 10,
};
const prompt = {
  question: "Explain photosynthesis in simple terms.",
  confirmedPublic: true,
};
const unlock = async () => key;
const signal = () => new AbortController().signal;
test.describe("Gemini Public privacy boundary", () => {
  let dir: string, env: NodeJS.ProcessEnv;
  test.beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-public-"));
    env = { ...process.env };
    process.env.GW_SYNC_DATA_DIR = dir;
    await writePublicConfig(base, dir);
  });
  test.afterEach(async () => {
    for (const k of Object.keys(process.env))
      if (!(k in env)) delete process.env[k];
    Object.assign(process.env, env);
    await fs.rm(dir, { recursive: true, force: true });
  });
  test("request contains one fresh question and fixed system text, never private sources or history", async () => {
    for (const name of [
      "knowledge.json",
      "business.json",
      "google-drive-index.json",
      "brief-settings.json",
    ])
      await fs.writeFile(path.join(dir, name), "PRIVATE_CANARY_" + name);
    let sent: any;
    const result = await askPublicGemini(
      prompt,
      signal(),
      (async (url: any, init: any) => {
        expect(String(url)).toBe(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
        );
        expect(init.redirect).toBe("error");
        expect(init.headers["x-goog-api-key"]).toBe(key);
        sent = JSON.parse(init.body);
        return Response.json({
          candidates: [
            {
              content: {
                parts: [
                  { text: "hidden internal thought", thought: true },
                  { text: "Plants use light." },
                ],
              },
              finishReason: "MAX_TOKENS",
            },
          ],
        });
      }) as typeof fetch,
      unlock,
    );
    expect(Object.keys(sent).sort()).toEqual([
      "contents",
      "generationConfig",
      "systemInstruction",
    ]);
    expect(sent.contents).toEqual([
      { role: "user", parts: [{ text: prompt.question }] },
    ]);
    expect(JSON.stringify(sent)).not.toContain("PRIVATE_CANARY");
    expect(sent.tools).toBeUndefined();
    expect(result.answer).toBe("Plants use light.");
    expect(result.sources).toEqual([]);
    expect(result.truncated).toBe(true);
    const status = await publicGeminiStatus();
    expect(JSON.stringify(status)).not.toContain(base.protectedKey);
    expect(JSON.stringify(status)).not.toContain(key);
  });
  test("confirmation is required and extra context fields fail before any provider call", async () => {
    for (const extra of [
      { sources: ["secret"] },
      { history: ["secret"] },
      { memory: "secret" },
      { attachments: [] },
      { system: "override" },
      { allowExternal: true },
    ])
      expect(() => publicQuestion({ ...prompt, ...extra })).toThrow(
        "not accepted",
      );
    expect(() =>
      publicQuestion({ ...prompt, confirmedPublic: false }),
    ).toThrow();
    expect(() =>
      publicQuestion({ ...prompt, question: "x".repeat(2001) }),
    ).toThrow();
    expect(() => publicQuestion([])).toThrow();
    let calls = 0;
    await expect(
      askPublicGemini(
        { ...prompt, history: [] },
        signal(),
        (async () => {
          calls++;
          return Response.json({});
        }) as typeof fetch,
        unlock,
      ),
    ).rejects.toThrow("not accepted");
    expect(calls).toBe(0);
  });
  test("Auto, Compare and direct private-context Gemini calls remain blocked even with old environment keys", async () => {
    process.env.GW_NEXUS_ALLOW_EXTERNAL = "1";
    process.env.GW_NEXUS_GEMINI_KEY = key;
    process.env.GW_NEXUS_GEMINI_MODEL = "gemini-3.5-flash-lite";
    process.env.GW_NEXUS_MAX_EXTERNAL_PER_DAY = "10";
    const providers = await providerStatus();
    expect(providers.find((p) => p.id === "gemini")?.configured).toBe(false);
    expect(
      planAgents("auto", "google document", providers, true),
    ).not.toContain("gemini");
    expect(
      planAgents("compare", "google document", providers, true),
    ).not.toContain("gemini");
    await expect(
      askProvider("gemini", "private", "PRIVATE_CANARY", [], signal()),
    ).rejects.toThrow("public-only");
    await fs.writeFile(path.join(dir, "gemini-public.json"), "broken");
    expect(await hasPublicGeminiPolicy()).toBe(true);
    await expect(
      askProvider("gemini", "private", "PRIVATE_CANARY", [], signal()),
    ).rejects.toThrow("public-only");
    expect((await publicGeminiStatus()).enabled).toBe(false);
  });
  test("durable daily allowance counts failures, survives setup reruns and never silently retries", async () => {
    await writePublicConfig({ ...base, dailyLimit: 2 }, dir);
    let calls = 0;
    const transport = (async () => {
      calls++;
      return new Response("PRIVATE_PROVIDER_ERROR", { status: 429 });
    }) as typeof fetch;
    for (let i = 0; i < 2; i++)
      await expect(
        askPublicGemini(prompt, signal(), transport, unlock),
      ).rejects.toThrow("rejected");
    await writePublicConfig({ ...base, dailyLimit: 2 }, dir);
    await expect(
      askPublicGemini(prompt, signal(), transport, unlock),
    ).rejects.toThrow("allowance reached");
    expect(calls).toBe(2);
    await fs.writeFile(
      path.join(dir, "gemini-public-allowance.json"),
      "broken",
    );
    await expect(
      askPublicGemini(prompt, signal(), transport, unlock),
    ).rejects.toThrow("allowance cannot be read");
    expect(calls).toBe(2);
  });
  test("disable during unlock prevents generation; disabled config still blocks private routing", async () => {
    let calls = 0;
    await expect(
      askPublicGemini(
        prompt,
        signal(),
        (async () => {
          calls++;
          return Response.json({});
        }) as typeof fetch,
        async () => {
          await disablePublicGemini();
          return key;
        },
      ),
    ).rejects.toThrow("disabled before sending");
    expect(calls).toBe(0);
    expect((await publicGeminiStatus()).enabled).toBe(false);
    expect(await hasPublicGeminiPolicy()).toBe(true);
  });
  test("busy and aborted requests do not create extra provider attempts", async () => {
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      seen = new Promise<void>((r) => (entered = r));
    let calls = 0;
    const first = askPublicGemini(
      prompt,
      signal(),
      (async () => {
        calls++;
        entered();
        await gate;
        return Response.json({
          candidates: [{ content: { parts: [{ text: "Public answer" }] } }],
        });
      }) as typeof fetch,
      unlock,
    );
    await seen;
    await expect(
      askPublicGemini(prompt, signal(), fetch, unlock),
    ).rejects.toThrow("Another public");
    release();
    await first;
    expect(calls).toBe(1);
    const abort = new AbortController();
    abort.abort();
    await expect(
      askPublicGemini(prompt, abort.signal, fetch, unlock),
    ).rejects.toThrow();
  });
  test("model discovery uses only Google metadata, filters unsupported/paid-only names and never writes a plaintext key", async () => {
    const models = await availablePublicModels(
      key,
      async (url: any, init: any) => {
        expect(new URL(url).origin).toBe(
          "https://generativelanguage.googleapis.com",
        );
        expect(String(url)).not.toContain(key);
        expect(init.headers["x-goog-api-key"]).toBe(key);
        return Response.json({
          models: [
            {
              name: "models/gemini-3.5-flash-lite",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/paid-only-pro",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/gemini-3.8-flash",
              supportedGenerationMethods: ["embedContent"],
            },
          ],
        });
      },
    );
    expect(models).toEqual(["gemini-3.5-flash-lite"]);
    expect(PUBLIC_MODELS).not.toContain("paid-only-pro");
    expect(() =>
      validatePublicConfig({ ...base, key, protectedKey: key }),
    ).toThrow();
    expect(
      await fs.readFile(path.join(dir, "gemini-public.json"), "utf8"),
    ).not.toContain(key);
  });
  test("provider output is bounded, empty/thought-only answers do not count as a visible success", async () => {
    for (const response of [
      () => new Response("x".repeat(500001)),
      () =>
        Response.json({
          candidates: [
            {
              content: {
                parts: [{ thought: true, text: "not a user answer" }],
              },
            },
          ],
        }),
    ])
      await expect(
        askPublicGemini(
          prompt,
          signal(),
          (async () => response()) as typeof fetch,
          unlock,
        ),
      ).rejects.toThrow();
  });
});
