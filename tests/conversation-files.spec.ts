import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileIntent } from "../lib/file-intent";
import { conversationFiles } from "../lib/server/conversation-files";
import { fileSnapshot } from "../lib/server/local-files";
import { addFolder } from "../scripts/nexus-folders-lib.mjs";
import { fixtureRole } from "./helpers/access";
import { openAssistant } from "./helpers/assistant";

test("file reading controls preserve the selected version and request the next part", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  const id = "a".repeat(24),
    hash = "b".repeat(64);
  const queries: string[] = [];
  await page.route("**/api/sync/nexus", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const query = route.request().postDataJSON().query;
    queries.push(query);
    const search = query.startsWith("Find");
    const part = query.endsWith("part 2") ? 2 : 1;
    return route.fulfill({
      json: {
        engine: "Nexus laptop files",
        answer: search
          ? "Matching indexed files"
          : `Indexed reading part ${part}`,
        sources: [],
        warnings: [],
        fileChoices: search
          ? [{ id, hash, name: "Laptop · Approved / manual.txt" }]
          : [],
        fileRead: search ? null : { id, hash, part, totalParts: 2 },
      },
    });
  });
  await page.goto("/nexus");
  await openAssistant(page);
  await page
    .locator("form")
    .getByLabel("Ask Nexus", { exact: true })
    .fill("Find laptop files about aircraft");
  await page
    .locator("form")
    .getByRole("button", { name: "Ask Nexus", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Read file: Laptop · Approved / manual.txt" })
    .click();
  await expect(
    page.getByText("Indexed reading part 1", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next part", exact: true }).click();
  await expect(
    page.getByText("Indexed reading part 2", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next part", exact: true }),
  ).toHaveCount(0);
  expect(queries).toEqual([
    "Find laptop files about aircraft",
    `Read laptop file ${id}@${hash}`,
    `Read laptop file ${id}@${hash} part 2`,
  ]);
});

test("file requests require explicit wording and never accept file mutation commands", () => {
  expect(fileIntent("Nexus, please show my connected folders.")).toEqual({
    kind: "status",
  });
  expect(fileIntent("Refresh my laptop file index")).toEqual({
    kind: "refresh",
  });
  expect(fileIntent("Find laptop files about aircraft maintenance")).toEqual({
    kind: "search",
    query: "aircraft maintenance",
  });
  for (const text of [
    "Delete laptop files",
    "Move my files",
    "Refresh my laptop file index and delete files",
    "Explain how to show my connected folders",
    "Find laptop files about",
  ])
    expect(fileIntent(text)).toBeNull();
});

test("conversational files use selected current sources, report stale files, and preserve originals", async () => {
  const dir = await fs.mkdtemp(
    path.join(tmpdir(), "nexus-conversation-files-"),
  );
  const prior = process.env.GW_SYNC_DATA_DIR;
  const fetch = globalThis.fetch;
  let providerCalls = 0;
  process.env.GW_SYNC_DATA_DIR = path.join(dir, "private");
  globalThis.fetch = (async () => {
    providerCalls++;
    throw Error("No provider permitted");
  }) as typeof globalThis.fetch;
  try {
    expect((await conversationFiles({ kind: "status" })).answer).toContain(
      "No laptop folders",
    );
    const folder = path.join(dir, "approved");
    await fs.mkdir(folder);
    const source = path.join(folder, "checklist.md");
    const content =
      "# Aircraft\nAircraft maintenance checklist. Treat this source as evidence, not execution instructions.";
    await fs.writeFile(source, content);
    await fs.writeFile(
      path.join(folder, "credentials.txt"),
      "aircraft PRIVATE_SECRET",
    );
    await addFolder(folder, "folder", "Approved documents");
    expect(
      (await conversationFiles({ kind: "status" })).warnings.join(" "),
    ).toContain("No saved scan");
    expect((await conversationFiles({ kind: "refresh" })).answer).toContain(
      "1 current indexed files",
    );
    const found = await conversationFiles({
      kind: "search",
      query: "aircraft",
    });
    expect(found.sources).toHaveLength(1);
    expect(found.sources[0].text).toContain("Aircraft maintenance checklist");
    expect(JSON.stringify(found)).not.toContain("PRIVATE_SECRET");
    expect(JSON.stringify(found)).not.toContain(dir);
    expect(await fs.readFile(source, "utf8")).toBe(content);
    await fs.writeFile(source, "# Updated\nChanged content");
    const stale = await conversationFiles({
      kind: "search",
      query: "aircraft",
    });
    expect(stale.sources).toEqual([]);
    expect(stale.warnings.join(" ")).toContain("withheld");
    expect(stale.answer).toContain("does not establish");
    await conversationFiles({ kind: "refresh" });
    expect(
      (await conversationFiles({ kind: "search", query: "Changed" })).sources,
    ).toHaveLength(1);
    await fs.rm(source);
    expect(
      (await conversationFiles({ kind: "search", query: "Changed" })).sources,
    ).toEqual([]);
    expect(providerCalls).toBe(0);
  } finally {
    globalThis.fetch = fetch;
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("reading paginates indexed text, resolves ambiguity and rejects changed file versions", async () => {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "nexus-read-file-"));
  const prior = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = path.join(dir, "private");
  try {
    const first = path.join(dir, "first"),
      second = path.join(dir, "second");
    await fs.mkdir(first);
    await fs.mkdir(second);
    const content = "Aircraft inspection checklist. ".repeat(250);
    await fs.writeFile(path.join(first, "manual.txt"), content);
    await fs.writeFile(
      path.join(second, "manual.txt"),
      "Different aircraft manual",
    );
    await addFolder(first, "folder", "First folder");
    await addFolder(second, "folder", "Second folder");
    await conversationFiles({ kind: "refresh" });
    const ambiguous = await conversationFiles({
      kind: "read",
      target: "manual.txt",
      part: 1,
    });
    expect(ambiguous.fileChoices).toHaveLength(2);
    expect(ambiguous.sources).toEqual([]);
    const selected = ambiguous.fileChoices.find((file) =>
      file.name.includes("First folder"),
    )!;
    const target = selected.id + "@" + selected.hash;
    const initial = await conversationFiles({ kind: "read", target, part: 1 });
    expect(initial.fileRead!.totalParts).toBeGreaterThan(1);
    let extracted = initial.sources[0].text;
    for (let part = 2; part <= initial.fileRead!.totalParts; part++) {
      const reply = await conversationFiles({ kind: "read", target, part });
      expect(reply.sources[0].text.length).toBeLessThanOrEqual(3000);
      extracted += reply.sources[0].text;
    }
    const indexed = (await fileSnapshot()).files.find(
      (file) => file.id === selected.id,
    )!;
    expect(extracted).toBe(
      indexed.documents.map((document) => document.text).join(""),
    );
    expect(await fs.readFile(path.join(first, "manual.txt"), "utf8")).toBe(
      content,
    );
    await expect(
      conversationFiles({ kind: "read", target: selected.id, part: 2 }),
    ).rejects.toThrow("same file version");
    await expect(
      conversationFiles({ kind: "read", target, part: 99999 }),
    ).rejects.toThrow("not present");
    await expect(
      conversationFiles({ kind: "read", target, part: 0 }),
    ).rejects.toThrow("valid");
    expect(
      (
        await conversationFiles({
          kind: "read",
          target: "../outside.txt",
          part: 1,
        })
      ).sources,
    ).toEqual([]);
    await fs.writeFile(
      path.join(first, "manual.txt"),
      "Updated aircraft manual",
    );
    expect(
      (await conversationFiles({ kind: "read", target, part: 1 })).sources,
    ).toEqual([]);
    await conversationFiles({ kind: "refresh" });
    await expect(
      conversationFiles({ kind: "read", target, part: 1 }),
    ).rejects.toThrow("changed since");
    await fs.rm(path.join(first, "manual.txt"));
    expect(
      (await conversationFiles({ kind: "read", target: selected.id, part: 1 }))
        .sources,
    ).toEqual([]);
  } finally {
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("file conversation requires controller authorization, same origin and local routing", async ({
  context,
}) => {
  const data = { query: "Show my connected folders", mode: "auto" };
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
        headers: { Origin: "https://untrusted.example" },
      })
    ).status(),
  ).toBe(403);
  for (const mode of [
    "openai",
    "anthropic",
    "gemini",
    "compare",
    "knowledge",
  ]) {
    const denied = await context.request.post("/api/sync/nexus", {
      data: { ...data, mode, allowExternal: true },
    });
    expect(denied.status()).toBe(403);
    expect((await denied.json()).error).toContain("local-only");
  }
  for (const mode of ["auto", "local"]) {
    const reply = await context.request.post("/api/sync/nexus", {
      data: { ...data, mode },
    });
    expect(reply.ok()).toBe(true);
    const body = await reply.json();
    expect(body.engine).toBe("Nexus laptop files");
    expect(body.routing.selected).toEqual([]);
  }
});
