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
test("only exact explicit run wording selects a fixed diagnostic", () => {
  expect(
    localModelIntent("Nexus, please run local model check fixture:latest"),
  ).toEqual({ kind: "check", model: item.name });
  for (const text of [
    "Run local model check",
    "Run local model check https://example.test",
    "Run local model check fixture and install it",
    "Run local model check foo-cloud",
  ])
    expect(localModelIntent(text)).toBe("help");
  expect(
    localModelIntent("Don't run local model check fixture:latest"),
  ).toBeNull();
  expect(
    localModelIntent("Explain run local model check fixture:latest"),
  ).toBeNull();
});
test("conversation diagnostic uses one fixed generation, no owner context, and reports saved versus pending outcomes", () =>
  fixture(async () => {
    let generations = 0,
      unexpected = false;
    const calls: string[] = [];
    global.fetch = async (url, init) => {
      calls.push(String(url));
      if (String(url).endsWith("/api/tags"))
        return Response.json({ models: [item] });
      if (String(url).endsWith("/api/show"))
        return Response.json({ capabilities: ["completion"] });
      expect(String(url)).toBe("http://127.0.0.1:11434/api/generate");
      generations++;
      const body = JSON.parse(init!.body as string);
      expect(body).toEqual({
        model: item.name,
        prompt: "Reply with exactly NEXUS_OK and no other text.",
        system:
          "You are performing a local diagnostic. Follow the user's instruction exactly.",
        stream: false,
        think: false,
        keep_alive: 0,
        options: { num_predict: 8, num_ctx: 512, temperature: 0 },
      });
      return Response.json({
        model: item.name,
        done: true,
        response: unexpected ? "PRIVATE_UNEXPECTED_OUTPUT" : "NEXUS_OK",
        eval_count: 3,
      });
    };
    const first = await conversationLocalModels(
      { kind: "check", model: item.name },
      new AbortController().signal,
    );
    expect("localModelCheck" in first && first.localModelCheck).toMatchObject({
      state: "passed",
      receiptState: "saved",
    });
    expect(first.answer).toContain("for this run");
    expect(first.answer).not.toContain(item.name);
    expect(first).toMatchObject({
      resetHistory: true,
      clearRecordReferences: true,
      routing: { selected: [] },
    });
    expect(generations).toBe(1);
    const dir = path.join(
      process.env.GW_SYNC_DATA_DIR!,
      "local-model-check-receipts",
    );
    await fs.rm(dir, { recursive: true });
    await fs.writeFile(dir, "unsafe store", { flag: "wx" });
    unexpected = true;
    const second = await conversationLocalModels(
      { kind: "check", model: item.name },
      new AbortController().signal,
    );
    expect("localModelCheck" in second && second.localModelCheck).toMatchObject(
      { state: "unexpected-response", receiptState: "pending" },
    );
    expect(second.answer).toContain("Do not rerun solely");
    expect(JSON.stringify(second)).not.toContain("PRIVATE_UNEXPECTED_OUTPUT");
    expect(await fs.readFile(dir, "utf8")).toBe("unsafe store");
    expect(generations).toBe(2);
    expect(
      calls.every((url) => url.startsWith("http://127.0.0.1:11434/")),
    ).toBe(true);
  }));
test("unknown names, missing completion and cancelled requests cannot start generation", () =>
  fixture(async () => {
    let generations = 0;
    global.fetch = async (url) => {
      if (String(url).endsWith("/api/tags"))
        return Response.json({ models: [item] });
      if (String(url).endsWith("/api/show"))
        return Response.json({ capabilities: ["embedding"] });
      generations++;
      throw Error("Generation forbidden");
    };
    await expect(
      conversationLocalModels(
        { kind: "check", model: "fixture" },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/exact model/);
    await expect(
      conversationLocalModels(
        { kind: "check", model: item.name },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/completion/);
    const abort = new AbortController();
    abort.abort();
    await expect(
      conversationLocalModels(
        { kind: "check", model: item.name },
        abort.signal,
      ),
    ).rejects.toThrow();
    expect(generations).toBe(0);
  }));
test("run command requires controller/origin/local mode and sharing flags never add another generation", () =>
  fixture(async (config) => {
    let generations = 0;
    global.fetch = async (url) => {
      if (String(url).endsWith("/api/tags"))
        return Response.json({ models: [item] });
      if (String(url).endsWith("/api/show"))
        return Response.json({ capabilities: ["completion"] });
      expect(String(url)).toBe("http://127.0.0.1:11434/api/generate");
      generations++;
      return Response.json({
        model: item.name,
        done: true,
        response: "NEXUS_OK",
        eval_count: 3,
      });
    };
    const send = (
      role: string | null = "controller",
      mode = "auto",
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
            query: "Run local model check fixture:latest",
            mode,
            voiceConversation: true,
            allowExternal: true,
            publicQuery: "PRIVATE_UNUSED_CONTEXT",
            history: [{ role: "user", content: "PRIVATE_HISTORY" }],
          }),
        }),
      );
    expect((await send(null)).status).toBe(401);
    expect((await send("display")).status).toBe(403);
    expect(
      (await send("controller", "auto", "https://foreign.test")).status,
    ).toBe(403);
    for (const mode of ["knowledge", "compare", "openai"])
      expect((await send("controller", mode)).status).toBe(403);
    expect(generations).toBe(0);
    const response = await send();
    expect(response.status).toBe(200);
    expect((await response.json()).localModelCheck.state).toBe("passed");
    expect(generations).toBe(1);
  }));
