import { test, expect } from "@playwright/test";
import { fixtureRole } from "./helpers/access";
test("a marked test customer completes intake, exact estimate acceptance, rework and human review", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Co-hosting", exact: true }).click();
  await page
    .getByRole("button", { name: "Load business records", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create test lead", exact: true })
    .click();
  await expect(
    page.getByText(
      "Test lead created. Prepare its property, then prepare an estimate from that property.",
      { exact: true },
    ),
  ).toBeVisible();
  const state = await (await context.request.get("/api/sync/business")).json();
  const lead = state.records
    .filter((r: any) => r.kind === "Lead" && r.isTest)
    .at(-1);
  expect(lead).toBeTruthy();
  const leadCard = page
    .locator(".nexus-records>li")
    .filter({ has: page.getByText("Lead: " + lead.name, { exact: true }) });
  await leadCard
    .getByRole("button", { name: "Prepare property from lead", exact: true })
    .click();
  const propertyName = "TEST property " + test.info().project.name;
  await page.getByLabel("Name", { exact: true }).fill(propertyName);
  await page
    .getByRole("button", { name: "Add operating record", exact: true })
    .click();
  const property = page.locator(".nexus-records>li").filter({
    has: page.getByText("Property: " + propertyName, { exact: true }),
  });
  await property
    .getByRole("button", {
      name: "Prepare estimate · " + propertyName,
      exact: true,
    })
    .click();
  const quoteName = "TEST turnover " + test.info().project.name;
  await page.getByLabel("Estimate name", { exact: true }).fill(quoteName);
  await page
    .getByLabel("Estimate scope and exclusions", { exact: true })
    .fill(
      "Synthetic turnover cleaning, agreed surfaces and restocking; excludes repairs and taxes.",
    );
  await page
    .getByRole("button", { name: "Save draft estimate", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Record acceptance · " + quoteName,
      exact: true,
    })
    .click();
  await page
    .getByLabel(
      "I reviewed this estimate's scope and price and have an acceptance reference.",
    )
    .check();
  await page
    .getByRole("button", { name: "Record customer acceptance", exact: true })
    .click();
  await page.getByLabel("New job date", { exact: true }).fill("2027-01-06");
  await page
    .getByLabel("New job assignee", { exact: true })
    .fill("Test operator");
  await page
    .getByRole("button", { name: "Create job · " + quoteName, exact: true })
    .click();
  const job = page
    .locator(".nexus-records>li")
    .filter({ has: page.getByText("Job: " + quoteName, { exact: true }) });
  await job.getByRole("button", { name: "Start job", exact: true }).click();
  const checklist = job.getByRole("group", {
    name: "Job checklist · " + quoteName,
    exact: true,
  });
  for (const box of await checklist.getByRole("checkbox").all())
    await box.check();
  await job
    .getByLabel("Completion summary", { exact: true })
    .fill(
      "Synthetic cleaning completed. Surfaces, inventory and agreed scope checked.",
    );
  await job
    .getByRole("button", { name: "Submit for completion review", exact: true })
    .click();
  await expect(job.getByText("Review required", { exact: true })).toBeVisible();
  await job
    .getByLabel("Completion reviewer", { exact: true })
    .fill("Test owner");
  await job
    .getByLabel("Review decision note", { exact: true })
    .fill("Recheck the synthetic kitchen before accepting completion.");
  await job
    .getByLabel(
      "I have reviewed this submission and am recording a human decision.",
    )
    .check();
  await job
    .getByRole("button", { name: "Request rework", exact: true })
    .click();
  await job.getByRole("button", { name: "Resume rework", exact: true }).click();
  await job
    .getByLabel("Completion summary", { exact: true })
    .fill(
      "Synthetic kitchen rechecked; agreed cleaning and final checks completed.",
    );
  await job
    .getByRole("button", { name: "Submit for completion review", exact: true })
    .click();
  await job
    .getByLabel("Completion reviewer", { exact: true })
    .fill("Test owner");
  await job
    .getByLabel("Review decision note", { exact: true })
    .fill("Reviewed the second submission and accepted this synthetic job.");
  await job
    .getByLabel(
      "I have reviewed this submission and am recording a human decision.",
    )
    .check();
  await job
    .getByRole("button", { name: "Accept reviewed completion", exact: true })
    .click();
  await expect(job.getByText("Accepted", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Co-hosting", exact: true }).click();
  await page
    .getByRole("button", { name: "Load business records", exact: true })
    .click();
  await expect(job.getByText("Accepted", { exact: true })).toBeVisible();
  const saved = await (await context.request.get("/api/sync/business")).json();
  const quote = saved.quotes.find((q: any) => q.name === quoteName);
  const record = saved.records.find((r: any) => r.id === quote.jobId);
  expect(record.isTest).toBe(true);
  expect(record.review.submissionVersion).toBe(2);
  expect(record.review.history.map((h: any) => h.decision)).toEqual([
    "Rework",
    "Accepted",
  ]);
  expect(quote.acceptance.method).toBe("Test");
  expect(record.sourceQuoteVersion).toBe(quote.version);
  const denied = await context.request.put("/api/sync/business", {
    data: {
      ...saved,
      quotes: saved.quotes.map((q: any) =>
        q.id === quote.id ? { ...q, wage: 999 } : q,
      ),
    },
  });
  expect(denied.status()).toBe(400);
  const after = await (await context.request.get("/api/sync/business")).json();
  expect(after.revision).toBe(saved.revision);
});
test("display-only devices cannot read private client records or alter workflow", async ({
  context,
}) => {
  await fixtureRole(context, "display");
  expect((await context.request.get("/api/sync/business")).status()).toBe(403);
  expect(
    (await context.request.put("/api/sync/business", { data: {} })).status(),
  ).toBe(403);
});
