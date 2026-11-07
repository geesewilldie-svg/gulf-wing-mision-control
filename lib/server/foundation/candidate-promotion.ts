import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import contract from "../../foundation/usd-contract.json";
import { withStore } from "./store";
import { savedCandidate } from "./candidate-validation";
import {
  executeIndependentVerification,
  type CandidateTestReport,
} from "./candidate-tests";
import { SyncError } from "../sync-store";
function transaction<T>(fn: (db: DatabaseSync) => T) {
  return withStore((db) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const r = fn(db);
      db.exec("COMMIT");
      return r;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  });
}
function event(db: DatabaseSync, taskId: string, type: string, detail: string) {
  db.prepare("INSERT INTO events(task_id,type,at,detail) VALUES(?,?,?,?)").run(
    taskId,
    type,
    new Date().toISOString(),
    detail,
  );
}
function currentEvidence(db: DatabaseSync, input: any) {
  if (
    typeof input.reviewId !== "string" ||
    !Number.isSafeInteger(input.reviewRevision) ||
    !Number.isSafeInteger(input.taskRevision)
  )
    throw new SyncError(400, "Current review and task revisions are required.");
  const review = db
    .prepare("SELECT * FROM candidate_reviews WHERE id=?")
    .get(input.reviewId) as any;
  if (
    !review ||
    review.state !== "accepted-for-tests" ||
    review.revision !== input.reviewRevision ||
    review.task_revision !== input.taskRevision ||
    review.candidate_hash !== input.candidateHash
  )
    throw new SyncError(
      409,
      "Review changed. Validate and accept the exact candidate.",
    );
  const task = db
    .prepare("SELECT * FROM tasks WHERE id=?")
    .get(review.task_id) as any;
  const latestReview = db
    .prepare(
      "SELECT id FROM candidate_reviews WHERE task_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
    )
    .get(review.task_id) as any;
  if (
    !task ||
    task.state !== "waiting" ||
    task.mode !== "development" ||
    task.revision !== input.taskRevision ||
    latestReview.id !== review.id ||
    JSON.parse(review.report).typecheck !== "passed"
  )
    throw new SyncError(
      409,
      "Task or validation changed. Refresh before proceeding.",
    );
  const artifact = savedCandidate(task.output, task.id);
  if (artifact.hash !== review.candidate_hash)
    throw new SyncError(409, "Candidate content changed.");
  const supplied = db
    .prepare(
      "SELECT * FROM candidate_test_runs WHERE task_id=? AND task_revision=? AND review_id=? AND candidate_hash=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
    )
    .get(task.id, task.revision, review.id, artifact.hash) as any;
  if (!supplied || supplied.state !== "passed")
    throw new SyncError(
      409,
      "The latest supplied tests must pass before independent verification or staging.",
    );
  const sr = JSON.parse(supplied.report);
  if (
    sr.scope !== "candidate-supplied synchronous tests" ||
    sr.passed < 1 ||
    sr.failed !== 0 ||
    sr.state !== "passed"
  )
    throw new SyncError(409, "Supplied test evidence is invalid.");
  if (!artifact.candidate.files.some((f) => f.path === contract.sourcePath))
    throw new SyncError(
      409,
      "No independent verification profile supports this candidate. USD v1 requires " +
        contract.sourcePath,
    );
  return { task, review, supplied, ...artifact };
}
export async function verifyReviewedCandidate(
  input: any,
  signal?: AbortSignal,
) {
  if (input.confirmIndependent !== true)
    throw new SyncError(400, "Confirm one independent USD contract run.");
  const ticket = transaction((db) => {
    const evidence = currentEvidence(db, input);
    if (
      db
        .prepare("SELECT id FROM candidate_verifications WHERE state='running'")
        .get() ||
      db
        .prepare("SELECT id FROM candidate_test_runs WHERE state='running'")
        .get()
    )
      throw new SyncError(409, "An isolated check is already running.");
    const id = randomUUID(),
      now = new Date().toISOString();
    db.prepare(
      "INSERT INTO candidate_verifications VALUES(?,?,?,?,?,?,?,?,?,'running','{}',?,?)",
    ).run(
      id,
      evidence.task.id,
      evidence.task.revision,
      evidence.review.id,
      evidence.review.revision,
      evidence.hash,
      evidence.supplied.id,
      contract.id,
      contract.version,
      now,
      now,
    );
    return { id, ...evidence };
  });
  let report: CandidateTestReport;
  try {
    report = await executeIndependentVerification(ticket.candidate, signal);
  } catch (e) {
    report = {
      engine: "quickjs-wasm-0.32.0",
      profileId: contract.id,
      profileVersion: contract.version,
      state: signal?.aborted ? "interrupted" : "error",
      passed: 0,
      failed: 0,
      tests: [],
      testFiles: [],
      scope: "independent host-side USD contract checks",
      installation: "not-performed",
      network: "unavailable",
      filesystem: "unavailable",
      error: (e as Error).message.slice(0, 500),
    };
  }
  return transaction((db) => {
    const row = db
      .prepare("SELECT state FROM candidate_verifications WHERE id=?")
      .get(ticket.id) as any;
    if (!row || row.state !== "running")
      throw new SyncError(
        409,
        "Verification was interrupted; result not applied.",
      );
    let fresh = false;
    try {
      const now = currentEvidence(db, input);
      fresh =
        now.hash === ticket.hash && now.supplied.id === ticket.supplied.id;
    } catch {}
    const state = fresh ? report.state : "stale";
    db.prepare(
      "UPDATE candidate_verifications SET state=?,report=?,updated_at=? WHERE id=?",
    ).run(state, JSON.stringify(report), new Date().toISOString(), ticket.id);
    event(
      db,
      ticket.task.id,
      "candidate.independent-" + state,
      "Fixed host-side USD checks recorded. No package staged or activated.",
    );
    return { verificationId: ticket.id, state };
  });
}
function preview(db: DatabaseSync, input: any) {
  const evidence = currentEvidence(db, input);
  if (typeof input.verificationId !== "string")
    throw new SyncError(400, "Select a current independent verification.");
  const v = db
    .prepare("SELECT * FROM candidate_verifications WHERE id=?")
    .get(input.verificationId) as any;
  const latest = db
    .prepare(
      "SELECT id FROM candidate_verifications WHERE task_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
    )
    .get(evidence.task.id) as any;
  if (
    !v ||
    latest?.id !== v.id ||
    v.state !== "passed" ||
    v.task_id !== evidence.task.id ||
    v.task_revision !== evidence.task.revision ||
    v.review_id !== evidence.review.id ||
    v.review_revision !== evidence.review.revision ||
    v.candidate_hash !== evidence.hash ||
    v.test_run_id !== evidence.supplied.id ||
    v.profile_id !== contract.id ||
    v.profile_version !== contract.version
  )
    throw new SyncError(
      409,
      "The latest independent verification must match current evidence and pass.",
    );
  const report = JSON.parse(v.report);
  if (
    report.profileId !== contract.id ||
    report.profileVersion !== contract.version ||
    report.profileHash !==
      createHash("sha256").update(JSON.stringify(contract)).digest("hex") ||
    report.scope !== "independent host-side USD contract checks" ||
    report.state !== "passed" ||
    report.passed !== contract.cases.length ||
    report.failed !== 0
  )
    throw new SyncError(
      409,
      "Independent verification evidence is incomplete.",
    );
  const manifest = {
    schemaVersion: 1,
    kind: "inactive-utility-package",
    version: `${contract.id}.${contract.version}.${evidence.hash}`,
    scope: evidence.task.scope,
    taskId: evidence.task.id,
    taskRevision: evidence.task.revision,
    candidateHash: evidence.hash,
    profile: {
      id: contract.id,
      version: contract.version,
      hash: report.profileHash,
    },
    evidence: {
      reviewId: evidence.review.id,
      reviewRevision: evidence.review.revision,
      suppliedTestRunId: evidence.supplied.id,
      verificationId: v.id,
      independentChecks: report.passed,
    },
    permissions: { network: false, filesystem: false, hostExecution: false },
    lifecycle: "inactive",
    candidate: evidence.candidate,
  };
  const manifestHash = createHash("sha256")
    .update(JSON.stringify(manifest))
    .digest("hex");
  return { manifest, manifestHash, verification: v };
}
export function previewCandidatePackage(input: any) {
  return transaction((db) => {
    const { manifest, manifestHash } = preview(db, input);
    return { manifest, manifestHash };
  });
}
export function stageCandidatePackage(input: any) {
  if (input.confirmStage !== true || typeof input.previewHash !== "string")
    throw new SyncError(
      400,
      "Review and confirm the inactive package preview.",
    );
  return transaction((db) => {
    const { manifest, manifestHash } = preview(db, input);
    if (input.previewHash !== manifestHash)
      throw new SyncError(
        409,
        "Package preview changed. Preview and approve it again.",
      );
    if (
      db
        .prepare(
          "SELECT id FROM candidate_packages WHERE task_id=? AND candidate_hash=? AND profile_id=? AND profile_version=?",
        )
        .get(
          manifest.taskId,
          manifest.candidateHash,
          contract.id,
          contract.version,
        )
    )
      throw new SyncError(
        409,
        "This package version already exists, including revoked versions.",
      );
    const id = randomUUID(),
      now = new Date().toISOString();
    db.prepare(
      "INSERT INTO candidate_packages VALUES(?,?,?,?,?,?,?,0,'inactive',?,?,?,?)",
    ).run(
      id,
      manifest.taskId,
      manifest.taskRevision,
      input.verificationId,
      manifest.candidateHash,
      contract.id,
      contract.version,
      JSON.stringify(manifest),
      manifestHash,
      now,
      now,
    );
    event(
      db,
      manifest.taskId,
      "candidate.package-inactive",
      "Owner approved an exact preview for private inactive package storage. No candidate files materialized or live skill activated.",
    );
    return { packageId: id, state: "inactive" };
  });
}
export function revokeCandidatePackage(input: any) {
  if (
    typeof input.packageId !== "string" ||
    !Number.isSafeInteger(input.packageRevision) ||
    input.confirmRevoke !== true
  )
    throw new SyncError(400, "Confirm the current package revision to revoke.");
  return transaction((db) => {
    const p = db
      .prepare("SELECT * FROM candidate_packages WHERE id=?")
      .get(input.packageId) as any;
    if (!p || p.revision !== input.packageRevision || p.state !== "inactive")
      throw new SyncError(409, "Package changed or is already revoked.");
    db.prepare(
      "UPDATE candidate_packages SET state='revoked',revision=revision+1,updated_at=? WHERE id=?",
    ).run(new Date().toISOString(), p.id);
    event(
      db,
      p.task_id,
      "candidate.package-revoked",
      "Inactive package withdrawn; no live application code was changed.",
    );
  });
}
