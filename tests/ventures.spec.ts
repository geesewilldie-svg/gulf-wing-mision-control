import { test, expect, type Cookie } from "@playwright/test";
import {
  validOperations,
  ventureProfiles,
  type OperatingRecord,
} from "../lib/venture-operations";
test.describe.configure({ mode: "serial" });
let cookies: Cookie[] = [];
test.beforeAll(async ({ request }) => {
  const r = await request.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "controller" },
  });
  expect(r.status()).toBe(200);
  cookies = (await request.storageState()).cookies;
});
test.beforeEach(async ({ context }) => {
  await context.addCookies(cookies);
});
const record = (id: string): OperatingRecord => ({
  id,
  venture: "Aviation",
  title: "Synthetic cabin service",
  category: "Cabin readiness",
  owner: "Test operator",
  due: "2026-11-05",
  status: "Planned",
  notes: "Synthetic test evidence only",
  checks: ventureProfiles.Aviation.checks.map((label) => ({
    label,
    done: false,
  })),
});
test("validation rejects malformed dates, duplicate identities and unknown categories", () => {
  const r = record("test");
  expect(validOperations({ revision: 0, records: [r] }).records[0].title).toBe(
    r.title,
  );
  for (const bad of [
    { ...r, due: "2026-02-30" },
    { ...r, category: "Flight dispatch" },
    { ...r, venture: "Unknown" },
    { ...r, checks: [{ label: "bad", done: "yes" }] },
  ])
    expect(() => validOperations({ revision: 0, records: [bad] })).toThrow();
  expect(() => validOperations({ revision: 0, records: [r, r] })).toThrow();
});
test("private records require controller access and preserve changes during stale or simultaneous writes", async ({
  context,
  playwright,
}) => {
  const request = context.request;
  const fresh = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3000",
  });
  expect((await fresh.get("/api/sync/ventures")).status()).toBe(401);
  await fresh.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "display" },
  });
  expect((await fresh.get("/api/sync/ventures")).status()).toBe(403);
  expect(
    (
      await fresh.put("/api/sync/ventures", {
        data: { revision: 0, records: [] },
      })
    ).status(),
  ).toBe(403);
  await fresh.dispose();
  const current = await (await request.get("/api/sync/ventures")).json();
  const next = {
    ...current,
    records: [...current.records, record("concurrency-" + Date.now())],
  };
  const results = await Promise.all([
    request.put("/api/sync/ventures", { data: next }),
    request.put("/api/sync/ventures", { data: next }),
  ]);
  expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
  expect(
    (
      await request.put("/api/sync/ventures", {
        headers: { Origin: "https://elsewhere.invalid" },
        data: next,
      })
    ).status(),
  ).toBe(403);
  const saved = await (await request.get("/api/sync/ventures")).json();
  expect(
    (
      await request.put("/api/sync/ventures", {
        data: {
          ...saved,
          records: [{ ...record("invalid"), due: "2026-02-30" }],
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (await (await request.get("/api/sync/ventures")).json()).records,
  ).toEqual(saved.records);
});
test("aviation record, checklist, edit, reload, portfolio isolation, search and Nexus retrieval", async ({
  page,
  isMobile,
  context,
}, info) => {
  const request = context.request;
  const name = "Synthetic aircraft handover " + info.project.name;
  await page.goto("/");
  if (isMobile)
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Aviation", exact: true }).click();
  const desk = page.getByRole("region", {
    name: "Aviation operating workspace",
  });
  await expect(
    desk.getByRole("img", { name: /Original holographic aircraft/ }),
  ).toHaveAttribute("aria-label", /Original holographic aircraft/);
  await desk.getByRole("button", { name: "Load venture records" }).click();
  await desk.getByRole("button", { name: "New operating record" }).click();
  await desk.getByLabel("Record title", { exact: true }).fill(name);
  await desk.getByLabel("Responsible owner").fill("Synthetic operator");
  await desk.getByLabel("Due date", { exact: true }).fill("2026-11-05");
  await desk
    .getByLabel("Written operator / FBO and work-area authorization reviewed")
    .check();
  await desk
    .getByLabel("Scope, location, evidence references and handover notes")
    .fill("Synthetic aircraft handover documented for test only.");
  await desk
    .getByRole("button", { name: "Save operating record", exact: true })
    .click();
  await expect(desk.getByRole("heading", { name, exact: true })).toBeVisible();
  await desk
    .getByRole("button", { name: "Edit operating record " + name, exact: true })
    .click();
  await desk
    .getByRole("combobox", { name: "Operating status", exact: true })
    .selectOption("Blocked");
  await desk
    .getByRole("button", { name: "Save operating record", exact: true })
    .click();
  if (process.env.GW_DESIGN_CAPTURE) {
    await desk.scrollIntoViewIfNeeded();
    await desk.screenshot({
      path: info.outputPath("venture-aviation.png"),
    });
  }
  await page.reload();
  await page.getByRole("button", { name: "Load venture records" }).click();
  await expect(desk.getByRole("heading", { name, exact: true })).toBeVisible();
  await desk.getByLabel("Search operating records").fill("does-not-exist");
  await expect(desk.getByRole("heading", { name, exact: true })).toHaveCount(0);
  await desk.getByLabel("Search operating records").fill("");
  if (isMobile)
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "Security Operations", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Prepared. Accountable. Mission focused.",
    }),
  ).toBeVisible();
  if (isMobile)
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "Future Ventures", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Explore deliberately. Expand with evidence.",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  const answer = await request.post("/api/sync/nexus", {
    data: { query: name, mode: "knowledge" },
  });
  expect(answer.ok()).toBeTruthy();
  expect(
    (await answer.json()).sources.some(
      (s: { source: string }) => s.source === "Saved Aviation operations",
    ),
  ).toBeTruthy();
});
test("private backup restore requires confirmation and Co-hosting link opens operating section", async ({
  page,
  context,
  isMobile,
}) => {
  await page.goto("/");
  if (isMobile)
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "Holding Company", exact: true })
    .click();
  await page.getByRole("button", { name: "Load venture records" }).click();
  const backup = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export private backup" }).click();
  expect((await backup).suggestedFilename()).toBe(
    "gulf-wing-ventures-private.json",
  );
  await page
    .getByText("Restore private venture backup", { exact: true })
    .click();
  await page.getByLabel("Venture backup JSON").setInputFiles({
    name: "synthetic.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        revision: 999,
        records: [
          {
            ...record("restore-test"),
            venture: "Future Ventures",
            category: "Opportunity",
          },
        ],
      }),
    ),
  });
  await expect(
    page.getByRole("button", { name: "Confirm replace venture records" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel restore", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm replace venture records" }),
  ).toHaveCount(0);
  const before = await (await context.request.get("/api/sync/ventures")).json();
  const restoredRecord = {
    ...record("restored-op-" + Date.now()),
    venture: "Future Ventures",
    category: "Opportunity",
  };
  await page.getByLabel("Venture backup JSON").setInputFiles({
    name: "synthetic-confirm.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        ...before,
        records: [...before.records, restoredRecord],
      }),
    ),
  });
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Confirm replace venture records" })
    .click();
  await expect(
    page.getByText(
      "Saved to your laptop. Other controllers can load these records.",
      { exact: true },
    ),
  ).toBeVisible();
  const after = await (await context.request.get("/api/sync/ventures")).json();
  expect(after.revision).toBe(before.revision + 1);
  expect(
    after.records.some((r: { id: string }) => r.id === restoredRecord.id),
  ).toBeTruthy();
  await page
    .getByRole("link", { name: /Co-hosting.*Customer operations/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Co-hosting", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("unsaved security record survives venture navigation without leaking into another desk", async ({
  page,
  isMobile,
}, info) => {
  await page.goto("/");
  async function navigate(name: string) {
    if (isMobile)
      await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("button", { name, exact: true }).click();
  }
  await navigate("Security Operations");
  await page.getByRole("button", { name: "Load venture records" }).click();
  await page.getByRole("button", { name: "New operating record" }).click();
  await page
    .getByLabel("Record title", { exact: true })
    .fill("Synthetic unsaved mission");
  await navigate("Aviation");
  await expect(
    page.getByRole("form", { name: "Operating record editor" }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/An unsaved record is held in Security Operations/),
  ).toBeVisible();
  await navigate("Security Operations");
  await expect(page.getByLabel("Record title", { exact: true })).toHaveValue(
    "Synthetic unsaved mission",
  );
  await page.getByRole("button", { name: "Cancel edits", exact: true }).click();
  if (process.env.GW_DESIGN_CAPTURE) {
    for (const [name, file] of [
      ["Security Operations", "security"],
      ["Holding Company", "holding"],
      ["Future Ventures", "future"],
    ]) {
      await navigate(name);
      const desk = page.locator(".venture-workspace");
      await desk.scrollIntoViewIfNeeded();
      await desk.screenshot({
        path: info.outputPath("venture-" + file + ".png"),
      });
    }
  }
});
