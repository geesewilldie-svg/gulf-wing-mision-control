import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { prepareMemoryVault } from "../scripts/memory-vault-lib.mjs";
import { workJournalReceipts } from "../lib/server/work-journal";
import { memoryVault } from "../lib/server/memory-vault";
import {
  inspectNoteVersions,
  trackSavedNote,
  noteSource,
} from "../lib/server/note-versions";
import {
  saveMemory,
  createTask,
  withStore,
  deleteTask,
} from "../lib/server/foundation/store";
import { fixtureRole } from "./helpers/access";
async function fixture(run: (dir: string, vault: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "note-versions-")),
    prior = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    const vault = path.join(dir, "vault");
    await fs.mkdir(vault);
    await fs.writeFile(
      path.join(dir, "local-folders.json"),
      JSON.stringify({
        version: 1,
        roots: [
          {
            id: "a".repeat(24),
            label: "Selected vault",
            kind: "obsidian",
            path: vault,
          },
        ],
      }),
    );
    await prepareMemoryVault(dir, "a".repeat(24));
    await run(dir, vault);
  } finally {
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    await fs.rm(dir, { recursive: true, force: true });
  }
}
async function save(kind = "owner-memory", taskId?: string) {
  const input = { scope: "Personal", kind, taskId };
  const preview = await memoryVault({ ...input, op: "memory.vault.preview" });
  if (!("markdown" in preview)) throw Error("Expected preview");
  const saved = await memoryVault({
    ...input,
    ...preview,
    scope: "Personal",
    op: "memory.vault.save",
    confirm: true,
  });
  if (!("filename" in saved)) throw Error("Expected save");
  return saved;
}
const inspect = () =>
  inspectNoteVersions({ op: "memory.notes.inspect", scope: "Personal" });

test("snapshots retain one logical identity, flag supersession and external edits without modifying notes", () =>
  fixture(async (dir, vault) => {
    const id = saveMemory({
      scope: "Personal",
      kind: "fact",
      content: "QUARTZ owner value one",
    });
    const first = await save();
    expect(first.tracking).toBe("tracked");
    const initial = await inspect();
    expect(initial.rows[0]).toMatchObject({
      fileState: "unchanged",
      sourceState: "matches-current-record",
      superseded: false,
    });
    expect(initial.rows[0].noteId).toMatch(/^[a-f0-9]{64}$/);
    saveMemory({
      id,
      revision: 0,
      scope: "Personal",
      kind: "fact",
      content: "QUARTZ owner corrected",
    });
    expect((await inspect()).rows[0].sourceState).toBe("historical-version");
    const second = await save();
    expect(second.tracking).toBe("tracked");
    const versions = await inspect();
    expect(versions.rows).toHaveLength(2);
    expect(new Set(versions.rows.map((row) => row.noteId)).size).toBe(1);
    expect(versions.rows.filter((row) => row.superseded)).toHaveLength(1);
    const target = path.join(vault, ...first.file.name.split("/"));
    await fs.writeFile(target, "OWNER EXTERNAL EDIT");
    const edited = await inspect();
    expect(
      edited.rows.find((row) => row.name === first.filename)?.fileState,
    ).toBe("externally-changed");
    expect(await fs.readFile(target, "utf8")).toBe("OWNER EXTERNAL EDIT");
    expect(JSON.stringify(edited)).not.toContain("QUARTZ owner");
    expect(JSON.stringify(edited)).not.toContain(dir);
    expect(
      (
        await inspectNoteVersions({
          op: "memory.notes.inspect",
          scope: "Aviation",
        })
      ).total,
    ).toBe(0);
    await fs.writeFile(
      path.join(dir, "local-folders.json"),
      JSON.stringify({ version: 1, roots: [] }),
    );
    const revoked = await inspect();
    expect(
      revoked.rows.every(
        (row) => row.fileState === "unavailable" && row.name === null,
      ),
    ).toBe(true);
    const replacement = path.join(dir, "replacement-vault");
    const copied = path.join(replacement, ...second.file.name.split("/"));
    await fs.mkdir(path.dirname(copied), { recursive: true });
    await fs.copyFile(path.join(vault, ...second.file.name.split("/")), copied);
    await fs.writeFile(
      path.join(dir, "local-folders.json"),
      JSON.stringify({
        version: 1,
        roots: [
          {
            id: "a".repeat(24),
            label: "Replaced source",
            kind: "obsidian",
            path: replacement,
          },
        ],
      }),
    );
    expect(
      (await inspect()).rows.every(
        (row) => row.fileState === "unavailable" && row.name === null,
      ),
    ).toBe(true);
  }));

