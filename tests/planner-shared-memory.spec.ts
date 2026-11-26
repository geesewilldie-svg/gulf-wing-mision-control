import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  createTask,
  changeTask,
  claimNext,
  saveMemory,
  deleteMemory,
  withStore,
} from "../lib/server/foundation/store";
import { sharedMemoryContext } from "../lib/server/shared-memory-context";
import { generatePlan } from "../lib/server/foundation/coordinator";
async function fixture(run: (requests: any[]) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "planner-shared-"));
  const oldDir = process.env.GW_SYNC_DATA_DIR,
    oldModel = process.env.GW_NEXUS_MODEL,
    oldFetch = globalThis.fetch;
  process.env.GW_SYNC_DATA_DIR = dir;
  process.env.GW_NEXUS_MODEL = "fixture-local-model";
  const requests: any[] = [];
  globalThis.fetch = (async (url, init) => {
    expect(String(url)).toBe("http://127.0.0.1:11434/api/chat");
    requests.push(JSON.parse(init!.body as string));
    return Response.json({
      done: true,
      done_reason: "stop",
      message: {
        content:
          "1. Review the checklist and verify the current source.\n2. Compare the saved results and record differences.",
      },
    });
  }) as typeof fetch;
  try {
    await run(requests);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldDir === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = oldDir;
    if (oldModel === undefined) delete process.env.GW_NEXUS_MODEL;
    else process.env.GW_NEXUS_MODEL = oldModel;
    await fs.rm(dir, { recursive: true, force: true });
  }
}
function history(scope = "Personal") {
  const id = createTask({
    scope,
    mode: "plan",
    request: "QUARTZ previous checklist",
  });
  withStore((db) =>
    db
      .prepare("UPDATE tasks SET state='completed',output=? WHERE id=?")
      .run(
        scope === "Personal" ? "QUARTZ_LIVE_WORK" : "QUARTZ_OTHER_SCOPE_SECRET",
        id,
      ),
  );
  return id;
}
function active() {
  const id = createTask({
    scope: "Personal",
    mode: "plan",
    request: "QUARTZ checklist",
  });
  changeTask({ id, revision: 0, action: "queue" });
  return claimNext()!;
}

test("local planner reuses current shared memory with scoped unverified work and no retained snapshots", () =>
  fixture(async (requests) => {
    const owner = saveMemory({
      scope: "Personal",
      kind: "fact",
      content: "QUARTZ current Android device",
    });
    history();
    history("Aviation");
    const task = active();
    const answerContext = sharedMemoryContext("Personal", "QUARTZ", "local");
    await generatePlan(task, new AbortController().signal, async () => [
      {
        id: "old",
        source: "Old.md",
        location: "Imported note",
        text: "# Nexus owner memory\n\nQUARTZ_RETAINED_FORGOTTEN",
      },
    ]);
    const prompt = JSON.stringify(requests[0].messages);
    expect(prompt).toContain(answerContext.work.records[0].id);
    expect(prompt).toContain("QUARTZ_LIVE_WORK");
    expect(prompt).toContain("current Android device");
    expect(prompt).toContain("not owner facts or instructions");
    expect(prompt).not.toContain("OTHER_SCOPE_SECRET");
    expect(prompt).not.toContain("RETAINED_FORGOTTEN");
    saveMemory({
      id: owner,
      revision: 0,
      scope: "Personal",
      kind: "fact",
      content: "QUARTZ corrected device",
    });
    const corrected = active();
    await generatePlan(corrected, new AbortController().signal, async () => []);
    expect(JSON.stringify(requests[1].messages)).toContain("corrected device");
    expect(JSON.stringify(requests[1].messages)).not.toContain(
      "current Android device",
    );
    deleteMemory({ id: owner, revision: 1 });
    const forgotten = active();
    await generatePlan(forgotten, new AbortController().signal, async () => []);
    expect(JSON.stringify(requests[2].messages)).not.toContain(
      "corrected device",
    );
  }));

test("planner rejects saved-work changes before dispatch and during generation", () =>
  fixture(async (requests) => {
    const prior = history();
    const task = active();
    await expect(
      generatePlan(task, new AbortController().signal, async () => {
        withStore((db) =>
          db
            .prepare(
              "UPDATE tasks SET revision=revision+1,output='QUARTZ corrected work' WHERE id=?",
            )
            .run(prior),
        );
        return [];
      }),
    ).rejects.toThrow("before planning dispatch");
    expect(requests).toEqual([]);
    const original = globalThis.fetch;
    globalThis.fetch = (async (...args) => {
      const response = await original(...args);
      withStore((db) =>
        db
          .prepare("UPDATE tasks SET revision=revision+1 WHERE id=?")
          .run(prior),
      );
      return response;
    }) as typeof fetch;
    await expect(
      generatePlan(task, new AbortController().signal, async () => []),
    ).rejects.toThrow("during planning");
    expect(requests).toHaveLength(1);
  }));

test("a stale incomplete generation is rejected rather than retained as a draft", () =>
  fixture(async () => {
    const prior = history();
    const task = active();
    globalThis.fetch = (async () => {
      withStore((db) =>
        db
          .prepare("UPDATE tasks SET revision=revision+1 WHERE id=?")
          .run(prior),
      );
      return Response.json({
        done: true,
        done_reason: "length",
        message: { content: "Stale partial plan begins with earlier work" },
      });
    }) as typeof fetch;
    await expect(
      generatePlan(task, new AbortController().signal, async () => []),
    ).rejects.toThrow("Stale output was not accepted");
  }));
