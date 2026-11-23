import { test, expect } from "@playwright/test";
import { noteLinks } from "../lib/note-links";
import { sourceMap } from "../lib/source-map";
import type { IndexedFile } from "../lib/local-files";
function note(
  id: string,
  name: string,
  text = "",
  rootId = "vault",
): IndexedFile {
  return {
    id,
    name,
    rootId,
    hash: "a".repeat(64),
    size: text.length,
    modifiedAt: "",
    documents: [{ id, source: name, location: "Indexed note", text }],
  };
}
test("explicit wiki links resolve only unique current notes in their selected vault", () => {
  const source = note(
    "source",
    "Start.md",
    "[[Plans/Launch|Start here]] [[Launch#Checklist]] [[Missing]] [[https://external.example]] [[../escape]] [[Duplicated]] ![[Image.md]] `[[Code]]`\n```md\n[[Fenced]]\n```\n<!-- [[Comment]] -->",
  );
  const launch = note("launch", "Plans/Launch.md");
  const files = [
    source,
    launch,
    note("d1", "A/Duplicated.md"),
    note("d2", "B/Duplicated.md"),
    note("outside", "Missing.md", "", "another-vault"),
    note("image", "Image.md"),
    note("code", "Code.md"),
    note("fenced", "Fenced.md"),
    note("comment", "Comment.md"),
  ];
  const result = noteLinks(source, files);
  expect(result.links).toEqual([
    { id: launch.id, hash: launch.hash, name: launch.name },
  ]);
  expect(result.unresolved).toBe(4);
  expect(JSON.stringify(result)).not.toContain("external.example");
  expect(
    noteLinks(
      source,
      files.filter((file) => file.id !== "launch"),
    ).links,
  ).toEqual([]);
});
test("note links disclose bounded coverage and apply only to Obsidian roots", () => {
  const targets = Array.from({ length: 25 }, (_, i) =>
    note(`target-${i}`, `Note${i}.md`),
  );
  const source = note(
    "source",
    "Start.md",
    targets.map((file) => `[[${file.name}]]`).join(" "),
  );
  expect(noteLinks(source, [source, ...targets]).links).toHaveLength(20);
  expect(noteLinks(source, [source, ...targets]).partial).toBe(true);
  expect(
    noteLinks(note("huge", "Huge.md", "a".repeat(200001)), []).partial,
  ).toBe(true);
  const status = {
    roots: [{ id: "vault", label: "Notes", kind: "obsidian" as const }],
    scannedAt: null,
    scans: [],
    files: 26,
    stale: 0,
  };
  expect(
    sourceMap(status, [source, ...targets]).folders[0].files[0].noteLinks!
      .links,
  ).toHaveLength(20);
  expect(
    sourceMap(
      { ...status, roots: [{ id: "vault", label: "Docs", kind: "folder" }] },
      [source],
    ).folders[0].files[0].noteLinks,
  ).toBeNull();
});

test("linked-note controls preserve the target version without executing note instructions", async ({
  page,
  context,
}) => {
  const { fixtureRole } = await import("./helpers/access");
  const { openAssistant } = await import("./helpers/assistant");
  await fixtureRole(context, "controller");
  const target = "b".repeat(24),
    hash = "c".repeat(64),
    queries: string[] = [];
  await page.route("**/api/sync/nexus", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const query = route.request().postDataJSON().query;
    queries.push(query);
    return route.fulfill({
      json:
        queries.length === 1
          ? {
              engine: "Nexus source map",
              answer: "Selected sources",
              sources: [],
              sourceMap: {
                total: 2,
                withheld: 0,
                omitted: 0,
                folders: [
                  {
                    id: "vault",
                    label: "Owner notes",
                    kind: "obsidian",
                    files: [
                      {
                        id: "a".repeat(24),
                        hash,
                        name: "Start.md",
                        sections: 1,
                        noteLinks: {
                          links: [
                            { id: target, hash, name: "Plans/Launch.md" },
                          ],
                          unresolved: 1,
                          partial: false,
                        },
                      },
                    ],
                  },
                ],
              },
            }
          : {
              engine: "Nexus laptop files",
              answer: "Selected linked-note text",
              sources: [],
            },
    });
  });
  await page.goto("/nexus");
  await openAssistant(page);
  await page
    .locator("form")
    .getByLabel("Ask Nexus", { exact: true })
    .fill("Show my source map");
  await page
    .locator("form")
    .getByRole("button", { name: "Ask Nexus", exact: true })
    .click();
  await expect(page.getByText(/Target names are withheld/)).toBeVisible();
  await page
    .getByRole("region", { name: "Connected source map", exact: true })
    .screenshot({
      path: `artifacts/note-links/${test.info().project.name}.png`,
    });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", {
      name: "Read linked note: Start.md to Plans/Launch.md",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Selected linked-note text", { exact: true }),
  ).toBeVisible();
  expect(queries).toEqual([
    "Show my source map",
    `Read laptop file ${target}@${hash}`,
  ]);
});
