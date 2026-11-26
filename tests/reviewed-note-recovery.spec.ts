import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { prepareMemoryVault } from "../scripts/memory-vault-lib.mjs";
import { memoryVault } from "../lib/server/memory-vault";
import { recoverReviewedNote } from "../lib/server/reviewed-note-recovery";
import { refreshFiles } from "../lib/server/local-files";
import { saveMemory } from "../lib/server/foundation/store";
import { POST } from "../app/api/sync/foundation/route";
import { token } from "../lib/server/sync-store";
import { fixtureRole } from "./helpers/access";
async function fixture(
  run: (dir: string, vault: string, config: any) => Promise<void>,
) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "reviewed-recovery-")),
    prior = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  const config = {
    version: 1,
    pairingHash: "a".repeat(64),
    signingSecret: "b".repeat(64),
  };
  try {
    const vault = path.join(dir, "vault");
    await fs.mkdir(vault);
    await fs.writeFile(
      path.join(dir, "sync-config.json"),
      JSON.stringify(config),
    );
    await fs.writeFile(
      path.join(dir, "local-folders.json"),
      JSON.stringify({
        version: 1,
        roots: [
          { id: "a".repeat(24), label: "Vault", kind: "obsidian", path: vault },
        ],
      }),
    );
    await prepareMemoryVault(dir, "a".repeat(24));
    await refreshFiles();
    await fs.writeFile(path.join(dir, "note-versions.lock"), "held");
    await run(dir, vault, config);
  } finally {
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    await fs.rm(dir, { recursive: true, force: true });
  }
}
async function save() {
  const preview = await memoryVault({
    op: "memory.vault.preview",
    scope: "Personal",
  });
  if (!("markdown" in preview)) throw Error("Expected preview");
  const saved = await memoryVault({
    ...preview,
    op: "memory.vault.save",
    scope: "Personal",
    confirm: true,
  });
  if (!("recoveryToken" in saved) || !saved.recoveryToken)
    throw Error("Expected confirmed recovery proof");
  return { ...saved, recoveryToken: saved.recoveryToken };
}

test("reviewed metadata recovery is idempotent, uses original source identity and does not rewrite the saved note", () =>
  fixture(async (dir, vault) => {
    const id = saveMemory({
      scope: "Personal",
      kind: "fact",
      content: "Original owner record",
    });
    const saved = await save();
    expect(saved.tracking).toBe("pending");
    const file = path.join(vault, ...saved.file.name.split("/")),
      before = await fs.readFile(file),
      stat = await fs.stat(file);
    saveMemory({
      id,
      revision: 0,
      scope: "Personal",
      kind: "fact",
      content: "Corrected owner record",
    });
    await fs.rm(path.join(dir, "note-versions.lock"));
    const input = { op: "memory.vault.recover", token: saved.recoveryToken };
    expect(await recoverReviewedNote(input)).toMatchObject({
      state: "saved",
      tracking: "tracked",
      indexing: "indexed",
    });
    expect(await recoverReviewedNote(input)).toMatchObject({
      tracking: "tracked",
      indexing: "indexed",
    });
    expect(await fs.readFile(file)).toEqual(before);
    expect((await fs.stat(file)).mtimeMs).toBe(stat.mtimeMs);
    const catalog = JSON.parse(
      await fs.readFile(path.join(dir, "note-versions.json"), "utf8"),
    );
    expect(catalog.entries).toHaveLength(1);
    const { inspectNoteVersions } = await import("../lib/server/note-versions");
    expect(
      (
        await inspectNoteVersions({
          op: "memory.notes.inspect",
          scope: "Personal",
        })
      ).rows[0].sourceState,
    ).toBe("historical-version");
    expect(
      await fs.readdir(path.join(vault, "Nexus Memory Snapshots")),
    ).toHaveLength(1);
  }));

test("tampered, expired, edited and revoked-root recovery proofs cannot modify or republish a note", () =>
  fixture(async (dir, vault) => {
    const saved = await save(),
      input = { op: "memory.vault.recover", token: saved.recoveryToken };
    const parts = saved.recoveryToken.split(".");
    parts[1] = (parts[1][0] === "a" ? "b" : "a") + parts[1].slice(1);
    await expect(
      recoverReviewedNote({ ...input, token: parts.join(".") }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      recoverReviewedNote({ ...input, path: "elsewhere" }),
    ).rejects.toMatchObject({ status: 400 });
    const now = Date.now;
    Date.now = () => now() + 31 * 60 * 1000;
    try {
      await expect(recoverReviewedNote(input)).rejects.toMatchObject({
        status: 409,
      });
    } finally {
      Date.now = now;
    }
    const file = path.join(vault, ...saved.file.name.split("/"));
    await fs.writeFile(file, "Owner edits preserved");
    await expect(recoverReviewedNote(input)).rejects.toMatchObject({
      status: 409,
    });
    expect(await fs.readFile(file, "utf8")).toBe("Owner edits preserved");
    await fs.writeFile(
      path.join(dir, "local-folders.json"),
      JSON.stringify({ version: 1, roots: [] }),
    );
    await expect(recoverReviewedNote(input)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      fs.stat(path.join(dir, "note-versions.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  }));

test("reviewed recovery retains controller and same-origin authorization", () =>
  fixture(async (_dir, _vault, config) => {
    const saved = await save();
    const send = (role: string | null, origin = "http://localhost:3000") =>
      POST(
        new Request("http://localhost:3000/api/sync/foundation", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin,
            "content-type": "application/json",
            ...(role
              ? { cookie: "gw_sync_session=" + token(config, role as any) }
              : {}),
          },
          body: JSON.stringify({
            op: "memory.vault.recover",
            token: saved.recoveryToken,
          }),
        }),
      );
    expect((await send(null)).status).toBe(401);
    expect((await send("display")).status).toBe(403);
    expect((await send("controller", "https://foreign.test")).status).toBe(403);
    expect((await send("controller")).status).toBe(200);
  }));

test("desktop and phone retry only metadata after a confirmed reviewed save", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  const operations: string[] = [];
  await page.route("**/api/sync/foundation", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON();
    if (
      ![
        "memory.vault.preview",
        "memory.vault.save",
        "memory.vault.recover",
      ].includes(body.op)
    )
      return route.continue();
    operations.push(body.op);
    return route.fulfill({
      json:
        body.op === "memory.vault.preview"
          ? {
              markdown: "# Reviewed current snapshot",
              workspace: "Personal",
              sha256: "a".repeat(64),
              exportedAt: new Date().toISOString(),
            }
          : body.op === "memory.vault.save"
            ? {
                filename: "saved.md",
                tracking: "pending",
                indexing: "indexed",
                recoveryToken: "synthetic-token",
              }
            : {
                tracking: "tracked",
                indexing: "indexed",
                notice: "Metadata retry only; note unchanged.",
              },
    });
  });
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Foundation", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Review Personal snapshot for vault",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Confirm and save new vault snapshot",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Retry saved-note metadata only",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(
      "Metadata retry only; note unchanged. Version tracking: tracked. Indexing: indexed.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(operations).toEqual([
    "memory.vault.preview",
    "memory.vault.save",
    "memory.vault.recover",
  ]);
  await expect(
    page.getByRole("button", { name: "Retry saved-note metadata only" }),
  ).toHaveCount(0);
});
