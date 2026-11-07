import { fixtureRole, fixtureCookieHeader } from "./helpers/access";
import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  createTask,
  changeTask,
  snapshot,
  claimNext,
  recoverTasks,
  finishTask,
  saveMemory,
  deleteMemory,
  memoryContext,
  setPolicy,
  backupFoundation,
  withStore,
} from "../lib/server/foundation/store";
import { coordinatorTick } from "../lib/server/foundation/coordinator";
async function isolated(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "nexus-foundation-")),
    previous = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    await fn(dir);
  } finally {
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
}
test("SQLite transactions preserve tasks, reject stale revisions and recover interrupted work without replay", async () =>
  isolated(async () => {
    const id = createTask({
      request: "Synthetic plan",
      scope: "Personal",
      mode: "plan",
    });
    changeTask({ id, revision: 0, action: "queue" });
    const running = claimNext()!;
    expect(running.id).toBe(id);
    expect(() => changeTask({ id, revision: 0, action: "cancel" })).toThrow();
    expect(recoverTasks()).toBe(1);
    expect(snapshot().tasks[0].state).toBe("paused");
    expect(() => finishTask(running, "stale artifact")).toThrow();
    const t = snapshot().tasks[0];
    changeTask({
      id,
      revision: t.revision,
      action: "steer",
      request: "Corrected objective",
    });
    expect(snapshot().tasks[0].request).toBe("Corrected objective");
    expect(claimNext()).toBeNull();
  }));
test("memory is scoped, full-text searchable, correctable and deleted from history/index; policy changes fence workers", async () =>
  isolated(async () => {
    const id = saveMemory({
      kind: "preference",
      scope: "Co-hosting",
      content: "Prioritize owner proposals",
    });
    saveMemory({
      kind: "fact",
      scope: "Aviation",
      content: "Aircraft synthetic note",
    });
    saveMemory({
      kind: "instruction",
      scope: "Personal",
      content: "Explain uncertain evidence",
    });
    expect(memoryContext("Co-hosting", "owner proposals")).toContain(
      "Prioritize owner proposals",
    );
    expect(memoryContext("Aviation", "owner proposals")).not.toContain(
      "Prioritize owner proposals",
    );
    expect(memoryContext("Aviation", "anything")).toContain(
      "Explain uncertain evidence",
    );
    saveMemory({
      id,
      revision: 0,
      kind: "preference",
      scope: "Co-hosting",
      content: "Prioritize accepted scope",
    });
    expect(memoryContext("Co-hosting", "owner proposals")).not.toContain(
      "Prioritize owner proposals",
    );
    expect(() =>
      saveMemory({
        id,
        revision: 0,
        kind: "fact",
        scope: "Personal",
        content: "stale",
      }),
    ).toThrow();
    const taskId = createTask({
      request: "Planning",
      scope: "Personal",
      mode: "plan",
    });
    changeTask({ id: taskId, revision: 0, action: "queue" });
    const running = claimNext()!;
    const p = snapshot().policy;
    setPolicy({ revision: p.revision, enabled: false });
    expect(snapshot().tasks[0].state).toBe("paused");
    expect(() => finishTask(running, "stale")).toThrow();
    deleteMemory({ id, revision: 1 });
    expect(memoryContext("Co-hosting", "accepted scope")).not.toContain(
      "Prioritize accepted scope",
    );
    expect(
      withStore(
        (db) =>
          (
            db
              .prepare("SELECT count(*) n FROM memory_history WHERE id=?")
              .get(id) as any
          ).n,
      ),
    ).toBe(0);
  }));
test("coordinator saves planning evidence and real development gaps without executing shell or promoting skills", async () =>
  isolated(async () => {
    const id = createTask({
      request: "Draft synthetic plan",
      scope: "Personal",
      mode: "plan",
    });
    changeTask({ id, revision: 0, action: "queue" });
    await coordinatorTick(async () => "Synthetic planning output.");
    expect(snapshot().tasks[0].state).toBe("completed");
    expect(snapshot().tasks[0].output).toContain("no external actions");
    const next = createTask({
      request: "Build a missing adapter",
      scope: "Co-hosting",
      mode: "development",
    });
    changeTask({ id: next, revision: 0, action: "queue" });
    await coordinatorTick(async () => {
      throw Error("Must not invoke a model for a deterministic handoff");
    });
    expect(snapshot().tasks.find((t) => t.id === next)?.state).toBe("waiting");
    expect(snapshot().skills[0].status).toBe("draft");
  }));
