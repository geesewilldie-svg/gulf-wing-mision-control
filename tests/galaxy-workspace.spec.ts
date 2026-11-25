import { test, expect } from "@playwright/test";
import { fixtureRole } from "./helpers/access";
import { galaxyCatalog, galaxyType } from "../lib/galaxy-catalog";

test("Galaxy categories derive from real current objects and filters do not invent matches", () => {
  const files = [
    { id: "1", name: "Report.PDF", folder: "Business", rootId: "b" },
    { id: "2", name: "Welcome.md", folder: "Notes", rootId: "n" },
    {
      id: "3",
      name: "Pictures.md",
      folder: "Host",
      rootId: "h",
      resourceKind: "folder" as const,
    },
  ];
  expect(galaxyType(files[2])).toBe("folder");
  expect(
    galaxyCatalog(files, "report business", "pdf", "b").files.map((f) => f.id),
  ).toEqual(["1"]);
  expect(galaxyCatalog(files, "report", "text", "all").files).toEqual([]);
  expect(
    [...galaxyCatalog(files, "", "all", "all").counts.values()].reduce(
      (a, b) => a + b,
      0,
    ),
  ).toBe(3);
});

test("workspace search focuses without reading; type/source filters, inspector, fit and fullscreen retain truthful coverage", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  const reads: any[] = [];
  await page.route("**/api/sync/files", (route) => {
    const body = route.request().postDataJSON();
    if (body.action !== "map") {
      reads.push(body);
      return route.fulfill({
        json: {
          answer: "Verified fixture",
          fileRead: { id: body.id, hash: body.hash, part: 1, totalParts: 1 },
        },
      });
    }
    return route.fulfill({
      json: {
        map: {
          total: 4,
          omitted: 1,
          withheld: 0,
          folders: [
            {
              id: "docs",
              label: "Business",
              kind: "folder",
              files: [
                {
                  id: "a".repeat(24),
                  hash: "1".repeat(64),
                  name: "Budget.pdf",
                  sections: 1,
                },
                {
                  id: "b".repeat(24),
                  hash: "2".repeat(64),
                  name: "Ledger.xlsx",
                  sections: 1,
                },
              ],
            },
            {
              id: "notes",
              label: "Knowledge",
              kind: "obsidian",
              files: [
                {
                  id: "c".repeat(24),
                  hash: "3".repeat(64),
                  name: "Welcome.md",
                  sections: 1,
                },
              ],
            },
          ],
        },
        warnings: [],
      },
    });
  });
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  const rail = page.locator(".memory-galaxy-inspector");
  if (!(await rail.evaluate((node: HTMLDetailsElement) => node.open)))
    await rail.locator("summary").first().click();
  await page
    .getByRole("searchbox", { name: "Search Galaxy names", exact: true })
    .fill("budget");
  await rail.getByText("Matching objects (1)", { exact: true }).click();
  await rail
    .getByRole("button", { name: "Focus Budget.pdf", exact: true })
    .click();
  const inspector = page.getByRole("region", {
    name: "Selected file star",
    exact: true,
  });
  await expect(inspector).toContainText("PDFs · Business");
  expect(reads).toEqual([]);
  await page
    .getByRole("button", { name: "Expand memory galaxy", exact: true })
    .click();
  await expect(inspector).toContainText("Budget.pdf");
  await page
    .getByRole("combobox", { name: "Galaxy file type", exact: true })
    .selectOption("spreadsheet");
  await expect(
    page.getByText(
      "No matching objects in this view. Clear filters or use another directory page.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Fit all stars", exact: true })
    .click();
  await expect(
    page.getByRole("searchbox", { name: "Search Galaxy names", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "Galaxy file type", exact: true }),
  ).toHaveValue("all");
  await expect(
    page.getByRole("button", { name: /^Focus file star:/ }),
  ).toHaveCount(3);
  await page
    .locator(".memory-spiral-shell")
    .screenshot({
      path: `artifacts/galaxy-workspace/${test.info().project.name}-scene.png`,
    });
  await page
    .getByRole("combobox", { name: "Galaxy source", exact: true })
    .selectOption("notes");
  await expect(
    page.getByRole("button", { name: /^Focus file star:/ }),
  ).toHaveCount(1);
  expect(reads).toEqual([]);
  await page
    .getByRole("button", {
      name: "Focus file star: Knowledge / Welcome.md",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Open file", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Indexed file viewer" }),
  ).toContainText("Verified fixture");
  expect(reads).toHaveLength(1);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/galaxy-workspace/${test.info().project.name}.png`,
    fullPage: true,
  });
});
