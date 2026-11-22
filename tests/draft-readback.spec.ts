import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  saveAssistantDraft,
  previewAssistantDraft,
} from "../lib/server/assistant-drafts";
import { withStore } from "../lib/server/foundation/store";
import { fixtureRole } from "./helpers/access";
import { openAssistant } from "./helpers/assistant";

test("read-back derives UTF-8 size from verified bytes while preserving inconsistent metadata", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nexus-readback-")),
    prior = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    const text = "This is my revised Nexus draft.";
    expect(Buffer.byteLength(text)).toBe(31);
    expect(Buffer.byteLength(text.slice(0, -1))).toBe(30);
    const draft = saveAssistantDraft({
      requestId: randomUUID(),
      title: "Readback",
      scope: "Personal",
      confirmed: true,
      text,
    }) as any;
    withStore((db) =>
      db
        .prepare("UPDATE assistant_drafts SET bytes=65 WHERE id=?")
        .run(draft.id),
    );
    const result = previewAssistantDraft(draft.id);
    expect(result.text).toBe(text);
    expect(result.verifiedBytes).toBe(31);
    expect(result.bytes).toBe(31);
    expect(result.recordedBytes).toBe(65);
    expect(result.sizeWarning).toContain("differs");
    expect(
      withStore(
        (db) =>
          (
            db
              .prepare("SELECT bytes FROM assistant_drafts WHERE id=?")
              .get(draft.id) as any
          ).bytes,
      ),
    ).toBe(65);
    const unicode = saveAssistantDraft({
      requestId: randomUUID(),
      title: "Unicode",
      scope: "Personal",
      confirmed: true,
      text: "é🙂",
    }) as any;
    expect(previewAssistantDraft(unicode.id).verifiedBytes).toBe(6);
  } finally {
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    await rm(dir, { recursive: true, force: true });
  }
});

test("a mismatching post-save read-back withholds success and keeps the reviewed text", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  let writes = 0;
  const id = "a".repeat(32);
  await page.route("**/api/sync/drafts**", (route) => {
    if (route.request().method() === "POST") {
      writes++;
      return route.fulfill({
        json: { draft: { id, title: "Fixture", bytes: 65 } },
      });
    }
    return route.fulfill({
      json: {
        draft: {
          id,
          title: "Fixture",
          text: "Original model reply",
          bytes: 20,
          recordedBytes: 65,
          verifiedBytes: 20,
        },
      },
    });
  });
  await page.goto("/nexus");
  await openAssistant(page);
  const question = page
    .locator("form")
    .getByLabel("Ask Nexus", { exact: true });
  await question.fill("What time is it?");
  await page
    .locator("form")
    .getByRole("button", { name: "Ask Nexus", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Draft files", exact: true });
  await panel.getByRole("button", { name: "Save this answer" }).click();
  const editor = panel.getByRole("textbox", {
    name: "File text",
    exact: true,
  });
  await editor.fill("This is my revised Nexus draft.");
  await panel.getByRole("button", { name: "Save file", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText(
    "differs from the reviewed text",
  );
  await expect(editor).toHaveValue("This is my revised Nexus draft.");
  await expect(
    panel.getByRole("region", { name: "Saved file read-back", exact: true }),
  ).toHaveCount(0);
  expect(writes).toBe(1);
});

test("saved file inspection displays actual text and verified size", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  const title = "Inspect " + randomUUID(),
    text = "This is my revised Nexus draft.";
  const save = await page.request.post("/api/sync/drafts", {
    data: {
      requestId: randomUUID(),
      title,
      text,
      scope: "Personal",
      confirmed: true,
    },
  });
  expect(save.ok()).toBe(true);
  await page.goto("/nexus");
  await openAssistant(page);
  const panel = page.getByRole("region", { name: "Draft files", exact: true });
  await panel
    .getByRole("button", { name: "Show saved files", exact: true })
    .click();
  await panel
    .getByRole("article", { name: title, exact: true })
    .getByRole("button", { name: "View text", exact: true })
    .click();
  const readback = panel.getByRole("region", {
    name: "Saved file read-back",
    exact: true,
  });
  await expect(readback).toContainText("Checked file size: 31 bytes");
  await expect(readback.locator("pre")).toHaveText(text);
});