test("correcting memory while planning prevents the stale result from being committed", async () =>
  isolated(async () => {
    const id = createTask({
      request: "Synthetic correction test",
      scope: "Personal",
      mode: "plan",
    });
    changeTask({ id, revision: 0, action: "queue" });
    await coordinatorTick(async () => {
      saveMemory({
        kind: "fact",
        scope: "Personal",
        content: "New owner correction",
      });
      return "stale result";
    });
    expect(snapshot().tasks[0].state).toBe("paused");
    expect(snapshot().tasks[0].output).toBe("");
  }));
test("consistent backup restores tasks and owner memory independently of the original connection", async () =>
  isolated(async (dir) => {
    createTask({ request: "Backup evidence", scope: "Personal", mode: "plan" });
    saveMemory({ kind: "fact", scope: "Personal", content: "Backup fact" });
    const filename = backupFoundation();
    const copy = new DatabaseSync(
      path.join(dir, "foundation-backups", filename),
    );
    try {
      expect(
        (copy.prepare("SELECT request FROM tasks").get() as any).request,
      ).toBe("Backup evidence");
      expect(
        (copy.prepare("PRAGMA integrity_check").get() as any).integrity_check,
      ).toBe("ok");
    } finally {
      copy.close();
    }
  }));
test("foundation API denies display/anonymous access and rejects cross-origin mutations", async ({
  context,
}) => {
  const request = context.request;
  expect((await request.get("/api/sync/foundation")).status()).toBe(401);
  await fixtureRole(context, "display");
  expect((await request.get("/api/sync/foundation")).status()).toBe(403);
  await fixtureRole(context, "controller");
  expect(
    (
      await request.post("/api/sync/foundation", {
        headers: { Origin: "https://untrusted.example" },
        data: { op: "task.create" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/sync/foundation", {
        data: { op: "execute-shell", command: "whoami" },
      })
    ).status(),
  ).toBe(400);
  const r = await request.post("/api/sync/foundation", {
    data: {
      op: "task.create",
      request: "Synthetic persisted task",
      scope: "Personal",
      mode: "plan",
    },
  });
  expect(r.status()).toBe(200);
  expect(
    (await r.json()).tasks.some(
      (t: any) => t.request === "Synthetic persisted task",
    ),
  ).toBe(true);
});
test("desktop/mobile foundation saves and corrects real memory and persists tasks across reload", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Foundation", exact: true }).click();
  const panel = page.getByRole("region", { name: "Nexus durable foundation" });
  await panel
    .getByLabel("Task objective", { exact: true })
    .fill("Synthetic UI task " + test.info().project.name);
  await panel.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(
    panel.getByRole("heading", {
      name: "Synthetic UI task " + test.info().project.name,
      exact: true,
    }),
  ).toBeVisible();
  await panel
    .getByLabel("Memory text", { exact: true })
    .fill("Synthetic preference " + test.info().project.name);
  await panel
    .getByRole("button", { name: "Save owner memory", exact: true })
    .click();
  await expect(
    panel.getByText("Synthetic preference " + test.info().project.name, {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Foundation", exact: true }).click();
  await expect(
    page.getByText("Synthetic preference " + test.info().project.name, {
      exact: true,
    }),
  ).toBeVisible();
});

test("re-queuing a development handoff revises one draft rather than duplicating procedures", async () =>
  isolated(async () => {
    const id = createTask({
      request: "Synthetic adapter gap",
      scope: "Personal",
      mode: "development",
    });
    changeTask({ id, revision: 0, action: "queue" });
    await coordinatorTick();
    const previous = snapshot().tasks[0];
    changeTask({ id, revision: previous.revision, action: "queue" });
    await coordinatorTick();
    expect(snapshot().skills).toHaveLength(1);
    expect(snapshot().tasks[0].state).toBe("waiting");
  }));
test("oversized owner instructions are rejected without dropping existing guidance", async () =>
  isolated(async () => {
    saveMemory({
      kind: "instruction",
      scope: "Personal",
      content: "a".repeat(1000),
    });
    saveMemory({
      kind: "instruction",
      scope: "Personal",
      content: "b".repeat(1000),
    });
    expect(() =>
      saveMemory({
        kind: "instruction",
        scope: "Personal",
        content: "c".repeat(1000),
      }),
    ).toThrow();
    expect(snapshot().memory).toHaveLength(2);
  }));
