import { createHash, randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import contract from "../../foundation/usd-contract.json";
import { scopes, type Scope } from "../../foundation/contracts";
import { validateCandidate } from "../../foundation/candidate";
import { withStore } from "./store";
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
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
function workspace(value: any): Scope {
  if (!scopes.includes(value))
    throw new SyncError(400, "Choose a supported workspace.");
  return value;
}
function revision(value: any) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new SyncError(400, "A current binding revision is required.");
  return value;
}
function binding(db: DatabaseSync, scope: Scope) {
  return (
    (db
      .prepare("SELECT * FROM utility_bindings WHERE scope=? AND profile_id=?")
      .get(scope, contract.id) as any) || {
      scope,
      profile_id: contract.id,
      revision: 0,
      package_id: null,
      previous_package_id: null,
    }
  );
}
export function eligiblePackage(db: DatabaseSync, id: string, scope: Scope) {
  const p = db
    .prepare("SELECT * FROM candidate_packages WHERE id=?")
    .get(id) as any;
  if (!p || p.state !== "inactive")
    throw new SyncError(409, "Package is missing or revoked.");
  let m;
  try {
    m = JSON.parse(p.manifest);
  } catch {
    throw new SyncError(409, "Package manifest is invalid.");
  }
  if (!m || typeof m !== "object")
    throw new SyncError(409, "Package manifest is invalid.");
  if (
    digest(m) !== p.manifest_hash ||
    m.schemaVersion !== 1 ||
    m.kind !== "inactive-utility-package" ||
    m.lifecycle !== "inactive" ||
    m.taskId !== p.task_id ||
    m.taskRevision !== p.task_revision ||
    m.scope !== scope ||
    m.candidateHash !== p.candidate_hash ||
    m.profile?.id !== contract.id ||
    m.profile?.version !== contract.version ||
    m.profile?.hash !== digest(contract) ||
    p.profile_id !== contract.id ||
    p.profile_version !== contract.version ||
    typeof m.evidence?.reviewId !== "string" ||
    typeof m.evidence?.suppliedTestRunId !== "string" ||
    typeof m.evidence?.verificationId !== "string" ||
    m.permissions?.network !== false ||
    m.permissions?.filesystem !== false ||
    m.permissions?.hostExecution !== false
  )
    throw new SyncError(
      409,
      "Package integrity, workspace, profile or permissions changed.",
    );
  let candidate;
  try {
    candidate = validateCandidate(m.candidate);
  } catch {
    throw new SyncError(409, "Archived candidate is invalid.");
  }
  if (digest(candidate) !== m.candidateHash)
    throw new SyncError(409, "Archived candidate hash changed.");
  const v = db
    .prepare("SELECT * FROM candidate_verifications WHERE id=?")
    .get(p.verification_id) as any;
  const r = db
    .prepare("SELECT * FROM candidate_reviews WHERE id=?")
    .get(m.evidence?.reviewId) as any;
  const t = db
    .prepare("SELECT * FROM candidate_test_runs WHERE id=?")
    .get(m.evidence?.suppliedTestRunId) as any;
  const task = db
    .prepare("SELECT scope FROM tasks WHERE id=?")
    .get(p.task_id) as any;
  if (
    !v ||
    !r ||
    !t ||
    task?.scope !== scope ||
    v.id !== m.evidence?.verificationId ||
    v.state !== "passed" ||
    v.candidate_hash !== m.candidateHash ||
    v.task_id !== p.task_id ||
    v.task_revision !== p.task_revision ||
    v.review_id !== r.id ||
    v.review_revision !== r.revision ||
    v.test_run_id !== t.id ||
    v.profile_id !== contract.id ||
    v.profile_version !== contract.version ||
    r.state !== "accepted-for-tests" ||
    r.revision !== m.evidence.reviewRevision ||
    r.task_id !== p.task_id ||
    r.task_revision !== p.task_revision ||
    r.candidate_hash !== m.candidateHash ||
    t.state !== "passed" ||
    t.task_id !== p.task_id ||
    t.task_revision !== p.task_revision ||
    t.review_id !== r.id ||
    t.candidate_hash !== m.candidateHash
  )
    throw new SyncError(
      409,
      "Archived approval or test evidence is no longer eligible.",
    );
  const report = JSON.parse(v.report),
    sr = JSON.parse(t.report);
  if (JSON.parse(r.report).typecheck !== "passed")
    throw new SyncError(409, "Archived static validation is not passing.");
  if (
    report.profileHash !== digest(contract) ||
    report.profileId !== contract.id ||
    report.profileVersion !== contract.version ||
    report.passed !== contract.cases.length ||
    report.failed !== 0 ||
    report.state !== "passed" ||
    report.scope !== "independent host-side USD contract checks" ||
    sr.state !== "passed" ||
    sr.scope !== "candidate-supplied synchronous tests" ||
    sr.failed !== 0 ||
    sr.passed < 1
  )
    throw new SyncError(409, "Archived verification is incomplete.");
  const latestV = db
    .prepare(
      "SELECT state FROM candidate_verifications WHERE task_id=? AND candidate_hash=? AND profile_id=? AND profile_version=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
    )
    .get(p.task_id, p.candidate_hash, contract.id, contract.version) as any;
  const latestT = db
    .prepare(
      "SELECT state FROM candidate_test_runs WHERE task_id=? AND candidate_hash=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
    )
    .get(p.task_id, p.candidate_hash) as any;
  const latestReview = db
    .prepare(
      "SELECT state FROM candidate_reviews WHERE task_id=? AND candidate_hash=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
    )
    .get(p.task_id, p.candidate_hash) as any;
  if (
    latestReview?.state !== "accepted-for-tests" ||
    latestV?.state !== "passed" ||
    latestT?.state !== "passed"
  )
    throw new SyncError(
      409,
      "Newer evidence for this exact artifact is not passing.",
    );
  return { p, manifest: m, candidate };
}
function preview(db: DatabaseSync, input: any) {
  const scope = workspace(input.scope),
    b = binding(db, scope);
  if (b.revision !== revision(input.bindingRevision))
    throw new SyncError(409, "Utility binding changed. Refresh the preview.");
  if (
    typeof input.packageId !== "string" ||
    !Number.isSafeInteger(input.packageRevision)
  )
    throw new SyncError(400, "Select the current package revision.");
  const target = eligiblePackage(db, input.packageId, scope);
  if (target.p.revision !== input.packageRevision)
    throw new SyncError(409, "Package revision changed.");
  if (b.package_id === input.packageId)
    throw new SyncError(409, "This package is already active.");
  const proposal = {
    schemaVersion: 1,
    action: "activate-isolated-usd",
    scope,
    profileId: contract.id,
    profileHash: digest(contract),
    bindingRevision: b.revision,
    fromPackageId: b.package_id,
    toPackageId: target.p.id,
    packageRevision: target.p.revision,
    manifestHash: target.p.manifest_hash,
    rollbackPackageId: b.package_id,
    permissions: { network: false, filesystem: false, hostExecution: false },
    effects:
      "Only the manual USD utility in this workspace; no repository files, estimates or deployments change",
  };
  return { proposal, previewHash: digest(proposal) };
}
function updateBinding(
  db: DatabaseSync,
  b: any,
  to: string | null,
  previous: string | null,
  kind: string,
) {
  const now = new Date().toISOString();
  if (b.revision === 0) {
    db.prepare("INSERT INTO utility_bindings VALUES(?,?,1,?,?,?)").run(
      b.scope,
      contract.id,
      to,
      previous,
      now,
    );
  } else {
    db.prepare(
      "UPDATE utility_bindings SET revision=revision+1,package_id=?,previous_package_id=?,updated_at=? WHERE scope=? AND profile_id=? AND revision=?",
    ).run(to, previous, now, b.scope, contract.id, b.revision);
  }
  db.prepare("INSERT INTO utility_binding_history VALUES(?,?,?,?,?,?,?,?)").run(
    randomUUID(),
    b.scope,
    contract.id,
    b.revision + 1,
    b.package_id,
    to,
    kind,
    now,
  );
}
export const previewUtilityActivation = (input: any) =>
  transaction((db) => preview(db, input));