test("compiled run command returns a fixed owned-runtime result and separate saved receipt", async ({
  context,
}) => {
  await fixtureRole(context);
  let generations = 0,
    runId: string | undefined;
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/tags") {
      res.end(JSON.stringify({ models: [item] }));
      return;
    }
    if (req.url === "/api/show") {
      res.end(JSON.stringify({ capabilities: ["completion"] }));
      return;
    }
    if (req.url === "/api/generate") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const value = JSON.parse(body);
        expect(value.prompt).toBe(
          "Reply with exactly NEXUS_OK and no other text.",
        );
        expect(value.options).toEqual({
          num_predict: 8,
          num_ctx: 512,
          temperature: 0,
        });
        expect(value.images).toBeUndefined();
        generations++;
        res.end(
          JSON.stringify({
            model: item.name,
            done: true,
            response: "NEXUS_OK",
            eval_count: 3,
          }),
        );
      });
      return;
    }
    res.statusCode = 400;
    res.end("{}");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(11434, "127.0.0.1", resolve);
  });
  try {
    const response = await context.request.post("/api/sync/nexus", {
      data: {
        query: "Run local model check fixture:latest",
        mode: "auto",
        voiceConversation: true,
      },
    });
    expect(response.status()).toBe(200);
    const result = await response.json();
    runId = result.localModelCheck.runId;
    expect(result.localModelCheck).toMatchObject({
      state: "passed",
      receiptState: "saved",
    });
    expect(generations).toBe(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (runId) {
      const dir = path.join(
        process.env.GW_SYNC_TEST_ROOT!,
        "local-model-check-receipts",
      );
      for (const name of await fs.readdir(dir)) {
        if (!/^\d+\.json$/.test(name)) continue;
        const file = path.join(dir, name);
        try {
          if (JSON.parse(await fs.readFile(file, "utf8")).runId === runId)
            await fs.unlink(file);
        } catch {}
      }
    }
  }
});
test("assistant displays and exports returned test result without running it again", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let calls = 0;
  const value = {
    runId: "00000000-0000-4000-8000-000000000001",
    model: item.name,
    digest: item.digest,
    reportedModel: item.name,
    checkedAt: "2026-11-28T12:00:00.000Z",
    elapsedMs: 100,
    state: "passed",
    reportedOutputTokens: 3,
    receiptState: "saved",
    notice:
      "This completed fixed diagnostic is historical; hardware fit remains unverified.",
  };
  await page.route("**/api/sync/agents", (route) => {
    if (route.request().method() === "POST") {
      calls++;
      return route.fulfill({
        status: 403,
        json: { error: "Controller required" },
      });
    }
    return route.fulfill({ json: { providers: [], events: [], workers: [] } });
  });
  await page.route("**/api/sync/nexus", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          json: {
            engine: "Nexus local model diagnostic",
            sources: [],
            warnings: [],
            resetHistory: true,
            clearRecordReferences: true,
            answer: "Fixed test passed for this run.",
            localModelCheck: value,
          },
        })
      : route.fulfill({
          json: { sources: [], providers: [], sections: 0, localModel: false },
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
    .fill("Run local model check fixture:latest");
  await drawer.getByRole("button", { name: "Ask Nexus", exact: true }).click();
  const region = drawer.getByRole("region", {
    name: "Local check result fixture:latest",
    exact: true,
  });
  await expect(region).toContainText("Fixed local test passed");
  await expect(region).toContainText("Completed result saved locally");
  expect(calls).toBe(0);
  const event = page.waitForEvent("download");
  await region
    .getByRole("button", {
      name: "Download this model diagnostic",
      exact: true,
    })
    .click();
  const download = await event;
  expect(
    JSON.parse(await fs.readFile((await download.path())!, "utf8")).runId,
  ).toBe(value.runId);
  expect(calls).toBe(0);
  expect(
    await region.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await fs.mkdir("artifacts/conversation-model-check", { recursive: true });
  await region.screenshot({
    path: `artifacts/conversation-model-check/${info.project.name}.png`,
  });
});
