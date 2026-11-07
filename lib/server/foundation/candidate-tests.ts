import contract from "../../foundation/usd-contract.json";
import { Worker } from "node:worker_threads";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { withStore } from "./store";
import { savedCandidate } from "./candidate-validation";
import { SyncError } from "../sync-store";
import {
  validateCandidate,
  type CodeCandidate,
} from "../../foundation/candidate";
export type CandidateTestReport = {
  engine: string;
  state: "passed" | "failed" | "error" | "interrupted";
  passed: number;
  failed: number;
  tests: { name: string; status: "passed" | "failed"; detail: string }[];
  testFiles: string[];
  scope: string;
  installation: "not-performed";
  network: "unavailable";
  filesystem: "unavailable";
  error?: string;
  profileId?: string;
  profileVersion?: number;
  profileHash?: string;
};
async function executeIsolatedWorker(
  candidate: CodeCandidate,
  signal?: AbortSignal,
  independent = false,
): Promise<CandidateTestReport> {
  validateCandidate(candidate);
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const options = {
      workerData: { candidate },
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 16,
        stackSizeMb: 4,
      },
    };
    // Each constructor needs a literal worker path for Turbopack's module
    // analysis. Select the constructor, not a dynamic path expression.
    const worker = independent
      ? new Worker(
          path.join(process.cwd(), "scripts/verify-nexus-candidate.mjs"),
          options,
        )
      : new Worker(
          path.join(process.cwd(), "scripts/test-nexus-candidate.mjs"),
          options,
        );
    let settled = false;
    const finish = (error?: Error, report?: CandidateTestReport) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      void worker.terminate().then(() => {
        if (error) reject(error);
        else resolve(report!);
      });
    };
    const abort = () => finish(Error("Isolated test run cancelled"));
    const timer = setTimeout(
      () =>
        finish(
          Error("Isolated test runner exceeded its 10-second worker budget"),
        ),
      10000,
    );
    signal?.addEventListener("abort", abort, { once: true });
    worker.on("message", (r) => {
      if (
        !r ||
        !["passed", "failed"].includes(r.state) ||
        !Array.isArray(r.tests) ||
        r.tests.length < 1 ||
        r.tests.length > 50 ||
        r.installation !== "not-performed" ||
        (independent &&
          (r.profileId !== contract.id ||
            r.profileVersion !== contract.version ||
            r.profileHash !==
              createHash("sha256")
                .update(JSON.stringify(contract))
                .digest("hex") ||
            r.tests.length !== contract.cases.length ||
            r.scope !== "independent host-side USD contract checks")) ||
        r.passed + r.failed !== r.tests.length ||
        r.tests.some(
          (t: any) =>
            !t ||
            typeof t.name !== "string" ||
            t.name.length > 160 ||
            typeof t.detail !== "string" ||
            t.detail.length > 400 ||
            !["passed", "failed"].includes(t.status),
        )
      )
        finish(Error("Invalid isolated test report"));
      else finish(undefined, r);
    });
    worker.on("error", (e) => finish(Error(e.message.slice(0, 500))));
    worker.on("exit", () => {
      if (!settled)
        finish(Error("Isolated runner stopped before producing a report"));
    });
    if (signal?.aborted) abort();
  });
}
export const executeCandidateTests = (
  candidate: CodeCandidate,
  signal?: AbortSignal,
) => executeIsolatedWorker(candidate, signal);
export const executeIndependentVerification = (
  candidate: CodeCandidate,
  signal?: AbortSignal,
) => executeIsolatedWorker(candidate, signal, true);
function transaction<T>(fn: Parameters<typeof withStore<T>>[0]) {
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
export async function runReviewedCandidateTests(
  input: any,
  signal?: AbortSignal,
) {
  if (
    input.confirmIsolatedRun !== true ||
    !Number.isSafeInteger(input.reviewRevision) ||
    !Number.isSafeInteger(input.taskRevision) ||
    typeof input.reviewId !== "string"
  )
    throw new SyncError(
      400,
      "Confirm an isolated run for the reviewed artifact.",
    );
  const ticket = transaction((db) => {
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
        "Accept and review the current candidate before testing.",
      );
    const latest = db
      .prepare(
        "SELECT id FROM candidate_reviews WHERE task_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
      )
      .get(review.task_id) as any;
    const task = db
      .prepare("SELECT * FROM tasks WHERE id=?")
      .get(review.task_id) as any;
    if (
      latest.id !== review.id ||
      !task ||
      task.state !== "waiting" ||
      task.mode !== "development" ||
      task.revision !== input.taskRevision
    )
      throw new SyncError(
        409,
        "Task or review changed. Refresh before testing.",
      );
    const artifact = savedCandidate(task.output, task.id);
    if (
      artifact.hash !== review.candidate_hash ||
      JSON.parse(review.report).typecheck !== "passed"
    )
      throw new SyncError(
        409,
        "Validate and accept the exact candidate before testing.",
      );
    if (
      db
        .prepare("SELECT id FROM candidate_test_runs WHERE state='running'")
        .get()
    )
      throw new SyncError(409, "An isolated test is already running.");
    if (
      db
        .prepare("SELECT id FROM candidate_verifications WHERE state='running'")
        .get()
    )
      throw new SyncError(409, "Independent verification is already running.");
    const id = randomUUID(),
      now = new Date().toISOString();
    db.prepare(
      "INSERT INTO candidate_test_runs VALUES(?,?,?,?,?,'running','{}',?,?)",
    ).run(id, task.id, task.revision, review.id, artifact.hash, now, now);
    return {
      id,
      taskId: task.id,
      reviewId: review.id,
      reviewRevision: review.revision,
      hash: artifact.hash,
      candidate: artifact.candidate,
    };
  });
  let report: CandidateTestReport;
  try {
    report = await executeCandidateTests(ticket.candidate, signal);
  } catch (e) {
    report = {
      engine: "quickjs-wasm-0.32.0",
      state: signal?.aborted ? "interrupted" : "error",
      passed: 0,
      failed: 0,
      tests: [],
      testFiles: [],
      scope: "candidate-supplied synchronous tests",
      installation: "not-performed",
      network: "unavailable",
      filesystem: "unavailable",
      error: (e as Error).message.slice(0, 500),
    };
  }
  return transaction((db) => {
    const run = db
      .prepare("SELECT state FROM candidate_test_runs WHERE id=?")
      .get(ticket.id) as any;
    if (!run || run.state !== "running")
      throw new SyncError(
        409,
        "Test run was interrupted; no result was applied.",
      );
    const task = db
      .prepare("SELECT revision,state,output FROM tasks WHERE id=?")
      .get(ticket.taskId) as any;
    const review = db
      .prepare("SELECT revision,state FROM candidate_reviews WHERE id=?")
      .get(ticket.reviewId) as any;
    const latest = db
      .prepare(
        "SELECT id FROM candidate_reviews WHERE task_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
      )
      .get(ticket.taskId) as any;
    let fresh =
      task?.revision === input.taskRevision &&
      task.state === "waiting" &&
      review?.revision === ticket.reviewRevision &&
      review.state === "accepted-for-tests" &&
      latest?.id === ticket.reviewId;
    try {
      fresh =
        fresh &&
        savedCandidate(task.output, ticket.taskId).hash === ticket.hash;
    } catch {
      fresh = false;
    }
    const state = fresh ? report.state : "stale";
    db.prepare(
      "UPDATE candidate_test_runs SET state=?,report=?,updated_at=? WHERE id=?",
    ).run(state, JSON.stringify(report), new Date().toISOString(), ticket.id);
    db.prepare(
      "INSERT INTO events(task_id,type,at,detail) VALUES(?,?,?,?)",
    ).run(
      ticket.taskId,
      "candidate.tests-" + state,
      new Date().toISOString(),
      "Isolated candidate-supplied tests recorded. No installation, promotion or live application change.",
    );
    return { runId: ticket.id, state };
  });
}
