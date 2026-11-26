import { test, expect } from "@playwright/test";
import { sourceMap } from "../lib/source-map";
import { fixtureRole } from "./helpers/access";
const status = {
  roots: [{ id: "root", label: "Knowledge", kind: "obsidian" as const }],
  scannedAt: null,
  files: 165,
  stale: 2,
  scans: [],
};
const files = Array.from({ length: 165 }, (_, i) => ({
  id: i.toString(16).padStart(24, "0"),
  rootId: "root",
  name: i === 164 ? "Distant Checklist.md" : `Note${i}.md`,
  hash: "a".repeat(64),
  size: 1,
  modifiedAt: "",
  documents: [
    {
      id: `doc${i}`,
      source: "fixture",
      location: "note",
      text:
        i === 0
          ? "[[Note1]] [[Note1]] [[Absent]]"
          : i === 1
            ? "[[Note0]]"
            : "BODY_ONLY_TOKEN",
    },
  ],
}));

test("catalog name search reaches beyond the first 80 stars and counts explicit directed links", () => {
  const first = sourceMap(status, files);
  expect(first.folders[0].files).toHaveLength(80);
  expect(first.catalog).toMatchObject({
    matched: 165,
    nextOffset: 80,
    resolvedDirectedLinks: 2,
    unresolvedTargets: 1,
    partialLinkFiles: 0,
  });
  const pages = [0, 80, 160].flatMap(
    (offset) => sourceMap(status, files, { offset }).folders[0].files,
  );
  expect(new Set(pages.map((file) => file.id)).size).toBe(165);
  const match = sourceMap(status, files, { query: "distant checklist" });
  expect(match.folders[0].files.map((file) => file.name)).toEqual([
    "Distant Checklist.md",
  ]);
  expect(match.catalog.matched).toBe(1);
  expect(match.catalog.resolvedDirectedLinks).toBe(2);
  expect(JSON.stringify(match)).not.toContain("BODY_ONLY_TOKEN");
  expect(
    sourceMap(status, files, { query: "BODY_ONLY_TOKEN" }).catalog.matched,
  ).toBe(0);
  expect(sourceMap(status, files, { query: "Knowledge" }).catalog.matched).toBe(
    165,
  );
});

test("catalog map query rejects invalid pages and requires controller and same origin", async ({
  context,
}) => {
  const data = { action: "map", query: "fixture", offset: 0 };
  expect(
    (await context.request.post("/api/sync/files", { data })).status(),
  ).toBe(401);
  await fixtureRole(context, "display");
  expect(
    (await context.request.post("/api/sync/files", { data })).status(),
  ).toBe(403);
  await fixtureRole(context, "controller");
  expect(
    (
      await context.request.post("/api/sync/files", {
        data,
        headers: { Origin: "https://foreign.test" },
      })
    ).status(),
  ).toBe(403);
  for (const bad of [
    { offset: -1 },
    { offset: 161 },
    { offset: 0.5 },
    { query: "a".repeat(201) },
    { query: 5 },
  ])
    expect(
      (
        await context.request.post("/api/sync/files", {
          data: { ...data, ...bad },
        })
      ).status(),
    ).toBe(400);
  expect(
    (await context.request.post("/api/sync/files", { data })).status(),
  ).toBe(200);
});

test("catalog paging and search reveal real stars without automatically reading their files", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  const reads: unknown[] = [];
  await page.route("**/api/sync/files", (route) => {
    const body = route.request().postDataJSON();
    if (body.action !== "map") {
      reads.push(body);
      return route.fulfill({ json: { answer: "Explicit read" } });
    }
    return route.fulfill({
      json: {
        map: sourceMap(status, files, {
          query: body.query,
          offset: body.offset,
        }),
        warnings: [],
      },
    });
  });
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  const galaxy = page.getByRole("region", { name: "Real file galaxy" });
  // The dashboard loads private stars only after controller status resolves.
  await expect(
    galaxy.getByRole("region", { name: "Indexed catalog coverage" }),
  ).toContainText("165 matching files");
  await galaxy.getByRole("button", { name: "Next indexed stars" }).click();
  await galaxy.getByRole("button", { name: "Next indexed stars" }).click();
  await expect(galaxy).toContainText("5 indexed file stars available");
  await galaxy
    .getByText("Find files and view controls", { exact: true })
    .click();
  await galaxy
    .getByLabel("Search all indexed file names")
    .fill("Distant Checklist");
  await galaxy
    .getByRole("button", { name: "Search indexed catalog", exact: true })
    .click();
  await expect(galaxy).toContainText(
    "1 matching files in 165 current indexed files",
  );
  expect(reads).toEqual([]);
  await galaxy
    .getByRole("button", { name: "Show indexed catalog", exact: true })
    .click();
  await expect(galaxy).toContainText("165 matching files");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
