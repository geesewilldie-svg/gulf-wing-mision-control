import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { conversationFiles } from "../lib/server/conversation-files";
import { addFolder } from "../scripts/nexus-folders-lib.mjs";
import { fileIntent } from "../lib/file-intent";
import { sourceMap } from "../lib/source-map";
import { fixtureRole } from "./helpers/access";
import { openAssistant } from "./helpers/assistant";

test("source map withholds stale files, avoids content/path disclosure and revalidates read access", async () => {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "nexus-source-map-"));
  const previous = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = path.join(dir, "private");
  try {
    const folder = path.join(dir, "selected");
    await fs.mkdir(folder);
    const file = path.join(folder, "Note.md");
    await fs.writeFile(file, "PRIVATE_NOTE_CONTENT");
    await addFolder(folder, "obsidian", "Owner notes");
    await conversationFiles({ kind: "refresh" });
    const result = await conversationFiles({ kind: "map" });
    expect(result.sourceMap!.folders[0].files[0].name).toBe("Note.md");
    expect(JSON.stringify(result)).not.toContain(dir);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_NOTE_CONTENT");
    const entry = result.sourceMap!.folders[0].files[0];
    await fs.writeFile(file, "CHANGED");
    expect((await conversationFiles({ kind: "map" })).sourceMap!.withheld).toBe(
      1,
    );
    expect(
      (await conversationFiles({ kind: "map" })).sourceMap!.folders[0].files,
    ).toEqual([]);
    const unavailable = await conversationFiles({
      kind: "read",
      target: `${entry.id}@${entry.hash}`,
      part: 1,
    });
    expect(unavailable.fileRead).toBeNull();
    expect(unavailable.sources).toEqual([]);
    expect(unavailable.answer).toContain("not available");
    expect(fileIntent("Nexus, please show my source map.")).toEqual({
      kind: "map",
    });
    expect(fileIntent("Show my source map and delete files")).toBeNull();
    const files = Array.from({ length: 81 }, (_, i) => ({
      id: String(i),
      rootId: "root",
      name: `${i}.md`,
      hash: "a".repeat(64),
      size: 1,
      modifiedAt: "",
      documents: [],
    }));
    const limited = sourceMap(
      {
        roots: [{ id: "root", label: "Notes", kind: "folder" }],
        scannedAt: null,
        files: 81,
        stale: 0,
        scans: [],
      },
      files,
    );
    expect(limited.omitted).toBe(1);
    expect(limited.folders[0].files).toHaveLength(80);
  } finally {
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("source map filters names and reads only a selected version", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  const queries: string[] = [];
  const id = "a".repeat(24),
    hash = "b".repeat(64);
  await page.route("**/api/sync/nexus", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const query = route.request().postDataJSON().query;
    queries.push(query);
    return route.fulfill({
      json:
        query === "Show my source map"
          ? {
              engine: "Nexus source map",
              answer: "Your selected folders",
              sources: [],
              sourceMap: {
                total: 2,
                withheld: 0,
                omitted: 0,
                scannedAt: null,
                folders: [
                  {
                    id: "root",
                    label: "Owner notes",
                    kind: "obsidian",
                    files: [
                      { id, hash, name: "Checklist.md", sections: 1 },
                      {
                        id: "c".repeat(24),
                        hash,
                        name: "Other.md",
                        sections: 1,
                      },
                    ],
                  },
                ],
              },
            }
          : {
              engine: "Nexus laptop files",
              answer: "Current selected text",
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
  await page.getByLabel("Filter folders and file names").fill("Checklist");
  await expect(page.getByText("Other.md", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Read file: Owner notes / Checklist.md",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "Connected source map", exact: true })
    .screenshot({
      path: `artifacts/source-map/${test.info().project.name}.png`,
    });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", {
      name: "Read file: Owner notes / Checklist.md",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Current selected text", { exact: true }),
  ).toBeVisible();
  expect(queries).toEqual([
    "Show my source map",
    `Read laptop file ${id}@${hash}`,
  ]);
});

test("source map retains controller, origin and local-mode boundaries", async ({
  context,
}) => {
  const data = { query: "Show my source map", mode: "auto" };
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
        headers: { Origin: "https://foreign.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post("/api/sync/nexus", {
        data: { ...data, mode: "gemini", allowExternal: true },
      })
    ).status(),
  ).toBe(403);
  const result = await context.request.post("/api/sync/nexus", { data });
  expect(result.status()).toBe(200);
  expect((await result.json()).engine).toBe("Nexus source map");
});
