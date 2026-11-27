import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { checkLocalModel } from "../lib/server/local-model-check";
import { askProvider } from "../lib/server/agent-router";
import { POST } from "../app/api/sync/agents/route";
import { token } from "../lib/server/sync-store";
import { fixtureRole } from "./helpers/access";
const name = "fixture:latest",
  digest = "a".repeat(64),
  input = { action: "local-model-check", model: name, digest, runTest: true };
const listed = { name, digest, size: 100, modified_at: "2026-11-26T12:00:00Z" };
const details = { details: { format: "gguf" }, capabilities: ["completion"] };
const answer = {
  model: name,
  done: true,
  response: "NEXUS_OK",
  eval_count: 5,
  context: [1, 2],
  thinking: "PRIVATE THINKING",
};
const signal = () => new AbortController().signal;
const urls: string[] = [];
async function fixture(run: (config: any) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-check-")),
    previous = process.env.GW_SYNC_DATA_DIR,
    model = process.env.GW_NEXUS_MODEL,
    transport = global.fetch;
  process.env.GW_SYNC_DATA_DIR = root;
  process.env.GW_NEXUS_MODEL = "fixture";
  const config = {
    version: 1,
    pairingHash: "a".repeat(64),
    signingSecret: "b".repeat(64),
  };
  await fs.writeFile(
    path.join(root, "sync-config.json"),
    JSON.stringify(config),
  );
  urls.length = 0;
  global.fetch = async (url, options) => {
    urls.push(String(url));
    expect(String(url)).toMatch(
      /^http:\/\/127\.0\.0\.1:11434\/api\/(tags|show|generate)$/,
    );
    if (String(url).endsWith("/api/tags"))
      return Response.json({ models: [listed] });
    if (String(url).endsWith("/api/show")) return Response.json(details);
    expect(options?.credentials).toBe("omit");
    expect(options?.redirect).toBe("error");
    expect(JSON.parse(String(options?.body))).toEqual({
      model: name,
      prompt: "Reply with exactly NEXUS_OK and no other text.",
      system:
        "You are performing a local diagnostic. Follow the user's instruction exactly.",
      stream: false,
      think: false,
      keep_alive: 0,
      options: { num_predict: 8, num_ctx: 512, temperature: 0 },
    });
    return Response.json(answer);
  };
  try {
    await run(config);
  } finally {
    global.fetch = transport;
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    if (model === undefined) delete process.env.GW_NEXUS_MODEL;
    else process.env.GW_NEXUS_MODEL = model;
    await fs.rm(root, { recursive: true, force: true });
  }
}
test("fixed diagnostic supplies no private context or caller options and accepts only one current-model result", () =>
  fixture(async () => {
    const result = await checkLocalModel(input, signal());
    expect(result).toMatchObject({
      model: name,
      digest,
      reportedModel: name,
      state: "passed",
      reportedOutputTokens: 5,
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(result).not.toHaveProperty("response");
    expect(urls.map((u) => u.split("/").pop())).toEqual([
      "tags",
      "show",
      "tags",
      "generate",
      "tags",
    ]);
    expect(process.env.GW_NEXUS_MODEL).toBe("fixture");
  }));
test("explicit acknowledgment, simple local identity and completion capability gate generation", () =>
  fixture(async () => {
    for (const value of [
      { ...input, runTest: false },
      { ...input, prompt: "private" },
      { ...input, model: "foo:cloud" },
      { ...input, digest: null },
    ])
      await expect(checkLocalModel(value, signal())).rejects.toThrow();
    expect(urls.length).toBe(0);
    global.fetch = async (url) =>
      Response.json(
        String(url).endsWith("/tags")
          ? { models: [listed] }
          : { capabilities: ["embedding"] },
      );
    await expect(checkLocalModel(input, signal())).rejects.toThrow(
      /completion capability/,
    );
  }));
test("unexpected text and over-budget token reports never become passed diagnostics", () =>
  fixture(async () => {
    for (const generated of [
      { ...answer, response: "something else" },
      { ...answer, eval_count: 9 },
    ]) {
      const original = global.fetch;
      global.fetch = async (url, options) =>
        String(url).endsWith("/generate")
          ? Response.json(generated)
          : original(url, options);
      expect((await checkLocalModel(input, signal())).state).toBe(
        "unexpected-response",
      );
      global.fetch = original;
    }
  }));
test("incomplete, wrong-model, oversized and changed-model results reject without retry", () =>
  fixture(async () => {
    for (const mode of ["incomplete", "wrong-model", "oversized", "changed"]) {
      const original = global.fetch;
      let generated = false,
        calls = 0;
      global.fetch = async (url, options) => {
        if (String(url).endsWith("/generate")) {
          calls++;
          generated = true;
          return Response.json(
            mode === "incomplete"
              ? { ...answer, done: false }
              : mode === "wrong-model"
                ? { ...answer, model: "other" }
                : mode === "oversized"
                  ? { ...answer, response: "x".repeat(32001) }
                  : answer,
          );
        }
        if (generated && mode === "changed")
          return Response.json({
            models: [{ ...listed, digest: "b".repeat(64) }],
          });
        return original(url, options);
      };
      await expect(checkLocalModel(input, signal())).rejects.toThrow();
      expect(calls).toBe(1);
      global.fetch = original;
    }
  }));
test("cancellation releases the shared answer/planning slot and never retries uncertain generation", () =>
  fixture(async () => {
    const original = global.fetch;
    let generated!: () => void;
    const reached = new Promise<void>((resolve) => (generated = resolve));
    let calls = 0;
    global.fetch = async (url, options) => {
      if (!String(url).endsWith("/generate")) return original(url, options);
      calls++;
      generated();
      return new Promise((_resolve, reject) =>
        options?.signal?.addEventListener(
          "abort",
          () => reject(Error("cancel")),
          { once: true },
        ),
      );
    };
    const controller = new AbortController(),
      pending = checkLocalModel(input, controller.signal);
    const rejected = expect(pending).rejects.toThrow(/cancelled/);
    await reached;
    await expect(
      askProvider("local", "PRIVATE QUESTION", "PRIVATE SYSTEM", [], signal()),
    ).rejects.toThrow(/busy/);
    await expect(checkLocalModel(input, signal())).rejects.toThrow(/busy/);
    controller.abort();
    await rejected;
    expect(calls).toBe(1);
    global.fetch = original;
    expect((await checkLocalModel(input, signal())).state).toBe("passed");
  }));
test("diagnostic API requires controller/origin and exact explicit input", () =>
  fixture(async (config) => {
    const send = (
      role: string | null,
      origin = "http://localhost:3000",
      body: any = input,
    ) =>
      POST(
        new Request("http://localhost:3000/api/sync/agents", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin,
            "content-type": "application/json",
            ...(role
              ? { cookie: "gw_sync_session=" + token(config, role as any) }
              : {}),
          },
          body: JSON.stringify(body),
        }),
      );
    expect((await send(null)).status).toBe(401);
    expect((await send("display")).status).toBe(403);
    expect((await send("controller", "https://foreign.invalid")).status).toBe(
      403,
    );
    expect(
      (
        await send("controller", undefined, {
          ...input,
          options: { num_predict: 1000 },
        })
      ).status,
    ).toBe(400);
    expect(urls.length).toBe(0);
    expect((await send("controller")).status).toBe(200);
  }));
