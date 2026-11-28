import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";
import { localModelIntent } from "../lib/local-model-intent";
import { conversationLocalModels } from "../lib/server/conversation-local-models";
import { POST } from "../app/api/sync/nexus/route";
import { token } from "../lib/server/sync-store";
import { fixtureRole } from "./helpers/access";
import { openAssistant } from "./helpers/assistant";
async function fixture(run: (config: any) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "local-model-catalog-"));
  const prior = process.env.GW_SYNC_DATA_DIR,
    model = process.env.GW_NEXUS_MODEL,
    original = globalThis.fetch;
  process.env.GW_SYNC_DATA_DIR = dir;
  process.env.GW_NEXUS_MODEL = "fixture";
  const config = {
    version: 1,
    pairingHash: "a".repeat(64),
    signingSecret: "b".repeat(64),
  };
  try {
    await fs.writeFile(
      path.join(dir, "sync-config.json"),
      JSON.stringify(config),
    );
    await run(config);
  } finally {
    globalThis.fetch = original;
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    if (model === undefined) delete process.env.GW_NEXUS_MODEL;
    else process.env.GW_NEXUS_MODEL = model;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const item = { name: "fixture:latest", size: 1024, digest: "a".repeat(64) };
test("local catalog wording is explicit and malformed follow-ups stay help-only", () => {
  for (const text of [
    "Show local models",
    "Nexus, please list my local models.",
    "Show installed local models",
  ])
    expect(localModelIntent(text)).toBe("catalog");
  expect(localModelIntent("Show local models and run them")).toBe("help");
  expect(localModelIntent("Don't show local models")).toBeNull();
  expect(localModelIntent("Explain the phrase show local models")).toBeNull();
});
test("named model inspection accepts only exact simple identifiers and never guesses voice aliases", () => {
  expect(localModelIntent("Nexus, inspect local model fixture:latest")).toEqual(
    { kind: "details", model: "fixture:latest" },
  );
  expect(localModelIntent("inspect local model name.")).toEqual({
    kind: "details",
    model: "name.",
  });
  for (const text of [
    "inspect local model",
    "inspect local model https://example.test",
    "inspect local model foo-cloud",
    "inspect local model provider/model",
    "inspect local model fixture and run it",
  ])
    expect(localModelIntent(text)).toBe("help");
  expect(localModelIntent("Don't inspect local model fixture")).toBeNull();
});
test("named metadata inspection fences catalog identity and withholds stale/unknown selections without generation", () =>
  fixture(async () => {
    const paths: string[] = [];
    let tags = 0,
      changeAt = Infinity;
    global.fetch = async (url, init) => {
      paths.push(String(url));
      if (String(url).endsWith("/api/tags")) {
        tags++;
        return Response.json({
          models: [
            {
              ...item,
              digest: tags >= changeAt ? "b".repeat(64) : item.digest,
            },
          ],
        });
      }
      expect(String(url)).toBe("http://127.0.0.1:11434/api/show");
      expect(JSON.parse(init!.body as string)).toEqual({
        model: item.name,
        verbose: false,
      });
      return Response.json({
        capabilities: ["completion"],
        details: { format: "gguf" },
        model_info: {
          "general.architecture": "fixture",
          "fixture.context_length": 2048,
        },
        template: "PRIVATE_TEMPLATE",
        system: "PRIVATE_SYSTEM",
      });
    };
    const read = await conversationLocalModels(
      { kind: "details", model: item.name },
      new AbortController().signal,
    );
    expect("localModelDetails" in read && read.localModelDetails).toMatchObject(
      {
        model: item.name,
        digest: item.digest,
        contextLength: 2048,
        capabilities: ["completion"],
      },
    );
    expect(read.answer).not.toContain(item.name);
    expect(JSON.stringify(read)).not.toMatch(/PRIVATE_TEMPLATE|PRIVATE_SYSTEM/);
    expect(paths.map((p) => p.split("/").pop())).toEqual([
      "tags",
      "tags",
      "show",
      "tags",
    ]);
    paths.length = 0;
    tags = 0;
    await expect(
      conversationLocalModels(
        { kind: "details", model: "fixture" },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/exact model/);
    expect(paths).toHaveLength(1);
    paths.length = 0;
    tags = 0;
    changeAt = 2;
    await expect(
      conversationLocalModels(
        { kind: "details", model: item.name },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/changed/);
    expect(paths).toHaveLength(2);
    paths.length = 0;
    tags = 0;
    changeAt = 3;
    await expect(
      conversationLocalModels(
        { kind: "details", model: item.name },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/changed/);
    expect(paths.map((p) => p.split("/").pop())).toEqual([
      "tags",
      "tags",
      "show",
      "tags",
    ]);
  }));
test("conversation metadata lookup calls only local tags, with truthful coverage and no spoken model names", () =>
  fixture(async () => {
    let calls = 0;
    global.fetch = async (url, init) => {
      calls++;
      expect(String(url)).toBe("http://127.0.0.1:11434/api/tags");
      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      return Response.json({
        models: [item, { name: "PRIVATE_PROJECT", size: 1 }],
      });
    };
    const result = await conversationLocalModels(
      "catalog",
      new AbortController().signal,
    );
    expect("localModels" in result && result.localModels.uniqueModels).toBe(2);
    expect(result.answer).not.toContain("PRIVATE_PROJECT");
    expect(result).toMatchObject({
      resetHistory: true,
      clearRecordReferences: true,
      routing: { selected: [] },
    });
    expect(calls).toBe(1);
    await conversationLocalModels("help", new AbortController().signal);
    expect(calls).toBe(1);
  }));
test("controller/origin/local-mode checks precede metadata and sharing flags never cause model generation", () =>
  fixture(async (config) => {
    let calls = 0;
    global.fetch = async (url) => {
      calls++;
      expect(String(url)).toBe("http://127.0.0.1:11434/api/tags");
      return Response.json({ models: [item] });
    };
    const send = (
      role: string | null = "controller",
      extra: any = {},
      origin = "http://localhost:3000",
    ) =>
      POST(
        new Request("http://localhost:3000/api/sync/nexus", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin,
            "content-type": "application/json",
            ...(role
              ? { cookie: "gw_sync_session=" + token(config, role as any) }
              : {}),
          },
          body: JSON.stringify({
            query: "Show local models",
            mode: "auto",
            ...extra,
          }),
        }),
      );
    expect((await send(null)).status).toBe(401);
    expect((await send("display")).status).toBe(403);
    expect((await send("controller", {}, "https://foreign.test")).status).toBe(
      403,
    );
    for (const mode of ["knowledge", "compare", "openai"])
      expect(
        (await send("controller", { mode, allowExternal: true })).status,
      ).toBe(403);
    expect(calls).toBe(0);
    const response = await send("controller", {
      voiceConversation: true,
      allowExternal: true,
      publicQuery: "unused public words",
    });
    expect(response.status).toBe(200);
    expect((await response.json()).localModels.models[0].name).toBe(item.name);
    expect(calls).toBe(1);
    global.fetch = async () => {
      calls++;
      throw Error("private runtime error");
    };
    const unavailable = await send();
    expect(unavailable.status).toBe(503);
    expect(JSON.stringify(await unavailable.json())).not.toContain(
      "private runtime error",
    );
    expect(calls).toBe(2);
  }));
test("compiled conversational API reads the owned local metadata fixture without generation", async ({
  context,
}) => {
  await fixtureRole(context);
  const paths: string[] = [];
  const server = createServer((req, res) => {
    paths.push(req.url!);
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/show" && req.method === "POST") {
      res.end(
        JSON.stringify({
          capabilities: ["completion"],
          details: { format: "gguf" },
        }),
      );
      return;
    }
    if (req.url !== "/api/tags" || req.method !== "GET") {
      res.statusCode = 400;
      res.end("{}");
      return;
    }
    res.end(JSON.stringify({ models: [item] }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(11434, "127.0.0.1", resolve);
  });
  try {
    const response = await context.request.post("/api/sync/nexus", {
      data: {
        query: "Show local models",
        mode: "auto",
        voiceConversation: true,
      },
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).localModels.models[0].name).toBe(item.name);
    expect(paths).toEqual(["/api/tags"]);
    const detail = await context.request.post("/api/sync/nexus", {
      data: {
        query: "Inspect local model fixture:latest",
        mode: "auto",
        voiceConversation: true,
      },
    });
    expect(detail.status()).toBe(200);
    expect((await detail.json()).localModelDetails).toMatchObject({
      model: item.name,
      digest: item.digest,
      format: "gguf",
    });
    expect(paths).toEqual([
      "/api/tags",
      "/api/tags",
      "/api/tags",
      "/api/show",
      "/api/tags",
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("assistant displays the returned catalog without duplicate requests and keeps model details explicit", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let metadataRequests = 0;
  await page.route("**/api/sync/agents", (route) => {
    if (route.request().method() === "POST") {
      metadataRequests++;
      return route.fulfill({
        status: 503,
        json: { error: "Explicit detail test unavailable" },
      });
    }
    return route.fulfill({ json: { providers: [], events: [], workers: [] } });
  });
  const detailResult = {
    model: item.name,
    digest: item.digest,
    checkedAt: "2026-11-27T20:00:00.000Z",
    format: "gguf",
    family: "fixture",
    parameterSize: "1B",
    parameterCount: 1000000,
    quantization: "Q4",
    architecture: "fixture",
    contextLength: 2048,
    embeddingLength: 128,
    capabilities: ["completion"],
    capabilitiesKnown: true,
    capabilitiesOmitted: 0,
    notice:
      "Runtime metadata only. Hardware fit and inference readiness were not tested.",
  };
  await page.route("**/api/sync/nexus", (route) =>
    route.request().method() === "POST" &&
    route.request().postDataJSON().query ===
      "Inspect local model fixture:latest"
      ? route.fulfill({
          json: {
            engine: "Nexus local model details",
            sources: [],
            warnings: [],
            answer: "Requested metadata displayed; no model was run.",
            resetHistory: true,
            clearRecordReferences: true,
            localModelDetails: detailResult,
          },
        })
      : route.request().method() === "POST"
        ? route.fulfill({
            json: {
              engine: "Nexus local model catalog",
              sources: [],
              warnings: [],
              answer: "One reported local model. No model was run or changed.",
              resetHistory: true,
              clearRecordReferences: true,
              localModels: {
                checkedAt: "2026-11-27T20:00:00.000Z",
                configuredModel: "fixture:latest",
                configuredListed: true,
                reportedEntries: 1,
                uniqueModels: 1,
                omitted: 0,
                rejectedEntries: 0,
                models: [
                  {
                    name: item.name,
                    digest: item.digest,
                    bytes: 1024,
                    modifiedAt: null,
                  },
                ],
                notice: "Metadata only; no proof of hardware fit.",
              },
            },
          })
        : route.fulfill({
            json: {
              sources: [],
              providers: [],
              sections: 0,
              localModel: false,
            },
          }),
  );
  await page.goto("/nexus");
  await openAssistant(page);
  const drawer = page.getByRole("complementary", {
    name: "Nexus personal assistant",
    exact: true,
  });
  await drawer
    .getByRole("textbox", { name: "Ask Nexus", exact: true })
    .fill("Show local models");
  await drawer.getByRole("button", { name: "Ask Nexus", exact: true }).click();
  const region = drawer.getByRole("region", {
    name: "Local model catalog results",
    exact: true,
  });
  await expect(region).toContainText(item.name);
  await expect(region).toContainText("Metadata only");
  expect(metadataRequests).toBe(0);
  expect(
    await region.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await fs.mkdir("artifacts/conversation-local-models", { recursive: true });
  await region.screenshot({
    path: `artifacts/conversation-local-models/${info.project.name}.png`,
  });
  await drawer
    .getByRole("textbox", { name: "Ask Nexus", exact: true })
    .fill("Inspect local model fixture:latest");
  await drawer.getByRole("button", { name: "Ask Nexus", exact: true }).click();
  const detailRegion = drawer.getByRole("region", {
    name: "Runtime model result fixture:latest",
    exact: true,
  });
  await expect(detailRegion).toContainText("2048");
  await expect(detailRegion).toContainText(
    "Hardware fit and inference readiness were not tested",
  );
  expect(metadataRequests).toBe(0);
  expect(
    await detailRegion.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await detailRegion.screenshot({
    path: `artifacts/conversation-local-models/${info.project.name}-details.png`,
  });
  const checkButton = detailRegion.getByRole("button", {
    name: "Run local model check · fixture:latest",
    exact: true,
  });
  await checkButton.evaluate((el) => el.scrollIntoView({ block: "center" }));
  expect((await checkButton.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(
    await checkButton.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2),
      );
    }),
  ).toBe(true);
  expect(metadataRequests).toBe(0);
  await page.screenshot({
    path: `artifacts/conversation-local-models/${info.project.name}-detail-control.png`,
  });
});
