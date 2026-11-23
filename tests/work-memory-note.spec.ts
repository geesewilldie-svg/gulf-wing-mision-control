import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import {
  createTask,
  withStore,
  deleteTask,
} from "../lib/server/foundation/store";
import { memoryVault } from "../lib/server/memory-vault";
import { prepareMemoryVault } from "../scripts/memory-vault-lib.mjs";
import { fixtureRole } from "./helpers/access";

test("work notes preserve provenance and output, fence changed/deleted tasks and cannot cross workspace", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-work-memory-"));
  const previous = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    const vault = path.join(dir, "vault");
    await fs.mkdir(vault);
    await fs.writeFile(
      path.join(dir, "local-folders.json"),
      JSON.stringify({
        version: 1,
        roots: [
          { id: "b".repeat(24), label: "vault", kind: "obsidian", path: vault },
        ],
      }),
    );
    await prepareMemoryVault(dir, "b".repeat(24));
    const id = createTask({
      scope: "Personal",
      mode: "plan",
      request: "Synthetic checklist",
    });
    const request = {
      op: "memory.vault.preview",
      scope: "Personal",
      taskId: id,
      kind: "work-note",
    };
    await expect(memoryVault(request)).rejects.toThrow("saved task output");
    // A stored artifact fixture; no model or external worker is called.
    const output =
      "# verified?\n<script>not a fact</script>\nProposed checklist";
    withStore((db) =>
      db
        .prepare("UPDATE tasks SET state='completed',output=? WHERE id=?")
        .run(output, id),
    );
    await expect(
      memoryVault({ ...request, scope: "Aviation" }),
    ).rejects.toThrow("no longer available");
    const preview = await memoryVault(request);
    if (!("markdown" in preview)) throw Error("Expected preview");
    expect(preview.markdown).toContain("Task reference: " + id);
    expect(preview.markdown).toContain("Task revision: 0");
    expect(preview.markdown).toContain("not an owner-stated fact");
    expect(preview.markdown).toContain(
      "Generated claims and code remain unverified",
    );
    expect(preview.markdown).toContain(
      "> # verified?\n> &lt;script&gt;not a fact&lt;/script&gt;",
    );
    expect(preview.markdown).toContain(
      createHash("sha256").update(output).digest("hex"),
    );
    const saved = await memoryVault({
      ...preview,
      scope: "Personal",
      op: "memory.vault.save",
      confirm: true,
    });
    if (!("filename" in saved)) throw Error("Expected receipt");
    const target = path.join(vault, "Nexus Memory Snapshots");
    const batch = (await fs.readdir(target))[0];
    expect(
      await fs.readFile(path.join(target, batch, saved.filename), "utf8"),
    ).toBe(preview.markdown);
    withStore((db) =>
      db
        .prepare(
          "UPDATE tasks SET output='changed',revision=revision+1 WHERE id=?",
        )
        .run(id),
    );
    await expect(
      memoryVault({
        ...preview,
        scope: "Personal",
        op: "memory.vault.save",
        confirm: true,
      }),
    ).rejects.toThrow("task changed");
    deleteTask({ id, revision: 1 });
    await expect(
      memoryVault({
        ...preview,
        scope: "Personal",
        op: "memory.vault.save",
        confirm: true,
      }),
    ).rejects.toThrow("no longer available");
    expect((await fs.readdir(target)).length).toBe(1);
  } finally {
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("vault result stays beside its controls on desktop and phone", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  let saves = 0;
  await page.route("**/api/sync/foundation", async (route) => {
    const body = route.request().postDataJSON();
    if (body?.op === "memory.vault.preview")
      return route.fulfill({
        json: {
          markdown: "# Synthetic reviewed note",
          sha256: "a".repeat(64),
          exportedAt: new Date().toISOString(),
          workspace: "Personal",
        },
      });
    if (body?.op === "memory.vault.save") {
      expect(body.confirm).toBe(true);
      expect(body.scope).toBe("Personal");
      expect(body.kind).toBe("owner-memory");
      saves++;
      return route.fulfill({
        json: { filename: "synthetic.md", sha256: "a".repeat(64), bytes: 25 },
      });
    }
    return route.continue();
  });
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Foundation", exact: true }).click();
  const button = page.getByRole("button", {
    name: "Review Personal snapshot for vault",
    exact: true,
  });
  await button.click();
  await page
    .getByRole("button", {
      name: "Confirm and save new vault snapshot",
      exact: true,
    })
    .click();
  const result = page.locator(".vault-note-review").getByRole("status");
  await expect(result).toContainText(
    "Vault snapshot saved and read back: synthetic.md",
  );
  await expect(result).toBeVisible();
  expect(saves).toBe(1);
});

test("task card reviews its own saved artifact without starting a model", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  const taskId = "11111111-1111-4111-8111-111111111111";
  let reviews = 0;
  await page.route("**/api/sync/foundation", async (route) => {
    if (route.request().method() === "GET") {
      const upstream = await route.fetch();
      const data = await upstream.json();
      data.tasks = [
        {
          id: taskId,
          revision: 3,
          request: "Synthetic saved work",
          scope: "Aviation",
          mode: "plan",
          state: "completed",
          reason: "Planning only",
          output: "Synthetic output",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          policyRevision: 0,
        },
      ];
      return route.fulfill({ json: data });
    }
    const body = route.request().postDataJSON();
    expect(body.op).toBe("memory.vault.preview");
    expect(body.taskId).toBe(taskId);
    expect(body.scope).toBe("Aviation");
    expect(body.kind).toBe("work-note");
    reviews++;
    return route.fulfill({
      json: {
        markdown: "# Synthetic work note — unverified",
        sha256: "a".repeat(64),
        exportedAt: new Date().toISOString(),
        workspace: "Aviation",
      },
    });
  });
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Foundation", exact: true }).click();
  const task = page.getByRole("article", {
    name: "Task: Synthetic saved work",
    exact: true,
  });
  await task
    .getByRole("button", {
      name: "Review task work note for vault",
      exact: true,
    })
    .click();
  await expect(
    task.getByRole("region", { name: "Review vault memory snapshot" }),
  ).toContainText("Synthetic work note — unverified");
  expect(reviews).toBe(1);
});
