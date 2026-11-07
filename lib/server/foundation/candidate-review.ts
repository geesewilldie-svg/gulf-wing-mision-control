import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { withStore } from "./store";
import {
  savedCandidate,
  checkCandidate,
  type ValidationReport,
} from "./candidate-validation";
import { text } from "../../foundation/contracts";
import { SyncError } from "../sync-store";
function transaction<T>(fn: (db: DatabaseSync) => T): T {
  return withStore((db) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn(db);
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  });
}
function taskArtifact(db: DatabaseSync, id: string, revision: number) {
  const t = db
    .prepare("SELECT mode,state,revision,output FROM tasks WHERE id=?")
    .get(id) as any;
  if (!t) throw new SyncError(404, "Task not found.");
  if (
    t.revision !== revision ||
    t.state !== "waiting" ||
    t.mode !== "development"
  )
    throw new SyncError(
      409,
      "Candidate task changed or is not waiting for review.",
    );
  return savedCandidate(t.output, id);
}
function event(db: DatabaseSync, id: string, type: string, detail: string) {
  db.prepare("INSERT INTO events(task_id,type,at,detail) VALUES(?,?,?,?)").run(
    id,
    type,
    new Date().toISOString(),
    detail,
  );
}
export async function validateTaskCandidate(input: any, signal?: AbortSignal) {
  const taskId = text(input.id, 80);
  if (!Number.isSafeInteger(input.revision))
    throw new SyncError(400, "A task revision is required.");
  const ticket = transaction((db) => {
    const artifact = taskArtifact(db, taskId, input.revision);
    if (
      db
        .prepare("SELECT id FROM candidate_reviews WHERE state='checking'")
        .get()
    )
      throw new SyncError(409, "A candidate is already being checked.");
    const id = randomUUID(),
      now = new Date().toISOString();
    db.prepare(
      "INSERT INTO candidate_reviews VALUES(?,?,?,?,0,'checking','{}','',?,?)",
    ).run(id, taskId, input.revision, artifact.hash, now, now);
    event(
      db,
      taskId,
      "candidate.checking",
      "Local integrity/type checks started. No candidate code/test execution or cloud request.",
    );
    return { id, ...artifact };
  });
  let report:
    | ValidationReport
    | {
        typecheck: "failed";
        tests: "not-run";
        codeExecution: "not-run";
        failure: string;
      };
  try {
    report = await checkCandidate(ticket.candidate, signal);
  } catch {
    report = {
      typecheck: "failed",
      tests: "not-run",
      codeExecution: "not-run",
      failure: signal?.aborted
        ? "Validation interrupted; no candidate code executed."
        : "Compiler unavailable, cancelled or over budget; no candidate code executed.",
    };
  }
  return transaction((db) => {
    const row = db
      .prepare("SELECT state FROM candidate_reviews WHERE id=?")
      .get(ticket.id) as any;
    if (!row || row.state !== "checking")
      throw new SyncError(
        409,
        "Candidate validation was superseded or interrupted.",
      );
    let fresh = false;
    try {
      fresh = taskArtifact(db, taskId, input.revision).hash === ticket.hash;
    } catch {}
    const state = !fresh
      ? "stale"
      : signal?.aborted
        ? "interrupted"
        : report.typecheck === "passed"
          ? "checks-passed"
          : report.typecheck === "not-applicable"
            ? "manual-review-required"
            : "checks-failed";
    db.prepare(
      "UPDATE candidate_reviews SET state=?,report=?,revision=revision+1,updated_at=? WHERE id=?",
    ).run(state, JSON.stringify(report), new Date().toISOString(), ticket.id);
    event(
      db,
      taskId,
      "candidate." + state,
      "Validation report stored. Tests, installation and promotion remain unperformed.",
    );
    return { reviewId: ticket.id, state };
  });
}
export function decideCandidate(input: any) {
  const id = text(input.reviewId, 80);
  if (
    !Number.isSafeInteger(input.reviewRevision) ||
    !Number.isSafeInteger(input.taskRevision) ||
    !["accept-for-tests", "reject"].includes(input.decision) ||
    input.confirmReviewed !== true
  )
    throw new SyncError(
      400,
      "Review the exact artifact and confirm your decision.",
    );
  const note =
    input.note === undefined
      ? ""
      : typeof input.note === "string" && input.note.length <= 1000
        ? input.note.trim()
        : (() => {
            throw new SyncError(
              400,
              "Keep review notes under 1000 characters.",
            );
          })();
  return transaction((db) => {
    const r = db
      .prepare("SELECT * FROM candidate_reviews WHERE id=?")
      .get(id) as any;
    if (!r) throw new SyncError(404, "Candidate review not found.");
    if (
      r.revision !== input.reviewRevision ||
      r.task_revision !== input.taskRevision ||
      r.candidate_hash !== input.candidateHash
    )
      throw new SyncError(
        409,
        "Review revision/hash changed. Refresh before deciding.",
      );
    const artifact = taskArtifact(db, r.task_id, input.taskRevision);
    if (artifact.hash !== r.candidate_hash)
      throw new SyncError(409, "The candidate changed. Validate it again.");
    const newest = db
      .prepare(
        "SELECT id FROM candidate_reviews WHERE task_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
      )
      .get(r.task_id) as any;
    if (newest.id !== r.id)
      throw new SyncError(
        409,
        "A newer validation exists. Review the latest report.",
      );
    if (
      ![
        "checks-passed",
        "checks-failed",
        "manual-review-required",
        "accepted-for-tests",
        "rejected",
      ].includes(r.state)
    )
      throw new SyncError(409, "This review is not ready for a decision.");
    const report = JSON.parse(r.report);
    if (
      input.decision === "accept-for-tests" &&
      (report.typecheck !== "passed" ||
        report.tests !== "not-run" ||
        report.codeExecution !== "not-run")
    )
      throw new SyncError(
        409,
        "A passing type check is required before accepting for the test stage.",
      );
    const state =
      input.decision === "reject" ? "rejected" : "accepted-for-tests";
    db.prepare(
      "UPDATE candidate_reviews SET revision=revision+1,state=?,note=?,updated_at=? WHERE id=?",
    ).run(state, note, new Date().toISOString(), id);
    event(
      db,
      r.task_id,
      "candidate." + state,
      "Owner review recorded for this artifact hash only. No code was run, installed or promoted.",
    );
  });
}
