import { fixtureRole, fixtureCookieHeader } from "./helpers/access";
import { test, expect } from "@playwright/test";
import { maintenanceIntent } from "../lib/maintenance-intent";
import { maintenanceAnswer } from "../lib/server/conversation-maintenance";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
test("conversation maintenance matches whole requests and reports only observed outcomes", () => {
  expect(maintenanceIntent("Nexus, please check laptop services.")).toBe(
    "check-connections",
  );
  expect(maintenanceIntent("Start missing Nexus services")).toBe(
    "start-services",
  );
  for (const query of [
    "Check laptop services and delete files",
    "Start missing Nexus services; whoami",
    "Explain how to check laptop services",
    "Remember that I said check laptop services",
    "Restart my laptop",
    "Run PowerShell",
  ])
    expect(maintenanceIntent(query)).toBeNull();
  const answer = maintenanceAnswer({
    id: "fixture-operation",
    action: "start-services",
    outcome: "needs-attention",
    message: "Operation needs attention or timed out.",
  });
  expect(answer.answer).toContain("needs-attention");
  expect(answer.answer).toContain("fixture-operation");
  expect(answer.warnings).toHaveLength(1);
  expect(answer.routing.selected).toEqual([]);
});
test("conversation maintenance keeps controller, origin, local routing and host checks", async ({
  context,
}) => {
  const data = { query: "Check laptop services", mode: "auto" };
  expect(
    (await context.request.post("/api/sync/nexus", { data })).status(),
  ).toBe(401);
  await fixtureRole(context, "display");
  expect(
    (await context.request.post("/api/sync/nexus", { data })).status(),
  ).toBe(403);
  await fixtureRole(context, "controller");
  expect(
    (
      await context.request.post("/api/sync/nexus", {
        data,
        headers: { Origin: "https://untrusted.example" },
      })
    ).status(),
  ).toBe(403);
  for (const mode of [
    "openai",
    "anthropic",
    "gemini",
    "compare",
    "knowledge",
  ]) {
    const result = await context.request.post("/api/sync/nexus", {
      data: { ...data, mode, allowExternal: true },
    });
    expect(result.status()).toBe(403);
    expect((await result.json()).error).toContain("local-only");
  }
  const unsupported = await context.request.post("/api/sync/nexus", { data });
  expect(unsupported.status()).toBe(409);
  expect((await unsupported.json()).error).toContain("Windows laptop");
});
import {
  maintenancePlan,
  parseMaintenanceAction,
  runMaintenance,
} from "../lib/server/maintenance";
test("local permission revoked during audit prevents maintenance process dispatch", async () => {
  const dir = await fs.mkdtemp(
    path.join(tmpdir(), "nexus-maintenance-revoke-"),
  );
  const priorDir = process.env.GW_SYNC_DATA_DIR;
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  const append = fs.appendFile;
  process.env.GW_SYNC_DATA_DIR = dir;
  Object.defineProperty(process, "platform", {
    value: "win32",
    configurable: true,
  });
  try {
    await fs.writeFile(
      path.join(dir, "maintenance.json"),
      JSON.stringify({ version: 1, enabled: true }),
    );
    fs.appendFile = (async (...args: Parameters<typeof fs.appendFile>) => {
      await append(...args);
      if (String(args[1]).includes('"state":"started"'))
        await fs.writeFile(
          path.join(dir, "maintenance.json"),
          JSON.stringify({ version: 1, enabled: false }),
        );
    }) as typeof fs.appendFile;
    await expect(runMaintenance("start-services")).rejects.toThrow(
      "disabled before dispatch",
    );
    const audit = await fs.readFile(
      path.join(dir, "maintenance-audit.jsonl"),
      "utf8",
    );
    expect(audit).toContain("permission-revoked");
    expect(audit).not.toContain('"state":"complete"');
  } finally {
    fs.appendFile = append;
    Object.defineProperty(process, "platform", platform);
    if (priorDir === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = priorDir;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("maintenance accepts only exact operation names without shell arguments", () => {
  expect(parseMaintenanceAction({ action: "start-services" })).toBe(
    "start-services",
  );
  expect(maintenancePlan("start-services")).toEqual({
    script: "scripts/start-nexus.mjs",
    args: ["--no-browser"],
    timeout: 180000,
  });
  for (const value of [
    null,
    [],
    { action: "powershell" },
    { action: "start-services; whoami" },
    { action: "start-services", args: ["anything"] },
    { action: "check-connections", command: "whoami" },
  ])
    expect(() => parseMaintenanceAction(value)).toThrow();
  expect(() => maintenancePlan("arbitrary" as any)).toThrow();
});
test("unauthenticated, display and cross-origin callers cannot execute maintenance", async ({
  context,
}) => {
  const request = context.request;
  expect((await request.get("/api/sync/maintenance")).status()).toBe(401);
  expect(
    (
      await request.post("/api/sync/maintenance", {
        data: { action: "start-services" },
      })
    ).status(),
  ).toBe(401);
  await fixtureRole(context, "display");
  expect(
    (
      await request.post("/api/sync/maintenance", {
        data: { action: "start-services" },
      })
    ).status(),
  ).toBe(403);
  await fixtureRole(context, "controller");
  expect(
    (
      await request.post("/api/sync/maintenance", {
        headers: { Origin: "https://untrusted.example" },
        data: { action: "start-services" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/sync/maintenance", {
        data: { action: "check-connections", command: "whoami" },
      })
    ).status(),
  ).toBe(400);
  const r = await request.get("/api/sync/maintenance");
  expect(await r.json()).toEqual({ enabled: false, supported: false });
  expect(
    (
      await request.post("/api/sync/maintenance", {
        data: { action: "start-services" },
      })
    ).status(),
  ).toBe(409);
});
test("maintenance UI is disabled until enabled locally on a supported host", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page
    .getByRole("button", { name: "Device access", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Laptop maintenance" });
  await expect(
    panel.getByRole("button", { name: "Start missing Nexus services" }),
  ).toBeDisabled();
  await expect(panel).toContainText("Enable-Nexus-Maintenance.cmd");
});

test("enabled panel submits only the selected operation and displays its result", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  const actions: unknown[] = [];
  await page.route("**/api/sync/maintenance", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { enabled: true, supported: true } });
    actions.push(route.request().postDataJSON());
    return route.fulfill({
      json: { message: "Synthetic operation completed." },
    });
  });
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page
    .getByRole("button", { name: "Device access", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Laptop maintenance" });
  await panel.getByRole("button", { name: "Check laptop services" }).click();
  await expect(panel.getByRole("status")).toHaveText(
    "Synthetic operation completed.",
  );
  expect(actions).toEqual([{ action: "check-connections" }]);
});
