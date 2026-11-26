import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { reaTarget, reaRuntimeCompatible } from "../lib/rea-readiness";
import { inspectReaReadiness } from "../lib/server/rea-readiness";
import { POST } from "../app/api/sync/agents/route";
import { token } from "../lib/server/sync-store";
import { fixtureRole } from "./helpers/access";
async function fixture(run: (dir: string, config: any) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rea-preflight-")),
    prior = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
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
    await run(dir, config);
  } finally {
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("REA compatibility follows the pinned stable engine ranges rather than a broad Node-major check", () => {
  for (const version of [
    "v22.23.4",
    "22.24.0",
    "24.22.1",
    "24.25.0",
    "26.12.1",
    "26.13.0",
    "27.0.0",
  ])
    expect(reaRuntimeCompatible(version), version).toBe(true);
  for (const version of [
    "22.23.3",
    "23.99.0",
    "24.19.0",
    "24.22.0",
    "25.99.0",
    "26.12.0",
    "26.12.1-rc.1",
    "026.12.1",
    "unavailable",
  ])
    expect(reaRuntimeCompatible(version), version).toBe(false);
});

test("REA preflight distinguishes absent, matching and different metadata without network or execution", () =>
  fixture(async (dir) => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw Error("No network expected");
    }) as typeof fetch;
    try {
      expect(await inspectReaReadiness()).toMatchObject({
        nodeVersion: process.version,
        packageState: "missing",
        adapterReady: false,
      });
      const folder = path.join(
        dir,
        "tools",
        "rea",
        "node_modules",
        "rea-agents",
      );
      await fs.mkdir(folder, { recursive: true });
      const filename = path.join(folder, "package.json");
      await fs.writeFile(
        filename,
        JSON.stringify({
          name: reaTarget.package,
          version: reaTarget.version,
          engines: { node: reaTarget.engines },
        }),
      );
      const before = await fs.readFile(filename);
      expect(await inspectReaReadiness()).toMatchObject({
        packageState: "pinned-metadata",
        adapterReady: false,
      });
      expect(await fs.readFile(filename)).toEqual(before);
      await fs.writeFile(
        filename,
        JSON.stringify({ name: "wrong-package", version: reaTarget.version }),
      );
      expect((await inspectReaReadiness()).packageState).toBe(
        "different-metadata",
      );
      await fs.writeFile(filename, "x".repeat(64001));
      expect((await inspectReaReadiness()).packageState).toBe("unavailable");
      await fs.unlink(filename);
      await fs.symlink(path.join(dir, "sync-config.json"), filename);
      expect((await inspectReaReadiness()).packageState).toBe("unavailable");
      expect(JSON.stringify(await inspectReaReadiness())).not.toContain(dir);
    } finally {
      globalThis.fetch = original;
    }
  }));

test("REA preflight is controller-only, same-origin and accepts no custom package path", () =>
  fixture(async (_dir, config) => {
    const send = (
      role: string | null,
      origin = "http://localhost:3000",
      extra: any = {},
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
          body: JSON.stringify({ action: "rea-preflight", ...extra }),
        }),
      );
    expect((await send(null)).status).toBe(401);
    expect((await send("display")).status).toBe(403);
    expect((await send("controller", "https://foreign.test")).status).toBe(403);
    expect(
      (await send("controller", undefined, { path: "/outside" })).status,
    ).toBe(400);
    const result = await send("controller");
    expect(result.status).toBe(200);
    expect((await result.json()).adapterReady).toBe(false);
  }));

test("desktop and phone inspect REA prerequisites only on request and remove results after denied access", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  let calls = 0,
    denied = false;
  await page.route("**/api/sync/agents", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { providers: [], events: [] } });
    expect(route.request().postDataJSON()).toEqual({ action: "rea-preflight" });
    calls++;
    return denied
      ? route.fulfill({
          status: 403,
          json: { error: "Controller access required" },
        })
      : route.fulfill({
          json: {
            checkedAt: new Date().toISOString(),
            nodeVersion: "v26.12.1",
            runtimeCompatible: true,
            packageState: "missing",
            expected: reaTarget,
            adapterReady: false,
            notice: "No installation or browser attachment was started.",
          },
        });
  });
  await page.goto("/nexus");
  await page.getByText("Connection activity", { exact: true }).click();
  await page.getByText("REA inspection prerequisites", { exact: true }).click();
  expect(calls).toBe(0);
  await page
    .getByRole("button", { name: "Check REA prerequisites", exact: true })
    .click();
  const results = page.getByRole("region", {
    name: "REA prerequisite results",
  });
  await expect(results).toContainText("Meets pinned runtime range");
  await expect(results).toContainText("Not installed");
  await expect(results).toContainText("Adapter ready: no");
  denied = true;
  await page
    .getByRole("button", { name: "Check REA prerequisites", exact: true })
    .click();
  await expect(results).toHaveCount(0);
  await expect(
    page.getByText("Controller access required", { exact: true }),
  ).toBeVisible();
});
