import { test, expect, type Cookie } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { emptyBusiness, validBusiness } from "../lib/business";
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

test("legacy records migrate without losing status and invalid links/dates are rejected", () => {
  const legacy = {
    revision: 0,
    records: [
      {
        id: "old",
        kind: "Lead",
        name: "Old owner",
        notes: "Retain me",
        status: "Active",
      },
    ],
    quotes: [],
    marketing: { total: 0, meta: 0, google: 0, linkedin: 0 },
  };
  const parsed = validBusiness(legacy);
  expect(parsed.records[0].status).toBe("Active");
  expect(parsed.services.length).toBeGreaterThan(0);
  expect(() =>
    validBusiness({
      ...parsed,
      records: [{ ...parsed.records[0], dueDate: "2026-02-31" }],
    }),
  ).toThrow();
  expect(() =>
    validBusiness({
      ...parsed,
      records: [{ ...parsed.records[0], parentId: "missing" }],
    }),
  ).toThrow();
  expect(() =>
    validBusiness({
      ...parsed,
      quotes: [
        {
          id: "q",
          name: "Bad",
          hours: 1,
          wage: 10,
          burden: 1,
          materials: 1,
          margin: 100,
        },
      ],
    }),
  ).toThrow();
  expect(emptyBusiness().records).toEqual([]);
});

