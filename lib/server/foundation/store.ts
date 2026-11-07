import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { SyncError } from "../sync-store";
import {
  text,
  scope,
  type NexusTask,
  type MemoryRecord,
  type FoundationSnapshot,
  type TaskState,
} from "../../foundation/contracts";
export function withStore<T>(fn: (db: DatabaseSync) => T): T {
  const root = path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
  );
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const target = path.join(root, "nexus-foundation.sqlite");
  const db = new DatabaseSync(target);
  try {
    if (process.platform !== "win32") chmodSync(target, 0o600);
    db.exec(
      "PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;",
    );
    const version = Number(
      (db.prepare("PRAGMA user_version").get() as any).user_version,
    );
    if (version > 2)
      throw new SyncError(
        503,
        "Foundation database is newer than this application. No downgrade was attempted.",
      );
    if (version === 0)
      db.exec(`BEGIN IMMEDIATE;
 CREATE TABLE policy(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,planning_enabled INTEGER NOT NULL);INSERT INTO policy VALUES(1,0,1);
 CREATE TABLE tasks(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,request TEXT NOT NULL,scope TEXT NOT NULL,mode TEXT NOT NULL,state TEXT NOT NULL,reason TEXT NOT NULL,output TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,policy_revision INTEGER NOT NULL);
 CREATE TABLE memory(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,kind TEXT NOT NULL,scope TEXT NOT NULL,content TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE VIRTUAL TABLE memory_search USING fts5(id UNINDEXED,content);
 CREATE TABLE memory_history(id TEXT NOT NULL,revision INTEGER NOT NULL,content TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(id,revision));
 CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,task_id TEXT,type TEXT NOT NULL,at TEXT NOT NULL,detail TEXT NOT NULL);
 CREATE TABLE skills(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,description TEXT NOT NULL,status TEXT NOT NULL CHECK(status='draft'));
 PRAGMA user_version=1;COMMIT;`);
    if (version < 2) {
      if (version === 1) {
        const dir = path.join(root, "foundation-backups");
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        const backup = path.join(
          dir,
          "before-schema-2-" + Date.now() + "-" + randomUUID() + ".sqlite",
        );
        db.prepare("VACUUM INTO ?").run(backup);
        if (process.platform !== "win32") chmodSync(backup, 0o600);
      }
      db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE worker_grants(task_id TEXT PRIMARY KEY,task_revision INTEGER NOT NULL,expires INTEGER NOT NULL,consumed INTEGER NOT NULL);
      CREATE TABLE worker_runs(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,task_revision INTEGER NOT NULL,state TEXT NOT NULL,progress INTEGER NOT NULL,started_at TEXT NOT NULL,updated_at TEXT NOT NULL,detail TEXT NOT NULL,pid INTEGER);
      PRAGMA user_version=2;COMMIT;`);
    }
    return fn(db);
  } finally {
    db.close();
  }
}
function transaction<T>(db: DatabaseSync, fn: () => T) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const v = fn();
    db.exec("COMMIT");
    return v;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
function event(
  db: DatabaseSync,
  taskId: string | null,
  type: string,
  detail: string,
) {
  db.prepare("INSERT INTO events(task_id,type,at,detail) VALUES(?,?,?,?)").run(
    taskId,
    type,
    new Date().toISOString(),
    detail,
  );
}
const task = (r: any): NexusTask => ({
  id: r.id,
  revision: r.revision,
  request: r.request,
  scope: r.scope,
  mode: r.mode,
  state: r.state,
  reason: r.reason,
  output: r.output,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  policyRevision: r.policy_revision,
});
export function snapshot(): FoundationSnapshot {
  return withStore((db) => ({
    schemaVersion: 1,
    workerRuns: db
      .prepare(
        "SELECT id,task_id AS taskId,task_revision AS taskRevision,state,progress,started_at AS startedAt,updated_at AS updatedAt,detail,pid FROM worker_runs ORDER BY started_at DESC LIMIT 50",
      )
      .all() as any,
    tasks: db
      .prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 200")
      .all()
      .map(task),
    memory: db
      .prepare("SELECT * FROM memory ORDER BY updated_at DESC LIMIT 500")
      .all()
      .map((r: any) => ({
        id: r.id,
        revision: r.revision,
        kind: r.kind,
        scope: r.scope,
        content: r.content,
        updatedAt: r.updated_at,
        source: "owner" as const,
        localOnly: true as const,
      })),
    policy: policy(db),
    events: db
      .prepare(
        "SELECT id,task_id AS taskId,type,at,detail FROM events ORDER BY id DESC LIMIT 100",
      )
      .all() as any,
    skills: db
      .prepare(
        "SELECT id,task_id AS taskId,description,status FROM skills ORDER BY rowid DESC LIMIT 100",
      )
      .all() as any,
  }));
}
function policy(db: DatabaseSync) {
  const p = db.prepare("SELECT * FROM policy WHERE id=1").get() as any;
  return {
    revision: p.revision as number,
    planningEnabled: !!p.planning_enabled,
  };
}
export function createTask(input: any) {
  const request = text(input.request, 2000),
    workspace = scope(input.scope);
  if (!["plan", "development"].includes(input.mode))
    throw new SyncError(400, "Choose planning or a development handoff.");
  return withStore((db) =>
    transaction(db, () => {
      if (
        Number((db.prepare("SELECT count(*) n FROM tasks").get() as any).n) >=
        1000
      )
        throw new SyncError(
          409,
          "Task storage limit reached. Export/archive tasks before adding more.",
        );
      const id = randomUUID(),
        now = new Date().toISOString();
      db.prepare(
        "INSERT INTO tasks VALUES(?,0,?,?,?,'accepted','Ready to queue','',?,?,?)",
      ).run(id, request, workspace, input.mode, now, now, policy(db).revision);
      event(
        db,
        id,
        "task.accepted",
        input.mode === "plan"
          ? "Planning only; no external execution authorized."
          : "Development handoff requested; no live worker authorized.",
      );
      return id;
    }),
  );
}
function current(db: DatabaseSync, id: string, revision: number) {
  const raw = db.prepare("SELECT * FROM tasks WHERE id=?").get(id);
  if (!raw) throw new SyncError(404, "Task not found.");
  const t = task(raw);
  if (t.revision !== revision)
    throw new SyncError(
      409,
      "Task changed. Refresh before applying your correction.",
    );
  return t;
}
export function changeTask(input: any) {
  const id = text(input.id, 80);
  if (!Number.isSafeInteger(input.revision))
    throw new SyncError(400, "A task revision is required.");
  return withStore((db) =>
    transaction(db, () => {
      const t = current(db, id, input.revision);
      let state: TaskState = t.state,
        reason = t.reason,
        request = t.request,
        output = t.output;
      switch (input.action) {
        case "queue":
          if (!["accepted", "paused", "failed", "waiting"].includes(t.state))
            throw new SyncError(
              409,
              "This task cannot be queued from its current state.",
            );
          if (!policy(db).planningEnabled)
            throw new SyncError(403, "Owner policy has paused task dispatch.");
          if (
            input.allowWorker !== undefined &&
            typeof input.allowWorker !== "boolean"
          )
            throw new SyncError(400, "Worker consent must be explicit.");
          db.prepare("DELETE FROM worker_grants WHERE task_id=?").run(t.id);
          if (input.allowWorker === true) {
            if (t.mode !== "development")
              throw new SyncError(
                400,
                "Cloud worker consent applies only to development tasks.",
              );
            db.prepare("INSERT INTO worker_grants VALUES(?,?,?,0)").run(
              t.id,
              t.revision + 1,
              Date.now() + 10 * 60 * 1000,
            );
            event(
              db,
              t.id,
              "worker.authorized",
              "Owner permitted sending this objective to the signed-in Codex worker for one attempt within ten minutes; no owner memory or credentials included.",
            );
          }
          state = "queued";
          reason = "Waiting for the local coordinator";
          break;
        case "pause":
          if (
            !["accepted", "queued", "running", "verifying", "waiting"].includes(
              t.state,
            )
          )
            throw new SyncError(409, "Task cannot be paused.");
          state = "paused";
          reason = "Paused by owner; completed effects are preserved";
          break;
        case "cancel":
          if (["completed", "cancelled"].includes(t.state))
            throw new SyncError(409, "Task is already finished.");
          state = "cancelled";
          reason = "Cancelled by owner; existing artifacts are preserved";
          break;
        case "steer":
          if (["completed", "cancelled"].includes(t.state))
            throw new SyncError(
              409,
              "Create a new task for a finished request.",
            );
          request = text(input.request, 2000);
          state = "paused";
          reason =
            "Owner corrected the objective. Review and queue the new revision.";
          output = "";
          break;
        default:
          throw new SyncError(400, "Unsupported task action.");
      }
      db.prepare(
        "UPDATE tasks SET revision=revision+1,request=?,state=?,reason=?,output=?,updated_at=? WHERE id=?",
      ).run(request, state, reason, output, new Date().toISOString(), id);
      event(
        db,
        id,
        "task." + input.action,
        "Owner action applied; stale worker revisions are invalidated.",
      );
    }),
  );
}
export function setPolicy(input: any) {
  if (
    typeof input.enabled !== "boolean" ||
    !Number.isSafeInteger(input.revision)
  )
    throw new SyncError(400, "Invalid policy revision.");
  return withStore((db) =>
    transaction(db, () => {
      const p = policy(db);
      if (p.revision !== input.revision)
        throw new SyncError(409, "Policy changed. Refresh first.");
      if (p.planningEnabled === input.enabled) return;
      db.prepare(
        "UPDATE policy SET revision=revision+1,planning_enabled=? WHERE id=1",
      ).run(input.enabled ? 1 : 0);
      if (!input.enabled)
        db.prepare(
          "UPDATE tasks SET state='paused',reason='Owner policy paused dispatch',revision=revision+1,updated_at=? WHERE state IN ('queued','running','verifying')",
        ).run(new Date().toISOString());
      event(
        db,
        null,
        "policy.changed",
        "Local task dispatch " + (input.enabled ? "enabled" : "paused") + ".",
      );
    }),
  );
}
export function saveMemory(input: any) {
  const content = text(input.content, 1000),
    workspace = scope(input.scope);
  if (!["fact", "preference", "instruction"].includes(input.kind))
    throw new SyncError(400, "Invalid memory category.");
  return withStore((db) =>
    transaction(db, () => {
      let id = input.id ? text(input.id, 80) : randomUUID(),
        revision = 0;
      const old = db.prepare("SELECT * FROM memory WHERE id=?").get(id) as any;
      if (input.id && !old) throw new SyncError(404, "Memory not found.");
      if (old) {
        if (old.revision !== input.revision)
          throw new SyncError(409, "Memory changed. Refresh first.");
        db.prepare("INSERT INTO memory_history VALUES(?,?,?,?)").run(
          id,
          old.revision,
          old.content,
          new Date().toISOString(),
        );
        revision = old.revision + 1;
      } else if (
        Number((db.prepare("SELECT count(*) n FROM memory").get() as any).n) >=
        500
      )
        throw new SyncError(
          409,
          "Memory limit reached; correct or remove obsolete records first.",
        );
      if (input.kind === "instruction") {
        const total = Number(
          (
            db
              .prepare(
                "SELECT coalesce(sum(length(CAST(content AS BLOB))),0) n FROM memory WHERE kind='instruction' AND id!=?",
              )
              .get(id) as any
          ).n,
        );
        if (total + Buffer.byteLength(content, "utf8") > 2500)
          throw new SyncError(
            409,
            "Owner instructions exceed the context budget. Consolidate them first; none were silently dropped.",
          );
      }
      db.prepare("INSERT OR REPLACE INTO memory VALUES(?,?,?,?,?,?)").run(
        id,
        revision,
        input.kind,
        workspace,
        content,
        new Date().toISOString(),
      );
      db.prepare("DELETE FROM memory_search WHERE id=?").run(id);
      db.prepare("INSERT INTO memory_search VALUES(?,?)").run(id, content);
      invalidateContext(db);
      event(
        db,
        null,
        "memory.saved",
        "Owner memory revision saved locally; no external provider permission granted.",
      );
      return id;
    }),
  );
}
export function deleteMemory(input: any) {
  return withStore((db) =>
    transaction(db, () => {
      const id = text(input.id, 80),
        r = db.prepare("SELECT revision FROM memory WHERE id=?").get(id) as any;
      if (!r) throw new SyncError(404, "Memory not found.");
      if (r.revision !== input.revision)
        throw new SyncError(409, "Memory changed. Refresh first.");
      db.prepare("DELETE FROM memory WHERE id=?").run(id);
      db.prepare("DELETE FROM memory_search WHERE id=?").run(id);
      db.prepare("DELETE FROM memory_history WHERE id=?").run(id);
      invalidateContext(db);
      event(
        db,
        null,
        "memory.deleted",
        "Active memory, correction history and search entries removed. Saved task artifacts/backups require separate deletion.",
      );
    }),
  );
}
export function memoryContext(workspace: string, query: string) {
  return withStore((db) => {
    const instructions = db
      .prepare(
        "SELECT id,content FROM memory WHERE kind='instruction' AND scope IN ('Personal',?) ORDER BY id",
      )
      .all(workspace) as any[];
    const terms = query
      .match(/[\p{L}\p{N}]{2,}/gu)
      ?.slice(0, 12)
      .map((s) => '"' + s + '"')
      .join(" OR ");
    const rows = terms
      ? db
          .prepare(
            "SELECT m.id,m.kind,m.content FROM memory m JOIN memory_search s ON m.id=s.id WHERE memory_search MATCH ? AND m.kind!='instruction' AND m.scope IN ('Personal',?) ORDER BY rank LIMIT 6",
          )
          .all(terms, workspace)
      : [];
    return JSON.stringify({ ownerInstructions: instructions, memories: rows });
  });
}
export function claimNext() {
  return withStore((db) =>
    transaction(db, () => {
      const p = policy(db);
      if (!p.planningEnabled) return null;
      const raw = db
        .prepare(
          "SELECT * FROM tasks WHERE state='queued' ORDER BY created_at LIMIT 1",
        )
        .get();
      if (!raw) return null;
      const t = task(raw);
      db.prepare(
        "UPDATE tasks SET state='running',reason='Preparing bounded local work',revision=revision+1,policy_revision=?,updated_at=? WHERE id=?",
      ).run(p.revision, new Date().toISOString(), t.id);
      db.prepare(
        "UPDATE worker_grants SET task_revision=? WHERE task_id=? AND task_revision=?",
      ).run(t.revision + 1, t.id, t.revision);
      event(db, t.id, "task.running", "Local coordinator claimed work.");
      return task(db.prepare("SELECT * FROM tasks WHERE id=?").get(t.id));
    }),
  );
}
export function stillCurrent(t: NexusTask) {
  return withStore((db) => {
    const r = db
        .prepare("SELECT revision,state FROM tasks WHERE id=?")
        .get(t.id) as any,
      p = policy(db);
    return (
      !!r &&
      r.revision === t.revision &&
      r.state === "running" &&
      p.planningEnabled &&
      p.revision === t.policyRevision
    );
  });
}
export function finishTask(
  t: NexusTask,
  output: string,
  waiting = false,
  candidateReady = false,
) {
  return withStore((db) =>
    transaction(db, () => {
      const r = current(db, t.id, t.revision),
        p = policy(db);
      if (
        r.state !== "running" ||
        !p.planningEnabled ||
        p.revision !== t.policyRevision
      )
        throw new SyncError(
          409,
          "Task/policy changed during execution; stale result was not applied.",
        );
      if (!output.trim() || output.length > 40000)
        throw new SyncError(502, "Worker output failed artifact validation.");
      event(
        db,
        t.id,
        "task.verifying",
        "Checking the generated text artifact; external claims are not verified.",
      );
      db.prepare(
        "UPDATE tasks SET state=?,reason=?,output=?,revision=revision+1,updated_at=? WHERE id=?",
      ).run(
        waiting ? "waiting" : "completed",
        waiting
          ? candidateReady
            ? "Codex candidate ready; independent tests and promotion are not performed"
            : "Development handoff ready; live worker was not authorized for this attempt"
          : "Planning artifact saved and read back; no external task was executed",
        output,
        new Date().toISOString(),
        t.id,
      );
      const saved = db
        .prepare("SELECT output,state FROM tasks WHERE id=?")
        .get(t.id) as any;
      if (
        saved.output !== output ||
        saved.state !== (waiting ? "waiting" : "completed")
      )
        throw new SyncError(503, "Artifact read-back verification failed.");
      if (waiting)
        db.prepare("INSERT OR REPLACE INTO skills VALUES(?,?,?,'draft')").run(
          "draft-" + t.id,
          t.id,
          "Candidate procedure for this task; requires implementation and independent tests.",
        );
      event(
        db,
        t.id,
        waiting ? "task.waiting" : "task.completed",
        waiting
          ? candidateReady
            ? "Structurally checked code candidate and unvalidated draft saved. Tests/code execution were not performed."
            : "Handoff and unvalidated skill draft saved."
          : "Plan artifact verified in local storage, not real-world effects.",
      );
    }),
  );
}
export function failTask(t: NexusTask, reason: string) {
  withStore((db) =>
    transaction(db, () => {
      const r = db
        .prepare("SELECT revision,state FROM tasks WHERE id=?")
        .get(t.id) as any;
      if (!r || r.revision !== t.revision || r.state !== "running") return;
      db.prepare(
        "UPDATE tasks SET state='failed',reason=?,revision=revision+1,updated_at=? WHERE id=?",
      ).run(reason, new Date().toISOString(), t.id);
      event(db, t.id, "task.failed", reason);
    }),
  );
}
export function recoverTasks() {
  return withStore((db) =>
    transaction(db, () => {
      const rows = db
        .prepare("SELECT id FROM tasks WHERE state IN ('running','verifying')")
        .all() as any[];
      for (const r of rows) {
        db.prepare(
          "UPDATE tasks SET state='paused',reason='Coordinator restarted. Review and resume; no external action was replayed.',revision=revision+1,updated_at=? WHERE id=?",
        ).run(new Date().toISOString(), r.id);
        event(
          db,
          r.id,
          "task.recovered",
          "Interrupted work paused for owner review.",
        );
      }
      db.prepare(
        "UPDATE worker_runs SET state='interrupted',detail='Coordinator restarted. Child process termination is unverified; owner must confirm it stopped before another cloud run.',updated_at=? WHERE state IN ('starting','running','validating')",
      ).run(new Date().toISOString());
      return rows.length;
    }),
  );
}

function invalidateContext(db: DatabaseSync) {
  db.prepare("UPDATE policy SET revision=revision+1 WHERE id=1").run();
  db.prepare(
    "UPDATE tasks SET state='paused',reason='Owner memory changed. Review and resume with fresh context.',revision=revision+1,updated_at=? WHERE state IN ('running','verifying')",
  ).run(new Date().toISOString());
}

export function deleteTask(input: any) {
  return withStore((db) =>
    transaction(db, () => {
      const t = current(db, text(input.id, 80), input.revision);
      if (["queued", "running", "verifying"].includes(t.state))
        throw new SyncError(
          409,
          "Pause or cancel active work before deleting it.",
        );
      const uncertain = db
        .prepare(
          "SELECT id FROM worker_runs WHERE task_id=? AND state IN ('starting','running','validating','interrupted')",
        )
        .get(t.id);
      if (uncertain)
        throw new SyncError(
          409,
          "Resolve or stop the associated worker before deleting its evidence.",
        );
      db.prepare("DELETE FROM worker_grants WHERE task_id=?").run(t.id);
      db.prepare("DELETE FROM worker_runs WHERE task_id=?").run(t.id);
      db.prepare("DELETE FROM skills WHERE task_id=?").run(t.id);
      db.prepare("DELETE FROM events WHERE task_id=?").run(t.id);
      db.prepare("DELETE FROM tasks WHERE id=?").run(t.id);
      event(
        db,
        null,
        "task.deleted",
        "Task content, linked draft skills and task event references deleted. Backups are separate.",
      );
    }),
  );
}
export function backupFoundation() {
  return withStore((db) => {
    const dir = path.join(
      path.resolve(
        process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
      ),
      "foundation-backups",
    );
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const filename = "nexus-" + Date.now() + "-" + randomUUID() + ".sqlite";
    const target = path.join(dir, filename);
    db.prepare("VACUUM INTO ?").run(target);
    if (process.platform !== "win32") chmodSync(target, 0o600);
    event(
      db,
      null,
      "backup.created",
      "Consistent SQLite foundation snapshot saved; business files and credentials are not included.",
    );
    return filename;
  });
}

export function hasWorkerConsent(t: NexusTask) {
  return withStore(
    (db) =>
      !!db
        .prepare(
          "SELECT task_id FROM worker_grants WHERE task_id=? AND task_revision=? AND expires>? AND consumed=0",
        )
        .get(t.id, t.revision, Date.now()),
  );
}
export function beginWorkerRun(t: NexusTask) {
  return withStore((db) =>
    transaction(db, () => {
      const p = policy(db);
      const currentTask = current(db, t.id, t.revision);
      if (
        currentTask.state !== "running" ||
        p.revision !== t.policyRevision ||
        !p.planningEnabled
      )
        throw new SyncError(409, "Task authorization changed.");
      if (
        db
          .prepare(
            "SELECT id FROM worker_runs WHERE state IN ('starting','running','validating','interrupted')",
          )
          .get()
      )
        throw new SyncError(
          409,
          "A worker is active or has an unresolved interruption.",
        );
      const grant = db
        .prepare(
          "SELECT * FROM worker_grants WHERE task_id=? AND task_revision=? AND expires>? AND consumed=0",
        )
        .get(t.id, t.revision, Date.now());
      if (!grant)
        throw new SyncError(403, "No current one-use worker consent.");
      db.prepare("UPDATE worker_grants SET consumed=1 WHERE task_id=?").run(
        t.id,
      );
      const id = randomUUID(),
        now = new Date().toISOString();
      db.prepare(
        "INSERT INTO worker_runs(id,task_id,task_revision,state,progress,started_at,updated_at,detail) VALUES(?,?,?,'starting',0,?,?,?)",
      ).run(
        id,
        t.id,
        t.revision,
        now,
        now,
        "Starting a bounded Codex candidate-authoring attempt.",
      );
      event(
        db,
        t.id,
        "worker.starting",
        "One-use consent consumed; no API-key fallback.",
      );
      return id;
    }),
  );
}
export function updateWorkerRun(
  id: string,
  state: string,
  detail: string,
  progress = false,
) {
  withStore((db) => {
    if (
      ![
        "running",
        "validating",
        "candidate-ready",
        "failed",
        "cancelled",
        "interrupted",
      ].includes(state)
    )
      throw new SyncError(400, "Invalid worker state.");
    db.prepare(
      "UPDATE worker_runs SET state=?,detail=?,progress=progress+?,updated_at=? WHERE id=?",
    ).run(state, detail, progress ? 1 : 0, new Date().toISOString(), id);
  });
}
export function acknowledgeWorker(input: any) {
  withStore((db) =>
    transaction(db, () => {
      if (input.confirmStopped !== true)
        throw new SyncError(
          400,
          "Confirm the interrupted worker process has stopped first.",
        );
      const id = text(input.id, 80);
      const r = db
        .prepare(
          "SELECT task_id FROM worker_runs WHERE id=? AND state='interrupted'",
        )
        .get(id) as any;
      if (!r)
        throw new SyncError(
          409,
          "This run is not awaiting interruption review.",
        );
      db.prepare(
        "UPDATE worker_runs SET state='owner-acknowledged',detail='Owner confirmed the previous process stopped; this is not automatic process verification.',updated_at=? WHERE id=?",
      ).run(new Date().toISOString(), id);
      event(
        db,
        r.task_id,
        "worker.interruption-acknowledged",
        "Owner confirmed stopped process; no stale command replayed.",
      );
    }),
  );
}

export function workerProcessId(id: string, pid: number) {
  if (!Number.isSafeInteger(pid) || pid <= 0)
    throw new SyncError(400, "Invalid worker process identity.");
  withStore((db) => {
    db.prepare("UPDATE worker_runs SET pid=? WHERE id=?").run(pid, id);
  });
}

export function workerActivity() {
  return withStore((db) =>
    (
      db
        .prepare(
          "SELECT id,state,started_at,updated_at FROM worker_runs ORDER BY started_at DESC LIMIT 40",
        )
        .all() as any[]
    )
      .filter((r) => Date.parse(r.updated_at) > Date.now() - 15 * 60 * 1000)
      .map((r) => ({
        id: "worker-" + r.id,
        agent: "codex-worker",
        started: Date.parse(r.started_at),
        finished: ["starting", "running", "validating"].includes(r.state)
          ? undefined
          : Date.parse(r.updated_at),
        state: ["starting", "running", "validating"].includes(r.state)
          ? ("working" as const)
          : r.state === "candidate-ready"
            ? ("complete" as const)
            : r.state === "cancelled"
              ? ("cancelled" as const)
              : ("failed" as const),
      })),
  );
}
