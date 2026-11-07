import { fixtureRole, fixtureCookieHeader } from "./helpers/access";
import { test, expect } from "@playwright/test";
import {
  defaultBriefSettings,
  validBriefSettings,
  composeBrief,
  zonedInstant,
} from "../lib/daily-brief";
test("timezone respects New York daylight saving and rejects unavailable local times", () => {
  expect(zonedInstant("2026-11-02", "05:00", "America/New_York")).toBe(
    "2026-11-02T10:00:00.000Z",
  );
  expect(zonedInstant("2026-07-06", "05:00", "America/New_York")).toBe(
    "2026-07-06T09:00:00.000Z",
  );
  expect(() =>
    zonedInstant("2026-03-08", "02:30", "America/New_York"),
  ).toThrow();
});
test("real priorities exclude completed tasks; calendar overlaps and admin remain proposals", () => {
  const s = defaultBriefSettings();
  s.tasks = [
    {
      id: "a",
      title: "Prepare owner proposal",
      due: "2026-11-09",
      priority: "High",
      done: false,
    },
    {
      id: "b",
      title: "Already finished",
      due: "2026-11-01",
      priority: "High",
      done: true,
    },
  ];
  const events = [
    {
      id: "a",
      title: "Routine inbox admin",
      start: "2026-11-09T13:00:00Z",
      end: "2026-11-09T14:00:00Z",
      allDay: false,
      people: ["Owner"],
      prep: "Review notes",
      calendar: "primary",
    },
    {
      id: "b",
      title: "Owner meeting",
      start: "2026-11-09T13:30:00Z",
      end: "2026-11-09T14:30:00Z",
      allDay: false,
      people: [],
      prep: "",
      calendar: "primary",
    },
  ];
  const b = composeBrief(s, events, new Date("2026-11-09T10:00:00Z"));
  expect(b.conflicts).toBe(1);
  expect(b.adminIntrusions).toBe(1);
  expect(b.text).toContain("WEEK AHEAD");
  expect(b.text).toContain("Prepare owner proposal");
  expect(b.text).not.toContain("Already finished");
  expect(b.text).toContain("no events changed");
});
test("malformed tasks are rejected and local scheduling can be enabled", () => {
  expect(
    validBriefSettings({ ...defaultBriefSettings(), enabled: true }).enabled,
  ).toBe(true);
  expect(() =>
    validBriefSettings({
      ...defaultBriefSettings(),
      tasks: [
        {
          id: "a",
          title: "Bad date",
          due: "2026-02-30",
          done: false,
          priority: "High",
        },
      ],
    }),
  ).toThrow();
});
test("private tasks persist, stale saves fail and display access is denied", async ({
  context,
  playwright,
}) => {
  const request = context.request;
  expect((await request.get("/api/sync/brief")).status()).toBe(401);
  await fixtureRole(context, "controller");
  const settings = await (await request.get("/api/sync/brief")).json();
  const next = {
    ...settings,
    tasks: [
      {
        id: "real",
        title: "Prepare real proposal",
        due: "",
        done: false,
        priority: "High",
      },
    ],
  };
  expect((await request.put("/api/sync/brief", { data: next })).status()).toBe(
    200,
  );
  expect((await request.put("/api/sync/brief", { data: next })).status()).toBe(
    409,
  );
  expect(
    (await (await request.get("/api/sync/brief")).json()).tasks[0].title,
  ).toBe("Prepare real proposal");
  const display = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3000",
    extraHTTPHeaders: { Cookie: fixtureCookieHeader("display") },
  });

  expect((await display.get("/api/sync/brief")).status()).toBe(403);
  await display.dispose();
});

test("daily brief task controls work on the Nexus page", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Daily brief", exact: true }).click();
  await page.getByLabel("New real task").fill("Synthetic mobile task");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page
    .getByRole("button", { name: "Save tasks and preferences" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved on your laptop" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview task brief" }).click();
  await expect(page.locator("pre")).toContainText("Synthetic mobile task");
  await expect(page.locator("pre")).toContainText(
    "Google Calendar is not connected",
  );
  await page.reload();
  await page.getByRole("button", { name: "Daily brief", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Synthetic mobile task" }),
  ).toBeVisible();
});
