import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import {
  saveAssistantDraft,
  listAssistantDrafts,
  downloadAssistantDraft,
} from "../lib/server/assistant-drafts";
import {
  withStore,
  saveMemory,
  snapshot,
} from "../lib/server/foundation/store";
import { fixtureRole } from "./helpers/access";
import { openAssistant } from "./helpers/assistant";
async function isolated(run: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "nexus-draft-")),
    prior = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    await run(dir);
  } finally {
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    await fs.rm(dir, { recursive: true, force: true });
  }
}
const input = () => ({
  requestId: randomUUID(),
  title: "Reviewed checklist",
  scope: "Personal",
  text: "# Checklist\nReview this text.\n",
  confirmed: true,
});
test("reviewed drafts create verified new files, deduplicate and never overwrite changed artifacts", async () =>
  isolated(async (dir) => {
    const body = input(),
      first = saveAssistantDraft(body) as any;
    expect(first.id).toMatch(/^[a-f0-9]{32}$/);
    expect(downloadAssistantDraft(first.id).toString()).toBe(body.text);
    expect((saveAssistantDraft(body) as any).id).toBe(first.id);
    expect(listAssistantDrafts("Personal")).toHaveLength(1);
    expect(listAssistantDrafts("Aviation")).toEqual([]);
    expect(() =>
      saveAssistantDraft({ ...body, text: "Different content" }),
    ).toThrow("different content");
    const file = path.join(dir, "assistant-drafts", first.id + ".md");
    await fs.writeFile(file, "Owner changed this file");
    expect(() => downloadAssistantDraft(first.id)).toThrow("changed");
    expect(() => saveAssistantDraft(body)).toThrow("Nothing was overwritten");
    expect(await fs.readFile(file, "utf8")).toBe("Owner changed this file");
    await fs.rm(file);
    expect(() => downloadAssistantDraft(first.id)).toThrow(
      "missing or unavailable",
    );
  }));
test("drafts reject unconfirmed writes, paths, oversized UTF-8 payloads and redirected output", async () =>
  isolated(async (dir) => {
    for (const change of [
      { confirmed: false },
      { filename: "../outside.md" },
      { overwrite: true },
      { requestId: "../../outside" },
      { text: "é".repeat(20001) },
      { title: "bad\nheader" },
    ])
      expect(() => saveAssistantDraft({ ...input(), ...change })).toThrow();
    expect(listAssistantDrafts("Personal")).toEqual([]);
    const outside = path.join(dir, "outside");
    await fs.mkdir(outside);
    await fs.symlink(outside, path.join(dir, "assistant-drafts"), "dir");
    expect(() => saveAssistantDraft(input())).toThrow("redirected");
    expect(await fs.readdir(outside)).toEqual([]);
  }));
test("an interrupted unrecorded file is reconciled only by exact read-back and schema seven is backed up", async () =>
  isolated(async (dir) => {
    saveMemory({
      kind: "fact",
      scope: "Personal",
      content: "Keep existing memory",
    });
    withStore((db) =>
      db.exec("DROP TABLE assistant_drafts; PRAGMA user_version=7;"),
    );
    expect(listAssistantDrafts("Personal")).toEqual([]);
    expect(snapshot().memory[0].content).toBe("Keep existing memory");
    expect(
      (await fs.readdir(path.join(dir, "foundation-backups"))).some((name) =>
        name.startsWith("before-schema-8-"),
      ),
    ).toBe(true);
    const body = input(),
      id = createHash("sha256")
        .update(body.requestId)
        .digest("hex")
        .slice(0, 32);
    await fs.mkdir(path.join(dir, "assistant-drafts"));
    await fs.writeFile(
      path.join(dir, "assistant-drafts", id + ".md"),
      body.text,
    );
    expect((saveAssistantDraft(body) as any).id).toBe(id);
    expect(listAssistantDrafts("Personal")).toHaveLength(1);
  }));
test("draft API requires controller identity, origin and explicit review, and downloads exact content", async ({
  context,
}) => {
  const body = input();
  expect((await context.request.get("/api/sync/drafts")).status()).toBe(401);
  expect(
    (await context.request.post("/api/sync/drafts", { data: body })).status(),
  ).toBe(401);
  await fixtureRole(context, "display");
  expect((await context.request.get("/api/sync/drafts")).status()).toBe(403);
  expect(
    (await context.request.post("/api/sync/drafts", { data: body })).status(),
  ).toBe(403);
  await fixtureRole(context, "controller");
  expect(
    (
      await context.request.post("/api/sync/drafts", {
        data: body,
        headers: { Origin: "https://untrusted.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post("/api/sync/drafts", {
        data: { ...body, confirmed: false },
      })
    ).status(),
  ).toBe(400);
  const saved = await context.request.post("/api/sync/drafts", { data: body });
  expect(saved.ok()).toBe(true);
  const { draft } = await saved.json();
  const repeated = await context.request.post("/api/sync/drafts", {
    data: body,
  });
  expect((await repeated.json()).draft.id).toBe(draft.id);
  const download = await context.request.get(`/api/sync/drafts?id=${draft.id}`);
  expect(download.ok()).toBe(true);
  expect(download.headers()["content-disposition"]).toContain("attachment");
  expect(await download.text()).toBe(body.text);
  expect(
    (await context.request.get("/api/sync/drafts?id=../../secrets")).status(),
  ).toBe(400);
});
test("answer draft review can be cancelled, edited, saved and retrieved after reload", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  let writes = 0;
  page.on("request", (request) => {
    if (
      request.url().endsWith("/api/sync/drafts") &&
      request.method() === "POST"
    )
      writes++;
  });
  await page.goto("/nexus");
  await openAssistant(page);
  await page
    .locator("form")
    .getByLabel("Ask Nexus", { exact: true })
    .fill("What time is it?");
  await page
    .locator("form")
    .getByRole("button", { name: "Ask Nexus", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Draft files", exact: true });
  await expect(
    panel.getByRole("button", { name: "Save this answer" }),
  ).toBeEnabled();
  await panel.getByRole("button", { name: "Save this answer" }).click();
  await panel
    .getByRole("button", { name: "Cancel editing", exact: true })
    .click();
  expect(writes).toBe(0);
  await panel.getByRole("button", { name: "Save this answer" }).click();
  const title = "Reviewed draft " + randomUUID(),
    text = "# Reviewed owner text\nNo external action performed.\n";
  await panel
    .getByRole("textbox", { name: "File title", exact: true })
    .fill(title);
  await panel
    .getByRole("textbox", { name: "File text", exact: true })
    .fill(text);
  await panel.getByRole("button", { name: "Save file", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("File saved.");
  const href = await panel
    .getByRole("article", { name: title, exact: true })
    .getByRole("link", { name: "Download", exact: true })
    .getAttribute("href");
  expect(await (await page.request.get(href!)).text()).toBe(text);
  expect(writes).toBe(1);
  await page.reload();
  await openAssistant(page);
  await panel
    .getByRole("button", { name: "Show saved files", exact: true })
    .click();
  await expect(
    panel
      .getByRole("article", { name: title, exact: true })
      .getByRole("link", { name: "Download", exact: true }),
  ).toBeVisible();
});