export function activateUtility(input: any) {
  if (input.confirmActivation !== true || typeof input.previewHash !== "string")
    throw new SyncError(
      400,
      "Review and confirm this exact activation preview.",
    );
  return transaction((db) => {
    const result = preview(db, input);
    if (result.previewHash !== input.previewHash)
      throw new SyncError(409, "Activation preview changed.");
    const b = binding(db, result.proposal.scope);
    updateBinding(db, b, input.packageId, b.package_id, "activate");
  });
}
export function changeUtilityBinding(input: any) {
  const scope = workspace(input.scope);
  revision(input.bindingRevision);
  if (
    input.confirmChange !== true ||
    !["rollback", "disable"].includes(input.action)
  )
    throw new SyncError(400, "Confirm rollback or disable.");
  return transaction((db) => {
    const b = binding(db, scope);
    if (b.revision !== input.bindingRevision || !b.package_id)
      throw new SyncError(
        409,
        "Binding changed or the built-in formatter is already selected.",
      );
    const target = input.action === "rollback" ? b.previous_package_id : null;
    if (target) eligiblePackage(db, target, scope);
    updateBinding(db, b, target, null, input.action);
  });
}
function amount(value: any) {
  if (typeof value === "string") {
    value = value.trim();
    if (
      value.length > 80 ||
      !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(value)
    )
      throw new SyncError(400, "Enter a finite decimal amount.");
    value = Number(value);
  }
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new SyncError(400, "Enter a finite decimal amount.");
  return value;
}
function executeUtility(
  candidate: any,
  value: number,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      path.join(process.cwd(), "scripts/run-nexus-utility.mjs"),
      {
        workerData: { candidate, amount: value },
        resourceLimits: {
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 16,
          stackSizeMb: 4,
        },
      },
    );
    let settled = false;
    const finish = (error?: Error, text?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      void worker.terminate().then(
        () => (error ? reject(error) : resolve(text!)),
        () => reject(Error("Utility cleanup failed")),
      );
    };
    const abort = () => finish(Error("Utility call interrupted"));
    const timer = setTimeout(
      () => finish(Error("Utility call exceeded its budget")),
      10000,
    );
    signal?.addEventListener("abort", abort, { once: true });
    worker.on("message", (r) => {
      if (
        r?.checked === true &&
        typeof r.text === "string" &&
        r.text.length <= 512
      )
        finish(undefined, r.text);
      else finish(Error("Utility returned an invalid result"));
    });
    worker.on("error", () => finish(Error("Isolated USD utility failed")));
    worker.on("exit", () => {
      if (!settled) finish(Error("Utility stopped before returning a result"));
    });
    if (signal?.aborted) abort();
  });
}
export async function runUsdUtility(input: any, signal?: AbortSignal) {
  const scope = workspace(input.scope),
    value = amount(input.amount);
  const ticket = transaction((db) => {
    const b = binding(db, scope);
    const pkg = b.package_id ? eligiblePackage(db, b.package_id, scope) : null;
    if (
      db.prepare("SELECT id FROM utility_runs WHERE state='running'").get() ||
      db
        .prepare("SELECT id FROM candidate_test_runs WHERE state='running'")
        .get() ||
      db
        .prepare("SELECT id FROM candidate_verifications WHERE state='running'")
        .get()
    )
      throw new SyncError(409, "An isolated operation is already running.");
    const id = randomUUID(),
      now = new Date().toISOString();
    db.prepare(
      "INSERT INTO utility_runs VALUES(?,?,?,?,?,'running','{}',?,?)",
    ).run(id, scope, contract.id, b.revision, b.package_id, now, now);
    return { id, b, pkg };
  });
  let text = "",
    failure = false;
  try {
    text = ticket.pkg
      ? await executeUtility(ticket.pkg.candidate, value, signal)
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(value);
  } catch {
    failure = true;
  }
  return transaction((db) => {
    const row = db
      .prepare("SELECT state FROM utility_runs WHERE id=?")
      .get(ticket.id) as any;
    if (!row || row.state !== "running")
      throw new SyncError(
        409,
        "Utility call was interrupted; result discarded.",
      );
    const b = binding(db, scope);
    let fresh =
      b.revision === ticket.b.revision && b.package_id === ticket.b.package_id;
    try {
      if (ticket.pkg)
        fresh =
          fresh &&
          eligiblePackage(db, ticket.pkg.p.id, scope).p.manifest_hash ===
            ticket.pkg.p.manifest_hash;
    } catch {
      fresh = false;
    }
    const state = !fresh
      ? "stale"
      : signal?.aborted
        ? "interrupted"
        : failure
          ? "error"
          : "passed";
    db.prepare(
      "UPDATE utility_runs SET state=?,report=?,updated_at=? WHERE id=?",
    ).run(
      state,
      JSON.stringify({
        source: ticket.pkg ? "isolated-package" : "built-in",
        manifestHash: ticket.pkg?.p.manifest_hash || null,
      }),
      new Date().toISOString(),
      ticket.id,
    );
    return state === "passed"
      ? {
          state,
          text,
          source: ticket.pkg ? "isolated-package" : "built-in",
          packageId: ticket.b.package_id,
          bindingRevision: ticket.b.revision,
        }
      : {
          state,
          error:
            "Utility result unavailable or discarded. Disable or roll back the binding to use the built-in formatter.",
        };
  });
}
