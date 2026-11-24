import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  addBrowseGrant,
  removeBrowseGrant,
} from "../scripts/storage-browse-lib.mjs";
import {
  browseSelectedFolders,
  readBrowsedOriginal,
} from "../lib/server/folder-browser";
import { refreshFiles, fileRoots } from "../lib/server/local-files";
import { fixtureRole } from "./helpers/access";
import type { BrowserRoots, FolderPage } from "../lib/folder-browser";
async function fixture(run: (dir: string, selected: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "storage-browse-"));
  const previous = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    const selected = path.join(dir, "drive");
    await fs.mkdir(selected);
    await fs.writeFile(
      path.join(dir, "sync-config.json"),
      JSON.stringify({
        version: 1,
        pairingHash: "a".repeat(64),
        signingSecret: "b".repeat(64),
      }),
    );
    await run(dir, selected);
  } finally {
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
}
const home = () =>
  browseSelectedFolders({ action: "roots" }) as Promise<BrowserRoots>;
const list = (handle: string) =>
  browseSelectedFolders({ action: "list", handle }) as Promise<FolderPage>;
test("browse-only drive files can open without becoming indexed; removal invalidates signed references", () =>
  fixture(async (dir, selected) => {
    await fs.writeFile(
      path.join(selected, "document.txt"),
      "BROWSE_ONLY_CONTENT",
    );
    await fs.mkdir(path.join(selected, "Windows"));
    await fs.writeFile(path.join(selected, "storage-browse.json"), "PRIVATE");
    const [grant] = await addBrowseGrant(dir, {
      path: selected,
      label: "Test drive",
      type: "drive",
    });
    expect(await fileRoots()).toEqual([]);
    const roots = await home();
    expect(roots.roots[0]).toMatchObject({
      browseOnly: true,
      storageType: "drive",
      available: true,
    });
    expect(JSON.stringify(roots)).not.toContain(dir);
    const page = await list(roots.roots[0].handle!);
    expect(page.entries.map((e) => e.name)).toEqual(["document.txt"]);
    const original = page.entries[0].original!.handle;
    expect((await readBrowsedOriginal(original, false)).data.toString()).toBe(
      "BROWSE_ONLY_CONTENT",
    );
    const indexed = await refreshFiles();
    expect(indexed.files).toHaveLength(0);
    expect(indexed.status.roots).toEqual([]);
    await removeBrowseGrant(dir, grant.id);
    await expect(list(roots.roots[0].handle!)).rejects.toMatchObject({
      status: 409,
    });
    await expect(readBrowsedOriginal(original, false)).rejects.toMatchObject({
      status: 409,
    });
    expect(await fs.readFile(path.join(selected, "document.txt"), "utf8")).toBe(
      "BROWSE_ONLY_CONTENT",
    );
  }));
test("overlapping browse grants preserve knowledge previews and survive removal through their independent knowledge selection", () =>
  fixture(async (dir, selected) => {
    await fs.writeFile(path.join(selected, "note.md"), "# Knowledge note");
    const knowledgeRoot = {
      id: "d".repeat(24),
      label: "Knowledge fixture",
      kind: "obsidian",
      path: selected,
    };
    await fs.writeFile(
      path.join(dir, "local-folders.json"),
      JSON.stringify({ version: 1, roots: [knowledgeRoot] }),
    );
    await refreshFiles();
    const [grant] = await addBrowseGrant(dir, {
      path: selected,
      label: "Separate browse access",
      type: "folder",
    });
    const roots = await home();
    expect(roots.roots).toHaveLength(2);
    const knowledge = roots.roots.find((root) => !root.browseOnly)!;
    const page = await list(knowledge.handle!);
    expect(page.entries[0].indexed?.sections).toBeGreaterThan(0);
    await removeBrowseGrant(dir, grant.id);
    expect(await fileRoots()).toEqual([knowledgeRoot]);
    const remaining = await home();
    expect(remaining.roots).toHaveLength(1);
    expect(
      (await list(remaining.roots[0].handle!)).entries[0].indexed,
    ).toBeTruthy();
  }));

test("replaced storage root stays unavailable until selected again, and broken grants fail closed", () =>
  fixture(async (dir, selected) => {
    await addBrowseGrant(dir, {
      path: selected,
      label: "Drive",
      type: "drive",
    });
    await fs.rename(selected, selected + "-old");
    await fs.mkdir(selected);
    expect((await home()).roots[0].available).toBe(false);
    await fs.writeFile(path.join(dir, "storage-browse.json"), "BROKEN");
    await expect(home()).rejects.toMatchObject({ status: 503 });
  }));
test("paired desktop and phone can browse a granted location without a knowledge index", async ({
  page,
  context,
}) => {
  const dir = process.env.GW_SYNC_TEST_ROOT!,
    file = path.join(dir, "storage-browse.json");
  const saved = await fs.readFile(file).catch(() => null);
  const selected = await fs.mkdtemp(path.join(os.tmpdir(), "browse-ui-"));
  try {
    await fs.writeFile(file, JSON.stringify({ version: 1, grants: [] }));
    await fs.writeFile(
      path.join(selected, "document.txt"),
      "UNINDEXED_STORAGE_DOCUMENT",
    );
    await addBrowseGrant(dir, {
      path: selected,
      label: "Browse-only fixture",
      type: "drive",
    });
    await fixtureRole(context);
    await page.goto("/nexus");
    await page.getByRole("button", { name: "Memory", exact: true }).click();
    await page.getByText("Explore selected folders", { exact: true }).click();
    await expect(
      page.getByText("Drive · browse-only; not indexed automatically", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Open selected folder Browse-only fixture",
        exact: true,
      })
      .click();
    await expect(page.getByText("document.txt", { exact: true })).toBeVisible();
    const popupPromise = page.waitForEvent("popup");
    await page
      .getByRole("link", { name: "Open original document", exact: true })
      .click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    await expect(popup.locator("body")).toContainText(
      "UNINDEXED_STORAGE_DOCUMENT",
    );
    await popup.close();
  } finally {
    if (saved) await fs.writeFile(file, saved);
    else await fs.rm(file, { force: true });
    await fs.rm(selected, { recursive: true, force: true });
  }
});
