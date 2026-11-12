import { fixtureRole, fixtureCookieHeader } from "./helpers/access";
import { test, expect } from "@playwright/test";
import {
  maintenancePlan,
  parseMaintenanceAction,
} from "../lib/server/maintenance";
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
