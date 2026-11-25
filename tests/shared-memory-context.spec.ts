import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { sharedMemoryContext } from "../lib/server/shared-memory-context";
import {
  saveMemory,
  deleteMemory,
  createTask,
  withStore,
} from "../lib/server/foundation/store";
async function fixture(run: () => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "shared-memory-"));
  const prior = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    await run();
  } finally {
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("shared memory envelope preserves provenance and scope, refreshes corrections, and excludes private context externally", () =>
  fixture(async () => {
    saveMemory({
      scope: "Personal",
      kind: "fact",
      content: "QUARTZ Android phone",
    });
    saveMemory({
      scope: "Aviation",
      kind: "fact",
      content: "QUARTZ OTHER_SCOPE_SECRET",
    });
    const id = createTask({
      scope: "Personal",
      mode: "plan",
      request: "QUARTZ work",
    });
    withStore((db) =>
      db
        .prepare(
          "UPDATE tasks SET state='completed',output='QUARTZ_UNVERIFIED_WORK' WHERE id=?",
        )
        .run(id),
    );
    const first = sharedMemoryContext("Personal", "QUARTZ", "local");
    expect(first.version).toBe(1);
    expect(first.owner.records[0]).toMatchObject({
      provenance: "owner-stated",
      localOnly: true,
      revision: 0,
    });
    expect(first.owner.records[0].hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.work.records).toHaveLength(1);
    expect(first.work.context).toContain("not owner facts");
    expect(JSON.stringify(first)).not.toContain("OTHER_SCOPE_SECRET");
    const owner = first.owner.records[0];
    saveMemory({
      id: owner.id,
      revision: owner.revision,
      scope: "Personal",
      kind: "fact",
      content: "QUARTZ corrected phone",
    });
    const changed = sharedMemoryContext("Personal", "QUARTZ", "local");
    expect(changed.ownerRevision).not.toBe(first.ownerRevision);
    expect(changed.owner.records[0].revision).toBe(1);
    expect(changed.owner.records[0].hash).not.toBe(owner.hash);
    const external = sharedMemoryContext("Personal", "QUARTZ", "external");
    expect(external.owner.context).toBe("");
    expect(external.work.context).toBe("");
    expect(external.ownerRevision).toBeNull();
    expect(JSON.stringify(external)).not.toContain("QUARTZ_UNVERIFIED_WORK");
    deleteMemory({ id: owner.id, revision: 1 });
    expect(
      sharedMemoryContext("Personal", "QUARTZ", "local").owner.records,
    ).toEqual([]);
    expect(() => sharedMemoryContext("unknown", "QUARTZ", "local")).toThrow();
  }));
test("owner instructions are bounded and explicit truncation is retained without turning work into facts", () =>
  fixture(async () => {
    for (let i = 0; i < 3; i++)
      saveMemory({
        scope: "Personal",
        kind: "instruction",
        content: "Q".repeat(800),
      });
    for (let i = 0; i < 7; i++)
      saveMemory({
        scope: "Personal",
        kind: "fact",
        content: "QUARTZ " + "X".repeat(993),
      });
    const result = sharedMemoryContext("Personal", "QUARTZ", "local");
    expect(JSON.parse(result.owner.context).ownerInstructions).toHaveLength(3);
    expect(
      result.owner.records
        .filter((row) => row.kind === "instruction")
        .every((row) => row.content.length === 800 && !row.excerptOnly),
    ).toBe(true);
    expect(result.owner.truncated).toBe(true);
    expect(
      result.owner.records.reduce((sum, row) => sum + row.content.length, 0),
    ).toBeLessThanOrEqual(8000);
    expect(result.owner.records.length).toBeLessThanOrEqual(500);
    expect(result.work.records).toEqual([]);
  }));
