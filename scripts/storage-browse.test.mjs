import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  addBrowseGrant,
  readBrowseGrants,
  removeBrowseGrant,
} from "./storage-browse-lib.mjs";
async function fixture(run) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "browse-grants-"));
  try {
    const dir = path.join(base, "settings"),
      selected = path.join(base, "selected");
    await fs.mkdir(selected);
    await run(dir, selected, base);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
}
test("add and remove browse grants preserves knowledge selections and source files", () =>
  fixture(async (dir, selected) => {
    await fs.mkdir(dir);
    const knowledge = Buffer.from('{"version":1,"roots":[]}');
    await fs.writeFile(path.join(dir, "local-folders.json"), knowledge);
    await fs.writeFile(path.join(selected, "photo.txt"), "SOURCE");
    assert.deepEqual(await readBrowseGrants(dir), []);
    const grants = await addBrowseGrant(dir, {
      path: selected,
      label: "Pictures",
      type: "folder",
    });
    assert.equal(grants.length, 1);
    assert.match(grants[0].id, /^[a-f0-9]{24}$/);
    assert.ok(grants[0].identity);
    await assert.rejects(
      addBrowseGrant(dir, {
        path: selected,
        label: "Duplicate",
        type: "drive",
      }),
    );
    await removeBrowseGrant(dir, grants[0].id);
    assert.deepEqual(await readBrowseGrants(dir), []);
    assert.deepEqual(
      await fs.readFile(path.join(dir, "local-folders.json")),
      knowledge,
    );
    assert.equal(
      await fs.readFile(path.join(selected, "photo.txt"), "utf8"),
      "SOURCE",
    );
  }));
test("corrupt config, concurrent lock and links fail without overwriting prior files", () =>
  fixture(async (dir, selected, base) => {
    await fs.mkdir(dir);
    const file = path.join(dir, "storage-browse.json");
    await fs.writeFile(file, "BROKEN");
    await assert.rejects(
      addBrowseGrant(dir, { path: selected, label: "Test", type: "folder" }),
    );
    assert.equal(await fs.readFile(file, "utf8"), "BROKEN");
    await fs.rm(file);
    await fs.writeFile(path.join(dir, "storage-browse.lock"), "LOCK");
    await assert.rejects(
      addBrowseGrant(dir, { path: selected, label: "Test", type: "folder" }),
    );
    await fs.rm(path.join(dir, "storage-browse.lock"));
    const link = path.join(base, "link");
    await fs.symlink(selected, link, "dir");
    await assert.rejects(
      addBrowseGrant(dir, { path: link, label: "Link", type: "folder" }),
    );
  }));
test("bounded settings reject duplicate IDs, hidden control text and oversized files", () =>
  fixture(async (dir, selected) => {
    const [grant] = await addBrowseGrant(dir, {
      path: selected,
      label: "Test",
      type: "folder",
    });
    const file = path.join(dir, "storage-browse.json");
    for (const grants of [
      [grant, grant],
      [{ ...grant, label: "bad\nlabel" }],
      [{ ...grant, path: "relative" }],
      Array(13).fill(grant),
    ]) {
      await fs.writeFile(file, JSON.stringify({ version: 1, grants }));
      await assert.rejects(readBrowseGrants(dir));
    }
    await fs.writeFile(file, "x".repeat(30001));
    await assert.rejects(readBrowseGrants(dir));
  }));
