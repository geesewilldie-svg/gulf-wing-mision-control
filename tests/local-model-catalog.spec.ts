import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { inspectLocalModels } from "../lib/server/local-model-catalog";
import { POST } from "../app/api/sync/agents/route";
import { token } from "../lib/server/sync-store";
import { fixtureRole } from "./helpers/access";
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
const item = {
  name: "fixture:latest",
  size: 1024,
  digest: "a".repeat(64),
  modified_at: "2026-11-26T10:00:00Z",
};

test("local model inspection uses only fixed metadata GET and reports bounded unique models", () =>
  fixture(async () => {
    let calls = 0;
    globalThis.fetch = (async (url, options) => {
      calls++;
      expect(String(url)).toBe("http://127.0.0.1:11434/api/tags");
      expect(options!.method).toBe("GET");
      expect(options!.redirect).toBe("error");
      expect(options!.body).toBeUndefined();
      return Response.json({
        models: [
          item,
          item,
          { name: "<script>private</script>" },
          ...Array.from({ length: 110 }, (_, i) => ({
            name: `other${i}`,
            size: -1,
            digest: "INVALID",
          })),
        ],
      });
    }) as typeof fetch;
    const result = await inspectLocalModels(new AbortController().signal);
    expect(result).toMatchObject({
      configuredModel: "fixture",
      configuredListed: true,
      reportedEntries: 113,
      uniqueModels: 111,
      omitted: 11,
      rejectedEntries: 1,
    });
    expect(result.models).toHaveLength(100);
    expect(calls).toBe(1);
    expect(
      result.models.find((model) => model.name === "fixture:latest"),
    ).toMatchObject({ bytes: 1024, digest: "a".repeat(64) });
    expect(JSON.stringify(result)).not.toContain("<script>");
    expect(result.notice).toContain("not proof");
  }));

test("unavailable, oversized, malformed and changed-configuration catalogs fail without inference fallback", () =>
  fixture(async () => {
    for (const body of [
      { models: "invalid" },
      { models: Array.from({ length: 1001 }, () => item) },
    ]) {
      globalThis.fetch = (async () => Response.json(body)) as typeof fetch;
      await expect(
        inspectLocalModels(new AbortController().signal),
      ).rejects.toMatchObject({ status: 503 });
    }
    globalThis.fetch = (async () =>
      new Response("x".repeat(500001))) as typeof fetch;
    await expect(
      inspectLocalModels(new AbortController().signal),
    ).rejects.toMatchObject({ status: 503 });
    globalThis.fetch = (async () => {
      process.env.GW_NEXUS_MODEL = "changed";
      return Response.json({ models: [item] });
    }) as typeof fetch;
    await expect(
      inspectLocalModels(new AbortController().signal),
    ).rejects.toMatchObject({ status: 409 });
  }));

test("catalog API requires controller same-origin and denies extra target parameters before any request", () =>
  fixture(async (config) => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return Response.json({ models: [] });
    }) as typeof fetch;
    const send = (
      role: string | null,
      origin = "http://localhost:3000",
      body: any = { action: "local-model-catalog" },
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
    expect((await send("controller", "https://foreign.test")).status).toBe(403);
    expect(
      (
        await send("controller", undefined, {
          action: "local-model-catalog",
          url: "https://external.test",
        })
      ).status,
    ).toBe(400);
    expect(calls).toBe(0);
    expect((await send("controller")).status).toBe(200);
    expect(calls).toBe(1);
  }));

test("desktop and phone require an explicit catalog inspection and clear old results after denial", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  let calls = 0,
    denied = false;
  await page.route("**/api/sync/agents", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: { providers: [], events: [], workers: [], obsidian: false },
      });
    calls++;
    return denied
      ? route.fulfill({
          status: 403,
          json: { error: "Controller access required" },
        })
      : route.fulfill({
          json: {
            configuredModel: "fixture",
            configuredListed: true,
            reportedEntries: 1,
            uniqueModels: 1,
            omitted: 0,
            rejectedEntries: 0,
            checkedAt: "2026-11-26T10:00:00Z",
            models: [
              {
                name: "fixture:latest",
                bytes: 1024,
                digest: "a".repeat(64),
                modifiedAt: null,
              },
            ],
            notice: "Listed is not inference readiness.",
          },
        });
  });
  await page.goto("/nexus");
  await page.getByText("Connection activity", { exact: true }).click();
  const panel = page.locator(".nexus-local-model-catalog");
  await expect(panel).toBeVisible();
  expect(calls).toBe(0);
  await panel.locator("summary").click();
  await panel
    .getByRole("button", { name: "Inspect installed local models" })
    .click();
  await expect(panel).toContainText("fixture:latest");
  expect(calls).toBe(1);
  denied = true;
  await panel
    .getByRole("button", { name: "Inspect installed local models" })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "Controller access required",
  );
  await expect(
    panel.getByRole("region", { name: "Local model catalog results" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