test("desktop and phone run a check only after the explicit button and clear denied or stale results", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let calls = 0,
    deny = false,
    stale = false;
  await page.route("**/api/sync/agents", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: { providers: [], events: [], workers: [], obsidian: false },
      });
    const body = route.request().postDataJSON();
    if (body.action === "local-model-catalog")
      return route.fulfill({
        json: {
          configuredModel: "fixture",
          configuredListed: true,
          reportedEntries: 1,
          uniqueModels: 1,
          omitted: 0,
          rejectedEntries: 0,
          checkedAt: new Date().toISOString(),
          models: [{ name, digest, bytes: 100, modifiedAt: null }],
          notice: "Installed",
        },
      });
    if (body.action === "local-model-details")
      return route.fulfill({
        json: {
          model: name,
          digest,
          capabilities: ["completion"],
          capabilitiesKnown: true,
          capabilitiesOmitted: 0,
          checkedAt: new Date().toISOString(),
          notice: "Reported metadata",
        },
      });
    calls++;
    expect(body).toEqual(input);
    return deny
      ? route.fulfill({ status: 403, json: { error: "Controller required" } })
      : route.fulfill({
          json: {
            runId: "fixture-run",
            model: name,
            digest: stale ? "b".repeat(64) : digest,
            reportedModel: name,
            state: "passed",
            checkedAt: new Date().toISOString(),
            elapsedMs: 1234,
            reportedOutputTokens: 5,
            notice:
              "One fixed local diagnostic completed. No private context supplied.",
          },
        });
  });
  await page.goto("/nexus");
  await page.getByText("Connection activity", { exact: true }).click();
  const catalog = page.locator(".nexus-local-model-catalog");
  await catalog.locator("summary").click();
  await catalog
    .getByRole("button", {
      name: "Inspect installed local models",
      exact: true,
    })
    .click();
  await catalog
    .getByRole("button", {
      name: `Inspect model details · ${name}`,
      exact: true,
    })
    .click();
  const panel = page.getByRole("region", {
    name: `Local inference check ${name}`,
    exact: true,
  });
  expect(calls).toBe(0);
  await panel
    .getByRole("button", {
      name: `Run local model check · ${name}`,
      exact: true,
    })
    .click();
  await expect(
    panel.getByText("Fixed local test passed", { exact: true }),
  ).toBeVisible();
  await panel.scrollIntoViewIfNeeded();
  await fs.mkdir("artifacts/local-model-check", { recursive: true });
  await panel.screenshot({
    path: `artifacts/local-model-check/${info.project.name}.png`,
  });
  expect(
    await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  stale = true;
  await panel
    .getByRole("button", {
      name: `Run local model check · ${name}`,
      exact: true,
    })
    .click();
  await expect(
    panel.getByText("The model identity changed. Inspect the catalog again."),
  ).toBeVisible();
  await expect(
    panel.getByText("Fixed local test passed", { exact: true }),
  ).toHaveCount(0);
  deny = true;
  await panel
    .getByRole("button", {
      name: `Run local model check · ${name}`,
      exact: true,
    })
    .click();
  await expect(
    panel.getByText("Controller required", { exact: true }),
  ).toBeVisible();
});
test("compiled production API performs one fixed generation against an owned loopback fixture", async ({
  context,
}) => {
  const { createServer } = await import("node:http");
  const calls: { url: string; body: string }[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk.toString();
    calls.push({ url: req.url!, body });
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        req.url === "/api/tags"
          ? { models: [listed] }
          : req.url === "/api/show"
            ? details
            : answer,
      ),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(11434, "127.0.0.1", resolve);
  });
  try {
    await fixtureRole(context);
    const response = await context.request.post("/api/sync/agents", {
      data: input,
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      model: name,
      digest,
      state: "passed",
    });
    expect(calls.map((c) => c.url)).toEqual([
      "/api/tags",
      "/api/show",
      "/api/tags",
      "/api/generate",
      "/api/tags",
    ]);
    expect(JSON.parse(calls[3].body).options).toEqual({
      num_predict: 8,
      num_ctx: 512,
      temperature: 0,
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
