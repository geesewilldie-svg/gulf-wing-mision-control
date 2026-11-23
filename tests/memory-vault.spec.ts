import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  prepareMemoryVault,
  writeMemorySnapshot,
} from "../scripts/memory-vault-lib.mjs";
import { memoryVault } from "../lib/server/memory-vault";
import { saveMemory } from "../lib/server/foundation/store";
import { fixtureRole } from "./helpers/access";

test("vault snapshots preserve notes, reject replaced folders and fence stale previews", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-vault-"));
  const previous = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    const vault = path.join(dir, "vault");
    await fs.mkdir(vault);
    await fs.writeFile(path.join(vault, "Owner.md"), "owner text");
    await fs.writeFile(
      path.join(dir, "local-folders.json"),
      JSON.stringify({
        version: 1,
        roots: [
          { id: "a".repeat(24), label: "test", kind: "obsidian", path: vault },
        ],
      }),
    );
    await expect(
      writeMemorySnapshot(dir, "no grant", "personal"),
    ).rejects.toThrow();
    await prepareMemoryVault(dir, "a".repeat(24));
    const id = saveMemory({
      scope: "Personal",
      kind: "fact",
      content: "original memory",
    });
    const preview = await memoryVault({
      op: "memory.vault.preview",
      scope: "Personal",
    });
    saveMemory({
      id,
      revision: 0,
      scope: "Personal",
      kind: "fact",
      content: "corrected memory",
    });
    await expect(
      memoryVault({
        ...preview,
        scope: "Personal",
        op: "memory.vault.save",
        confirm: true,
      }),
    ).rejects.toThrow("Memory changed");
    const current = await memoryVault({
      op: "memory.vault.preview",
      scope: "Personal",
    });
    const saved = await memoryVault({
      ...current,
      scope: "Personal",
      op: "memory.vault.save",
      confirm: true,
    });
    if (!("bytes" in saved) || !("markdown" in current))
      throw Error("Unexpected response");
    expect(saved.bytes).toBe(Buffer.byteLength(current.markdown));
    const target = path.join(vault, "Nexus Memory Snapshots");
    const batch = (await fs.readdir(target))[0];
    expect(
      await fs.readFile(path.join(target, batch, saved.filename), "utf8"),
    ).toBe(current.markdown);
    expect(await fs.readFile(path.join(vault, "Owner.md"), "utf8")).toBe(
      "owner text",
    );
    await fs.rename(target, target + "-old");
    await fs.symlink(target + "-old", target, "dir");
    await expect(
      writeMemorySnapshot(dir, "blocked", "personal"),
    ).rejects.toThrow();
  } finally {
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("vault review requires controller and same origin", async ({
  request,
}) => {
  const body = { op: "memory.vault.preview", scope: "Personal" };
  expect(
    (await request.post("/api/sync/foundation", { data: body })).status(),
  ).toBe(401);
  await request.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "controller" },
  });
  expect(
    (
      await request.post("/api/sync/foundation", {
        data: body,
        headers: { Origin: "https://other.example" },
      })
    ).status(),
  ).toBe(403);
  const preview = await (
    await request.post("/api/sync/foundation", { data: body })
  ).json();
  expect(preview.markdown).toContain("# Nexus owner memory");
  expect(
    (
      await request.post("/api/sync/foundation", {
        data: { ...preview, scope: "Personal", op: "memory.vault.save" },
      })
    ).status(),
  ).toBe(409);
});

test("desktop and phone review the exact note and cancel without a save", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  let saves = 0;
  page.on("request", (r) => {
    if (r.postData()?.includes("memory.vault.save")) saves++;
  });
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Foundation", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Review Personal snapshot for vault",
      exact: true,
    })
    .click();
  const review = page.getByRole("region", {
    name: "Review vault memory snapshot",
  });
  await expect(review).toContainText("# Nexus owner memory");
  await review.getByRole("button", { name: "Cancel vault snapshot" }).click();
  await expect(review).toHaveCount(0);
  expect(saves).toBe(0);
});