test("task deletion and missing files are distinct; catalog failure cannot turn a confirmed save into a file retry", () =>
  fixture(async (dir, vault) => {
    const taskId = createTask({
      scope: "Personal",
      mode: "plan",
      request: "Test artifact",
    });
    withStore((db) =>
      db
        .prepare(
          "UPDATE tasks SET state='completed',output='UNVERIFIED_OUTPUT' WHERE id=?",
        )
        .run(taskId),
    );
    const saved = await save("work-note", taskId);
    expect(saved.tracking).toBe("tracked");
    deleteTask({ id: taskId, revision: 0 });
    expect((await inspect()).rows[0].sourceState).toBe("source-missing");
    const target = path.join(vault, ...saved.file.name.split("/"));
    await fs.unlink(target);
    expect((await inspect()).rows[0].fileState).toBe("missing");
    await fs.writeFile(path.join(dir, "note-versions.json"), "BROKEN");
    const next = await save();
    expect(next.tracking).toBe("pending");
    expect(
      await fs.readFile(path.join(vault, ...next.file.name.split("/")), "utf8"),
    ).toContain("# Nexus owner memory");
    expect(
      await fs.readFile(path.join(dir, "note-versions.json"), "utf8"),
    ).toBe("BROKEN");
    await expect(inspect()).rejects.toMatchObject({ status: 503 });
  }));

