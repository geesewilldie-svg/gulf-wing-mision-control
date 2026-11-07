import { test, expect } from "@playwright/test";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  createTask,
  changeTask,
  claimNext,
  finishTask,
  snapshot,
  withStore,
  recoverTasks,
  deleteTask,
} from "../lib/server/foundation/store";
import {
  validateTaskCandidate,
  decideCandidate,
} from "../lib/server/foundation/candidate-review";
import { runReviewedCandidateTests } from "../lib/server/foundation/candidate-tests";
import {
  verifyReviewedCandidate,
  previewCandidatePackage,
  stageCandidatePackage,
  revokeCandidatePackage,
} from "../lib/server/foundation/candidate-promotion";
import {
  previewUtilityActivation,
  activateUtility,
  changeUtilityBinding,
  runUsdUtility,
} from "../lib/server/foundation/utility-activation";
const source =
  'const f=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});export function formatCurrency(n:number){if(!Number.isFinite(n))throw new RangeError("finite");return f.format(n)}';
async function isolated(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "nexus-activation-")),
    old = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    await fn(dir);
  } finally {
    if (old === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = old;
    await rm(dir, { recursive: true, force: true });
  }
}
async function staged(tag = "one", scope = "Personal", code = source) {
  const candidate = {
    summary: "USD " + tag,
    files: [
      { path: "src/format-currency.ts", content: code },
      {
        path: "tests/usd.test.ts",
        content:
          'import test from "node:test";import assert from "node:assert/strict";import {formatCurrency}from"../src/format-currency.js";test("USD",()=>assert.equal(formatCurrency(12),"$12.00"));',
      },
    ],
    testNotes: "Supplied",
  };
  const id = createTask({ request: "USD " + tag, scope, mode: "development" });
  changeTask({ id, revision: 0, action: "queue" });
  const task = claimNext()!;
  const hash = createHash("sha256")
    .update(JSON.stringify(candidate))
    .digest("hex");
  finishTask(
    task,
    JSON.stringify({
      schemaVersion: 1,
      parentTaskId: id,
      sha256: hash,
      candidate,
    }),
    true,
    true,
  );
  await validateTaskCandidate({ id, revision: 3 });
  const r = snapshot().candidateReviews!.find((v) => v.taskId === id)!;
  const input = {
    reviewId: r.id,
    reviewRevision: r.revision,
    taskRevision: 3,
    candidateHash: hash,
  };
  decideCandidate({
    ...input,
    decision: "accept-for-tests",
    confirmReviewed: true,
  });
  input.reviewRevision++;
  await runReviewedCandidateTests({ ...input, confirmIsolatedRun: true });
  await verifyReviewedCandidate({ ...input, confirmIndependent: true });
  const v = snapshot().candidateVerifications!.find((v) => v.taskId === id)!;
  const pkgInput = { ...input, verificationId: v.id };
  const preview = previewCandidatePackage(pkgInput);
  stageCandidatePackage({
    ...pkgInput,
    previewHash: preview.manifestHash,
    confirmStage: true,
  });
  return snapshot().candidatePackages!.find((p) => p.taskId === id)!;
}
function activate(pkg: any, bindingRevision = 0) {
  const i = {
    scope: "Personal",
    packageId: pkg.id,
    packageRevision: pkg.revision,
    bindingRevision,
  };
  const p = previewUtilityActivation(i);
  activateUtility({
    ...i,
    previewHash: p.previewHash,
    confirmActivation: true,
  });
  return p;
}
test("built-in formatter is the default and validates decimal input", async () =>
  isolated(async () => {
    expect(
      (await runUsdUtility({ scope: "Personal", amount: "12.50" })).text,
    ).toBe("$12.50");
    expect(
      (await runUsdUtility({ scope: "Personal", amount: "-0" })).text,
    ).toBe("-$0.00");
    for (const amount of ["", "Infinity", "0xFF", "garbage", {}])
      await expect(
        runUsdUtility({ scope: "Personal", amount }),
      ).rejects.toThrow(/decimal/);
    expect(snapshot().utilityBindings).toHaveLength(0);
  }));
