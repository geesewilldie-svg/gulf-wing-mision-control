import { fixtureRole, fixtureCookieHeader } from "./helpers/access";
import { test, expect } from "@playwright/test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultBriefSettings } from "../lib/daily-brief";
import { buildMorning, morningDue } from "../lib/server/morning-brief";
test("weekday scheduler catches up once and preserves a dated snapshot from real tasks", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nexus-morning-"));
  const old = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    const settings = {
      ...defaultBriefSettings(),
      enabled: true,
      tasks: [
        {
          id: "a",
          title: "Prepare owner scope",
          due: "2026-11-09",
          priority: "High" as const,
          done: false,
        },
      ],
    };
    await writeFile(
      path.join(dir, "daily-brief.json"),
      JSON.stringify(settings),
    );
    expect(morningDue(settings, new Date("2026-11-09T09:59:00Z"))).toBe(false);
    expect(morningDue(settings, new Date("2026-11-08T12:00:00Z"))).toBe(false);
    const [a, b] = await Promise.all([
      buildMorning(new Date("2026-11-09T12:00:00Z")),
      buildMorning(new Date("2026-11-09T12:01:00Z")),
    ]);
    expect(a?.text).toContain("Prepare owner scope");
    expect(a?.text).toContain("Calendar unavailable");
    expect(a?.text).not.toContain("No timed overlaps");
    expect(a?.late).toBe(true);
    expect(a).toEqual(b);
    expect(await buildMorning(new Date("2026-11-10T10:00:00Z"))).toMatchObject({
      date: "2026-11-10",
      late: false,
    });
  } finally {
    if (old === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = old;
    await rm(dir, { recursive: true, force: true });
  }
});
test("morning API requires controller and same-origin writes", async ({
  context,
}) => {
  const request = context.request;
  expect((await request.post("/api/sync/brief/morning")).status()).toBe(401);
  await fixtureRole(context, "display");
  expect((await request.get("/api/sync/brief/morning")).status()).toBe(403);
  await fixtureRole(context, "controller");
  expect(
    (
      await request.post("/api/sync/brief/morning", {
        headers: { Origin: "https://untrusted.example" },
      })
    ).status(),
  ).toBe(403);
});

test("opening Nexus shows a saved brief and dismissal survives reload on this device", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  await page.route("**/api/sync/brief/morning", (route) =>
    route.fulfill({
      json: {
        brief: {
          version: 1,
          date: "2026-11-09",
          timezone: "America/New_York",
          generatedAt: "2026-11-09T10:00:00Z",
          late: false,
          text: "Synthetic morning briefing",
          sources: ["Synthetic test fixture"],
        },
      },
    }),
  );
  await page.goto("/nexus");
  await expect(
    page.getByRole("heading", { name: "Your morning brief · 2026-11-09" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Dismiss for today on this device" })
    .click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your morning brief · 2026-11-09" }),
  ).not.toBeVisible();
});
