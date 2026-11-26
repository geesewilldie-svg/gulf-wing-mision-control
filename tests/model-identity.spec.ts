import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { askProvider, providerStatus } from "../lib/server/agent-router";
import { modelIdentifier, type ModelIdentity } from "../lib/agent-router";
import { POST } from "../app/api/sync/nexus/route";
import { token } from "../lib/server/sync-store";
import { fixtureRole } from "./helpers/access";
async function fixture(run: (config: any) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "model-identity-"));
  const keys = [
    "GW_SYNC_DATA_DIR",
    "GW_NEXUS_MODEL",
    "GW_NEXUS_ALLOW_EXTERNAL",
  ] as const;
  const prior = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const original = globalThis.fetch;
  const config = {
    version: 1,
    pairingHash: "a".repeat(64),
    signingSecret: "b".repeat(64),
  };
  process.env.GW_SYNC_DATA_DIR = dir;
  process.env.GW_NEXUS_MODEL = "fixture:requested";
  delete process.env.GW_NEXUS_ALLOW_EXTERNAL;
  try {
    await fs.writeFile(
      path.join(dir, "sync-config.json"),
      JSON.stringify(config),
    );
    await run(config);
  } finally {
    globalThis.fetch = original;
    for (const k of keys) {
      if (prior[k] === undefined) delete process.env[k];
      else process.env[k] = prior[k];
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("model status reads configuration without generation probes; identifiers reject markup and oversized text", () =>
  fixture(async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      throw Error("No request expected");
    }) as typeof fetch;
    expect(
      (await providerStatus()).find((p) => p.id === "local"),
    ).toMatchObject({ configured: true, requestedModel: "fixture:requested" });
    expect(calls).toBe(0);
    expect(modelIdentifier("<script>bad</script>")).toBeNull();
    expect(modelIdentifier("x".repeat(201))).toBeNull();
    expect(modelIdentifier("org/model:quant")).toBe("org/model:quant");
  }));

test("successful model identity records requested and reported IDs, and missing metadata stays unknown", () =>
  fixture(async () => {
    let count = 0;
    let identity: ModelIdentity | undefined;
    globalThis.fetch = (async (_url, init) => {
      expect(JSON.parse(init!.body as string).model).toBe("fixture:requested");
      count++;
      return Response.json({
        message: { content: "Fixture answer" },
        ...(count === 1 ? { model: "fixture:reported" } : {}),
      });
    }) as typeof fetch;
    await askProvider(
      "local",
      "fixture",
      "fixture",
      [],
      new AbortController().signal,
      { onIdentity: (value) => (identity = value) },
    );
    expect(identity).toEqual({
      requestedModel: "fixture:requested",
      reportedModel: "fixture:reported",
    });
    await askProvider(
      "local",
      "fixture",
      "fixture",
      [],
      new AbortController().signal,
      { onIdentity: (value) => (identity = value) },
    );
    expect(identity).toEqual({
      requestedModel: "fixture:requested",
      reportedModel: null,
    });
    globalThis.fetch = (async () =>
      Response.json({ error: "rejected" }, { status: 500 })) as typeof fetch;
    identity = undefined;
    await expect(
      askProvider(
        "local",
        "fixture",
        "fixture",
        [],
        new AbortController().signal,
        { onIdentity: (value) => (identity = value) },
      ),
    ).rejects.toThrow();
    expect(identity).toBeUndefined();
  }));

test("real answer response carries per-request model metadata without an extra inference call", () =>
  fixture(async (config) => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return Response.json({
        model: "fixture:response",
        message: { content: "Fixture response" },
      });
    }) as typeof fetch;
    const response = await POST(
      new Request("http://localhost:3000/api/sync/nexus", {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "content-type": "application/json",
          cookie: "gw_sync_session=" + token(config, "controller"),
        },
        body: JSON.stringify({
          query: "Explain QUARTZ",
          mode: "local",
          workspaceScope: "Personal",
        }),
      }),
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.agents[0]).toMatchObject({
      provider: "local",
      requestedModel: "fixture:requested",
      reportedModel: "fixture:response",
    });
    expect(calls).toBe(1);
  }));

test("desktop and phone expose requested versus provider-reported models beside the answer", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  await page.route("**/api/sync/nexus", (route) =>
    route.request().method() !== "POST"
      ? route.continue()
      : route.fulfill({
          json: {
            engine: "Fixture",
            answer: "Fixture response",
            sources: [],
            agents: [
              {
                provider: "local",
                name: "Local Ollama",
                answer: "Fixture response",
                requestedModel: "fixture:requested",
                reportedModel: "fixture:reported",
              },
            ],
          },
        }),
  );
  await page.goto("/nexus");
  const { openAssistant } = await import("./helpers/assistant");
  await openAssistant(page);
  await page
    .locator("form")
    .getByLabel("Ask Nexus", { exact: true })
    .fill("Explain fixture");
  await page
    .locator("form")
    .getByRole("button", { name: "Ask Nexus", exact: true })
    .click();
  await page.getByText("Model response details", { exact: true }).click();
  await expect(page.getByText(/Requested: fixture:requested/)).toContainText(
    "Provider reported: fixture:reported",
  );
  await expect(
    page.getByText(/Requested model comes from this request/),
  ).toContainText("not independent identity verification");
});

test("external adapters normalize their response model metadata without probing or substitution", () =>
  fixture(async () => {
    const values: Record<string, string> = {
      GW_NEXUS_ALLOW_EXTERNAL: "1",
      GW_NEXUS_MAX_EXTERNAL_PER_DAY: "5",
      GW_NEXUS_OPENAI_KEY: "fixture-key",
      GW_NEXUS_OPENAI_MODEL: "fixture-openai",
      GW_NEXUS_ANTHROPIC_KEY: "fixture-key",
      GW_NEXUS_ANTHROPIC_MODEL: "fixture-claude",
      GW_NEXUS_GEMINI_KEY: "fixture-key",
      GW_NEXUS_GEMINI_MODEL: "fixture-gemini",
    };
    const previous = Object.fromEntries(
      Object.keys(values).map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, values);
    let calls = 0;
    globalThis.fetch = (async (url) => {
      calls++;
      if (String(url).includes("openai.com"))
        return Response.json({
          model: "reported-openai",
          choices: [{ message: { content: "Fixture" } }],
        });
      if (String(url).includes("anthropic.com"))
        return Response.json({
          model: "reported-claude",
          content: [{ type: "text", text: "Fixture" }],
        });
      expect(String(url)).toContain("generativelanguage.googleapis.com");
      return Response.json({
        modelVersion: "reported-gemini",
        candidates: [{ content: { parts: [{ text: "Fixture" }] } }],
      });
    }) as typeof fetch;
    try {
      for (const [provider, requested, reported] of [
        ["openai", "fixture-openai", "reported-openai"],
        ["anthropic", "fixture-claude", "reported-claude"],
        ["gemini", "fixture-gemini", "reported-gemini"],
      ] as const) {
        let identity: ModelIdentity | undefined;
        await askProvider(
          provider,
          "fixture",
          "fixture",
          [],
          new AbortController().signal,
          { onIdentity: (value) => (identity = value) },
        );
        expect(identity).toEqual({
          requestedModel: requested,
          reportedModel: reported,
        });
      }
      expect(calls).toBe(3);
    } finally {
      for (const key of Object.keys(values)) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  }));