test("inspection rejects source changes during file reads and malformed paging inputs", () =>
  fixture(async (dir, vault) => {
    const id = saveMemory({
      scope: "Personal",
      kind: "fact",
      content: "QUARTZ initial",
    });
    const saved = await save();
    const target = path.join(vault, ...saved.file.name.split("/"));
    const original = fs.lstat;
    let changed = false;
    fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => {
      if (String(args[0]) === target && !changed) {
        changed = true;
        saveMemory({
          id,
          revision: 0,
          scope: "Personal",
          kind: "fact",
          content: "QUARTZ changed during inspection",
        });
      }
      return original(...args);
    }) as typeof fs.lstat;
    try {
      await expect(inspect()).rejects.toMatchObject({ status: 409 });
    } finally {
      fs.lstat = original;
    }
    await expect(
      inspectNoteVersions({
        op: "memory.notes.inspect",
        scope: "Personal",
        path: "C:/arbitrary",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      inspectNoteVersions({
        op: "memory.notes.inspect",
        scope: "Personal",
        offset: 500,
      }),
    ).rejects.toMatchObject({ status: 400 });
  }));

test("catalog registration is idempotent and page coverage stays bounded", () =>
  fixture(async (dir) => {
    const saved = await save();
    const sourceVersion = noteSource("Personal", "owner-memory")!;
    expect(
      await trackSavedNote(saved, {
        workspace: "Personal",
        kind: "owner-memory",
        sourceVersion,
        producer: "reviewed",
      }),
    ).toBe("tracked");
    expect(
      await trackSavedNote(saved, {
        workspace: "Personal",
        kind: "owner-memory",
        sourceVersion: "f".repeat(64),
        producer: "reviewed",
      }),
    ).toBe("pending");
    await fs.mkdir(path.join(dir, "work-journal"));
    await fs.writeFile(
      path.join(
        dir,
        "work-journal",
        "11111111-1111-1111-1111-111111111111-0.json",
      ),
      JSON.stringify({
        state: "saved",
        indexing: "indexed",
        tracking: "pending",
      }),
    );
    expect(await workJournalReceipts()).toMatchObject({
      count: 1,
      unconfirmed: 0,
      pendingTracking: 1,
    });
    expect((await inspect()).total).toBe(1);
    for (let i = 0; i < 11; i++) await save();
    const first = await inspect();
    expect(first.rows).toHaveLength(10);
    expect(first.total).toBe(12);
    expect(first.nextOffset).toBe(10);
    const second = await inspectNoteVersions({
      op: "memory.notes.inspect",
      scope: "Personal",
      offset: 10,
    });
    expect(second.rows).toHaveLength(2);
    expect(second.nextOffset).toBeNull();
    const savedTimes = [...first.rows, ...second.rows].map(
      (row) => row.savedAt,
    );
    expect(savedTimes).toEqual([...savedTimes].sort().reverse());
    expect(
      new Set([...first.rows, ...second.rows].map((row) => row.id)).size,
    ).toBe(12);
    const catalogPath = path.join(dir, "note-versions.json"),
      data = JSON.parse(await fs.readFile(catalogPath, "utf8"));
    data.entries[0].noteId = "0".repeat(64);
    await fs.writeFile(catalogPath, JSON.stringify(data));
    await expect(inspect()).rejects.toMatchObject({ status: 503 });
  }));

test("saved-note inspection is controller-only and same-origin", async ({
  context,
}) => {
  const data = { op: "memory.notes.inspect", scope: "Personal" };
  expect(
    (await context.request.post("/api/sync/foundation", { data })).status(),
  ).toBe(401);
  await fixtureRole(context, "display");
  expect(
    (await context.request.post("/api/sync/foundation", { data })).status(),
  ).toBe(403);
  await fixtureRole(context, "controller");
  expect(
    (
      await context.request.post("/api/sync/foundation", {
        data,
        headers: { Origin: "https://foreign.test" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await context.request.post("/api/sync/foundation", { data })).status(),
  ).toBe(200);
});

test("version inspection stays beside its controls and clears private results after denied access", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  let denied = false,
    calls = 0;
  await page.route("**/api/sync/foundation", (route) => {
    if (
      route.request().method() !== "POST" ||
      route.request().postDataJSON().op !== "memory.notes.inspect"
    )
      return route.continue();
    calls++;
    if (denied)
      return route.fulfill({
        status: 403,
        json: { error: "Controller access required" },
      });
    return route.fulfill({
      json: {
        workspace: "Personal",
        total: 1,
        offset: 0,
        nextOffset: null,
        checkedAt: "2026-11-25T10:00:00.000Z",
        notice: "Read-only inspection; existing edits were preserved.",
        rows: [
          {
            id: "a".repeat(64),
            noteId: "b".repeat(64),
            name: "edited-snapshot.md",
            kind: "owner-memory",
            producer: "reviewed",
            savedAt: "2026-11-25T09:00:00.000Z",
            fileState: "externally-changed",
            sourceState: "historical-version",
            superseded: true,
          },
        ],
      },
    });
  });
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Foundation", exact: true }).click();
  const panel = page.locator(".saved-note-versions");
  await expect(panel).toBeVisible();
  expect(calls).toBe(0);
  await panel.locator("summary").click();
  await panel
    .getByRole("button", { name: "Inspect Personal saved notes", exact: true })
    .click();
  await expect(
    panel.getByRole("region", { name: "Saved-note inspection results" }),
  ).toContainText("External edit detected");
  await expect(panel).toContainText("Historical source version");
  denied = true;
  await panel
    .getByRole("button", { name: "Inspect Personal saved notes", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "Controller access required",
  );
  await expect(
    panel.getByText("edited-snapshot.md", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
