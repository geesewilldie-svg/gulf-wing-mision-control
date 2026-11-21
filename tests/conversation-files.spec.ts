import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileIntent } from "../lib/file-intent";
import { conversationFiles } from "../lib/server/conversation-files";
import { addFolder } from "../scripts/nexus-folders-lib.mjs";
import { fixtureRole } from "./helpers/access";

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