test("intake, edit, estimate acceptance, one job, checklist and printable customer copy work", async ({
  page,
}, info) => {
  const label = "Synthetic owner " + info.project.name;
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Co-hosting", exact: true }).click();
  await page.getByRole("button", { name: "Load business records" }).click();
  await page.getByLabel("Name", { exact: true }).fill(label);
  await page
    .getByLabel("Contact name", { exact: true })
    .fill("Synthetic Client");
  await page
    .getByLabel("Contact email", { exact: true })
    .fill("client@example.test");
  await page
    .getByLabel("Property / service address", { exact: true })
    .fill("Synthetic service address");
  await page.getByLabel("Service", { exact: true }).selectOption("turnover");
  await page.getByRole("button", { name: "Add operating record" }).click();
  await expect(
    page.locator(".nexus-records").getByText("Lead: " + label, { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit " + label, exact: true })
    .click();
  await page.getByLabel("Contact phone", { exact: true }).fill("555-0100");
  await page
    .getByRole("button", { name: "Save operating record", exact: true })
    .click();
  await expect(
    page
      .locator(".nexus-records > li")
      .filter({ has: page.getByText("Lead: " + label, { exact: true }) })
      .getByText(/Synthetic Client · client@example.test · 555-0100/),
  ).toBeVisible();
  await page
    .getByLabel("Estimate name", { exact: true })
    .fill("Synthetic turnover " + info.project.name);
  await page
    .getByLabel("Estimate customer / property", { exact: true })
    .selectOption({ label: "Lead: " + label });
  await page
    .getByLabel("Estimate scope and exclusions")
    .fill("Synthetic cleaning scope; tax not included.");
  await page.getByRole("button", { name: "Save draft estimate" }).click();
  const quoteName = "Synthetic turnover " + info.project.name;
  await page
    .getByLabel("Estimate status · " + quoteName, { exact: true })
    .selectOption("Accepted");
  await page.getByLabel("New job date", { exact: true }).fill("2027-01-05");
  await page.getByLabel("New job assignee", { exact: true }).fill("Scheduling");
  await page
    .getByRole("button", { name: "Create job · " + quoteName, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Job already created · " + quoteName }),
  ).toBeDisabled();
  const job = page
    .locator(".nexus-records > li")
    .filter({ has: page.getByText("Job: " + quoteName, { exact: true }) });
  await expect(job).toContainText("2027-01-05");
  await job.getByRole("checkbox").first().check();
  await expect(job.getByRole("checkbox").first()).toBeChecked();
  const state = await (await page.request.get("/api/sync/business")).json();
  const quote = state.quotes.find(
    (q: { name: string }) => q.name === quoteName,
  );
  expect(
    state.records.filter((r: { id: string }) => r.id === quote.jobId),
  ).toHaveLength(1);
  await page.goto("/estimate/" + quote.id);
  await expect(page.getByText("$103.15", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Synthetic cleaning scope; tax not included.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Hourly wage")).toHaveCount(0);
  await page.emulateMedia({ media: "print" });
  expect(
    await page
      .locator(".estimate-print")
      .evaluate((element) => getComputedStyle(element).color),
  ).toBe("rgb(17, 17, 17)");
  await expect(
    page.getByRole("button", { name: "Print / Save as PDF" }),
  ).toBeHidden();
});

test("separate device refreshes shared records and stale writes cannot erase changes", async ({
  page,
  browser,
}, info) => {
  const other = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  await other.addCookies(cookies);
  const wife = await other.newPage();
  await wife.goto("/nexus");
  await wife.getByRole("button", { name: "Co-hosting", exact: true }).click();
  await wife.getByRole("button", { name: "Load business records" }).click();
  await wife
    .getByRole("button", {
      name: "Edit Synthetic owner " + info.project.name,
      exact: true,
    })
    .click();
  await wife
    .getByRole("button", { name: "Cancel record edit", exact: true })
    .click();
  const old = await (await page.request.get("/api/sync/business")).json();
  const name = "Shared synthetic property " + info.project.name;
  const next = {
    ...old,
    records: [
      ...old.records,
      {
        id: "shared-" + info.project.name,
        kind: "Property",
        name,
        notes: "Shared fixture",
        status: "Planned",
      },
    ],
  };
  expect(
    (await page.request.put("/api/sync/business", { data: next })).status(),
  ).toBe(200);
  await expect(
    wife
      .locator(".nexus-records")
      .getByText("Property: " + name, { exact: true }),
  ).toBeVisible({ timeout: 12000 });
  expect(
    (await page.request.put("/api/sync/business", { data: old })).status(),
  ).toBe(409);
  await wife
    .getByLabel("Name", { exact: true })
    .fill("Unsaved intake retained");
  const current = await (await page.request.get("/api/sync/business")).json();
  expect(
    (
      await page.request.put("/api/sync/business", {
        data: {
          ...current,
          records: current.records.map((r: { id: string; notes: string }) =>
            r.id === "shared-" + info.project.name
              ? { ...r, notes: "Changed by other operator" }
              : r,
          ),
        },
      })
    ).status(),
  ).toBe(200);
  await expect(
    wife.getByRole("alert").filter({ hasText: "Another device changed" }),
  ).toBeVisible({ timeout: 12000 });
  await expect(wife.getByLabel("Name", { exact: true })).toHaveValue(
    "Unsaved intake retained",
  );
  await expect(
    wife.getByRole("button", { name: "Add operating record" }),
  ).toBeDisabled();
  await other.close();
});

test("private file import extracts PDF and workbook, preserves sources and exports", async ({
  page,
}, info) => {
  const pdfName = "synthetic-" + info.project.name + ".pdf";
  const imported = await page.request.post("/api/sync/knowledge", {
    multipart: {
      files: {
        name: pdfName,
        mimeType: "application/pdf",
        buffer: await readFile("tests/fixtures/synthetic-services.pdf"),
      },
    },
  });
  expect(imported.status(), await imported.text()).toBe(200);
  const workbook = await page.request.post("/api/sync/knowledge", {
    multipart: {
      files: {
        name: "synthetic-" + info.project.name + ".xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: await readFile("tests/fixtures/synthetic-forecast.xlsx"),
      },
    },
  });
  expect(workbook.status(), await workbook.text()).toBe(200);
  expect((await workbook.json()).warnings.join(" ")).toContain(
    "not recalculated",
  );
  const index = await (await page.request.get("/api/sync/knowledge")).json();
  expect(
    index.some(
      (d: { source: string; text: string }) =>
        d.source === pdfName && d.text.includes("linen coordination"),
    ),
  ).toBe(true);
  expect(index.some((d: { text: string }) => d.text.includes("C2=4"))).toBe(
    true,
  );
  const invalid = await page.request.post("/api/sync/knowledge", {
    multipart: {
      files: {
        name: "fake.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("not pdf"),
      },
    },
  });
  expect(invalid.status()).toBe(400);
  const after = await (await page.request.get("/api/sync/knowledge")).json();
  expect(after).toEqual(index);
  const answer = await (
    await page.request.post("/api/sync/nexus", {
      data: { query: "Synthetic Scheduling turnover", mode: "knowledge" },
    })
  ).json();
  expect(
    answer.sources.some(
      (s: { source: string }) => s.source === "Saved Co-hosting operations",
    ),
  ).toBe(true);
});

test("backup roundtrip is validated and Chromebook-sized layout fits", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Co-hosting", exact: true }).click();
  await page.getByRole("button", { name: "Load business records" }).click();
  await page
    .getByText("Private business backup and restore", { exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export private business backup" })
    .click();
  const file = await download;
  const stream = await file.createReadStream();
  const buffers: Buffer[] = [];
  for await (const chunk of stream!) buffers.push(chunk);
  const backup = Buffer.concat(buffers);
  expect(JSON.parse(backup.toString()).format).toBe("gulf-wing-business-v1");
  await page
    .getByLabel("Restore business backup", { exact: true })
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: backup,
    });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Confirm business restore" }).click();
  await expect(
    page.getByText("Business backup restored.", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("cohosting-desktop.png") });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.screenshot({ path: info.outputPath("cohosting-mobile.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("browser imports a private note and shows team access instructions", async ({
  page,
}, info) => {
  await page.goto("/nexus");
  await page
    .getByText("Import business plans or Obsidian knowledge", { exact: true })
    .click();
  await page.getByLabel("Knowledge files", { exact: true }).setInputFiles({
    name: "synthetic-browser-" + info.project.name + ".txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "QuartzOrchard synthetic source supports private note import.",
    ),
  });
  await page
    .getByRole("button", { name: "Import selected files", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /Imported 1 sections/ }),
  ).toBeVisible();
  await page.getByText("Family / team device access", { exact: true }).click();
  await page
    .getByRole("button", { name: "Show laptop network addresses" })
    .click();
  await expect(
    page.getByRole("region", { name: "Shared business access" }),
  ).toContainText("same trusted Wi-Fi");
});

test("service catalog edits and deactivation retain history and disable new selection", async ({
  page,
}, info) => {
  const name = "Synthetic custom service " + info.project.name;
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Co-hosting", exact: true }).click();
  await page.getByRole("button", { name: "Load business records" }).click();
  await page.getByText(/Service catalog ·/).click();
  await page.getByLabel("Service name", { exact: true }).fill(name);
  await page
    .getByRole("textbox", { name: "Service scope", exact: true })
    .fill("Synthetic custom scope.");
  await page.getByRole("button", { name: "Add service", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Deactivate · " + name, exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Deactivate · " + name, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Activate · " + name, exact: true }),
  ).toBeEnabled();
  await expect(
    page
      .getByRole("combobox", { name: "Service", exact: true })
      .getByRole("option", { name: name + " · inactive", exact: true }),
  ).toHaveJSProperty("disabled", true);
  await page
    .getByRole("button", { name: "Edit service · " + name, exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Service scope", exact: true })
    .fill("Updated synthetic scope.");
  await page
    .getByRole("button", { name: "Save service changes", exact: true })
    .click();
  await expect(
    page
      .locator(".business-services .nexus-records > li")
      .filter({ has: page.getByText(name + " · Inactive", { exact: true }) })
      .getByText("Updated synthetic scope.", { exact: true }),
  ).toBeVisible();
});