test("preview and exact approval activate only the isolated package", async () =>
  isolated(async () => {
    const pkg = await staged();
    const input = {
      scope: "Personal",
      packageId: pkg.id,
      packageRevision: 0,
      bindingRevision: 0,
    };
    const p = previewUtilityActivation(input);
    expect(() =>
      activateUtility({ ...input, previewHash: p.previewHash }),
    ).toThrow(/confirm/);
    expect(() =>
      activateUtility({
        ...input,
        previewHash: "bad",
        confirmActivation: true,
      }),
    ).toThrow(/changed/);
    activateUtility({
      ...input,
      previewHash: p.previewHash,
      confirmActivation: true,
    });
    const result = await runUsdUtility({
      scope: "Personal",
      amount: "1234.50",
    });
    expect(result.text).toBe("$1,234.50");
    expect(result.source).toBe("isolated-package");
    expect(snapshot().candidatePackages![0].manifestHash).toBe(
      pkg.manifestHash,
    );
    expect(snapshot().skills[0].status).toBe("draft");
    expect(snapshot().tasks[0].state).toBe("waiting");
    expect(() =>
      activateUtility({
        ...input,
        previewHash: p.previewHash,
        confirmActivation: true,
      }),
    ).toThrow(/changed/);
  }));
test("activation is scoped and stale package revisions are rejected", async () =>
  isolated(async () => {
    const pkg = await staged();
    expect(() =>
      previewUtilityActivation({
        scope: "Co-hosting",
        packageId: pkg.id,
        packageRevision: 0,
        bindingRevision: 0,
      }),
    ).toThrow(/workspace/);
    expect(() =>
      previewUtilityActivation({
        scope: "Personal",
        packageId: pkg.id,
        packageRevision: 9,
        bindingRevision: 0,
      }),
    ).toThrow(/revision/);
    activate(pkg);
    expect(
      (await runUsdUtility({ scope: "Co-hosting", amount: 12 })).source,
    ).toBe("built-in");
  }));
test("two versions can switch, roll back, then return to baseline", async () =>
  isolated(async () => {
    const a = await staged("A"),
      b = await staged("B");
    activate(a);
    activate(b, 1);
    expect(snapshot().utilityBindings![0].previousPackageId).toBe(a.id);
    changeUtilityBinding({
      scope: "Personal",
      bindingRevision: 2,
      action: "rollback",
      confirmChange: true,
    });
    expect(snapshot().utilityBindings![0].packageId).toBe(a.id);
    expect(
      (await runUsdUtility({ scope: "Personal", amount: 12 })).source,
    ).toBe("isolated-package");
    changeUtilityBinding({
      scope: "Personal",
      bindingRevision: 3,
      action: "disable",
      confirmChange: true,
    });
    expect(
      (await runUsdUtility({ scope: "Personal", amount: 12 })).source,
    ).toBe("built-in");
    expect(snapshot().utilityHistory!.map((h) => h.kind)).toEqual([
      "disable",
      "rollback",
      "activate",
      "activate",
    ]);
  }));
test("revocation disables active bindings and clears rollback targets", async () =>
  isolated(async () => {
    const a = await staged("A"),
      b = await staged("B");
    activate(a);
    activate(b, 1);
    revokeCandidatePackage({
      packageId: a.id,
      packageRevision: 0,
      confirmRevoke: true,
    });
    expect(snapshot().utilityBindings![0].previousPackageId).toBeNull();
    expect(snapshot().utilityBindings![0].packageId).toBe(b.id);
    revokeCandidatePackage({
      packageId: b.id,
      packageRevision: 0,
      confirmRevoke: true,
    });
    expect(snapshot().utilityBindings![0].packageId).toBeNull();
    expect(
      (await runUsdUtility({ scope: "Personal", amount: 12 })).source,
    ).toBe("built-in");
  }));
test("tampered archives and rejected approvals block activation", async () =>
  isolated(async () => {
    const pkg = await staged();
    withStore((db) =>
      db
        .prepare("UPDATE candidate_packages SET manifest=? WHERE id=?")
        .run("{}", pkg.id),
    );
    expect(() => activate(pkg)).toThrow(/integrity/);
  }));
