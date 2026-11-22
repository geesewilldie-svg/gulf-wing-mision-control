import { test, expect } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  saveAssistantDraft,
  previewAssistantDraft,
  downloadAssistantDraft,
} from "../lib/server/assistant-drafts";
import { withStore } from "../lib/server/foundation/store";
import { fixtureRole } from "./helpers/access";
import { openAssistant } from "./helpers/assistant";

test("revised copies preserve originals, pin source content and retain idempotent lineage", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nexus-copy-")),
    prior = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    const parent = saveAssistantDraft({
      requestId: randomUUID(),
      title: "Original",
      text: "Original reviewed text",
      scope: "Personal",
      confirmed: true,
    }) as any;
    const preview = previewAssistantDraft(parent.id);
    withStore((db) =>
      db
        .prepare(
          "INSERT INTO events(task_id,type,at,detail) VALUES(NULL,'task.note',?,?)",
        )
        .run(new Date().toISOString(), "Ordinary non-JSON event text"),
    );
    expect(preview.text).toBe("Original reviewed text");
    const body = {
      requestId: randomUUID(),
      title: "Revision",
      text: "Revised owner text",
      scope: "Personal",
      confirmed: true,
      source: { id: parent.id, hash: parent.hash },
    };
    const copy = saveAssistantDraft(body) as any;
    expect(copy.id).not.toBe(parent.id);
    expect(downloadAssistantDraft(parent.id).toString()).toBe(
      "Original reviewed text",
    );
    expect(downloadAssistantDraft(copy.id).toString()).toBe(
      "Revised owner text",
    );
    expect((saveAssistantDraft(body) as any).id).toBe(copy.id);
    expect(() => saveAssistantDraft({ ...body, source: undefined })).toThrow(
      "different draft source",
    );
    const events = withStore((db) =>
      db.prepare("SELECT detail FROM events WHERE type='draft.copy'").all(),
    ) as { detail: string }[];
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].detail)).toEqual({
      draftId: copy.id,
      sourceId: parent.id,
      sourceHash: parent.hash,
    });
    expect(() =>
      saveAssistantDraft({
        ...body,
        requestId: randomUUID(),
        scope: "Aviation",
      }),
    ).toThrow("source draft changed");
    for (const source of [
      null,
      [],
      { id: "../outside", hash: parent.hash },
      { id: parent.id, hash: [parent.hash] },
      { id: parent.id, hash: parent.hash, path: "outside" },
    ])
      expect(() =>
        saveAssistantDraft({ ...body, requestId: randomUUID(), source }),
      ).toThrow();
    await writeFile(
      path.join(dir, "assistant-drafts", parent.id + ".md"),
      "Source changed on disk",
    );
    expect(() => previewAssistantDraft(parent.id)).toThrow("changed");
    expect(() =>
      saveAssistantDraft({ ...body, requestId: randomUUID() }),
    ).toThrow("source draft changed");
    expect((saveAssistantDraft(body) as any).id).toBe(copy.id);
  } finally {
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    await rm(dir, { recursive: true, force: true });
  }
});

test("saved draft copy editor focuses the correct field and saves a separate reviewed file", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  const title = "Copy fixture " + randomUUID();
  const response = await page.request.post("/api/sync/drafts", {
    data: {
      requestId: randomUUID(),
      title,
      text: "Original fixture content",
      scope: "Personal",
      confirmed: true,
    },
  });
  expect(response.ok()).toBe(true);
  const { draft } = await response.json();
  await page.goto("/nexus");
  await openAssistant(page);
  const panel = page.getByRole("region", { name: "Draft files", exact: true });
  await panel
    .getByRole("button", { name: "Saved drafts", exact: true })
    .click();
  await panel
    .getByRole("button", { name: `Revise copy: ${title}`, exact: true })
    .click();
  const editor = panel.getByRole("textbox", {
    name: "Draft text",
    exact: true,
  });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue("Original fixture content");
  await editor.fill("Owner reviewed revision");
  await panel
    .getByRole("button", { name: "Confirm and save draft file", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("saved and read back");
  const link = panel.getByRole("link", {
    name: `Download draft: ${title} revised`,
    exact: true,
  });
  const href = await link.getAttribute("href");
  expect(href).not.toContain(draft.id);
  expect(await (await page.request.get(href!)).text()).toBe(
    "Owner reviewed revision",
  );
  expect(
    await (await page.request.get(`/api/sync/drafts?id=${draft.id}`)).text(),
  ).toBe("Original fixture content");
});