test("runtime rejects a defect outside sampled cases without falling back silently", async () =>
  isolated(async () => {
    const pkg = await staged(
      "latent defect",
      "Personal",
      source.replace(
        "return f.format(n)",
        'if(n===777.77)return "WRONG";return f.format(n)',
      ),
    );
    activate(pkg);
    const r = await runUsdUtility({ scope: "Personal", amount: "777.77" });
    expect(r.state).toBe("error");
    expect(r.text).toBeUndefined();
    expect(snapshot().utilityBindings![0].packageId).toBe(pkg.id);
    changeUtilityBinding({
      scope: "Personal",
      bindingRevision: 1,
      action: "disable",
      confirmChange: true,
    });
    expect(
      (await runUsdUtility({ scope: "Personal", amount: "777.77" })).text,
    ).toBe("$777.77");
  }));
test("binding changes discard in-flight output and deletion cannot remove active code", async () =>
  isolated(async () => {
    const pkg = await staged();
    activate(pkg);
    expect(() => deleteTask({ id: pkg.taskId, revision: 3 })).toThrow(
      /binding/,
    );
    const pending = runUsdUtility({ scope: "Personal", amount: 12 });
    changeUtilityBinding({
      scope: "Personal",
      bindingRevision: 1,
      action: "disable",
      confirmChange: true,
    });
    const result = await pending;
    expect(result.state).toBe("stale");
    expect(result.text).toBeUndefined();
    deleteTask({ id: pkg.taskId, revision: 3 });
    expect(snapshot().candidatePackages).toHaveLength(0);
  }));
test("draft changes do not replace an archived active version; newer failed evidence blocks use", async () =>
  isolated(async () => {
    const pkg = await staged();
    activate(pkg);
    changeTask({ id: pkg.taskId, revision: 3, action: "pause" });
    expect(
      (await runUsdUtility({ scope: "Personal", amount: 12 })).source,
    ).toBe("isolated-package");
    withStore((db) =>
      db.exec("UPDATE candidate_verifications SET state='failed'"),
    );
    await expect(
      runUsdUtility({ scope: "Personal", amount: 12 }),
    ).rejects.toThrow(/evidence|verification/);
    changeUtilityBinding({
      scope: "Personal",
      bindingRevision: 1,
      action: "disable",
      confirmChange: true,
    });
    expect(
      (await runUsdUtility({ scope: "Personal", amount: 12 })).source,
    ).toBe("built-in");
  }));
test("schema-5 migration preserves archives without activating; restart keeps bindings but interrupts calls", async () =>
  isolated(async (dir) => {
    const pkg = await staged();
    withStore((db) =>
      db.exec(
        "DROP TABLE utility_bindings;DROP TABLE utility_binding_history;DROP TABLE utility_runs;PRAGMA user_version=5;",
      ),
    );
    expect(snapshot().candidatePackages![0].id).toBe(pkg.id);
    expect(snapshot().utilityBindings).toHaveLength(0);
    expect(
      (await readdir(path.join(dir, "foundation-backups"))).some((n) =>
        n.startsWith("before-schema-6-"),
      ),
    ).toBe(true);
    activate(pkg);
    const pending = runUsdUtility({ scope: "Personal", amount: 12 });
    recoverTasks();
    await expect(pending).rejects.toThrow(/interrupted/);
    expect(snapshot().utilityBindings![0].packageId).toBe(pkg.id);
    expect(snapshot().utilityRuns![0].state).toBe("interrupted");
    expect((await runUsdUtility({ scope: "Personal", amount: 12 })).state).toBe(
      "passed",
    );
  }));

test("a new unaccepted or rejected review blocks an active artifact", async () =>
  isolated(async () => {
    const pkg = await staged();
    activate(pkg);
    await validateTaskCandidate({ id: pkg.taskId, revision: 3 });
    await expect(
      runUsdUtility({ scope: "Personal", amount: 12 }),
    ).rejects.toThrow(/evidence/);
    changeUtilityBinding({
      scope: "Personal",
      bindingRevision: 1,
      action: "disable",
      confirmChange: true,
    });
    expect(
      (await runUsdUtility({ scope: "Personal", amount: 12 })).source,
    ).toBe("built-in");
  }));
