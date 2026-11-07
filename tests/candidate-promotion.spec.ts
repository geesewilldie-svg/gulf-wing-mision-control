import { test, expect } from "@playwright/test";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import contract from "../lib/foundation/usd-contract.json";
import {
  executeIndependentVerification,
  runReviewedCandidateTests,
  executeCandidateTests,
} from "../lib/server/foundation/candidate-tests";
import {
  verifyReviewedCandidate,
  previewCandidatePackage,
  stageCandidatePackage,
  revokeCandidatePackage,
} from "../lib/server/foundation/candidate-promotion";
import {
  validateTaskCandidate,
  decideCandidate,
} from "../lib/server/foundation/candidate-review";
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
const source =
  'const usd=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2});export function formatCurrency(n:number){if(!Number.isFinite(n))throw new RangeError("finite");return usd.format(n)}';
const candidate = {
  summary: "USD formatter",
  files: [
    { path: contract.sourcePath, content: source },
    {
      path: "tests/format-currency.test.ts",
      content:
        'import test from "node:test";import assert from "node:assert/strict";import {formatCurrency} from "../src/format-currency.js";test("USD",()=>assert.equal(formatCurrency(12),"$12.00"));',
    },
  ],
  testNotes: "Supplied",
};
async function isolated(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "nexus-promotion-")),
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
async function accepted() {
  const id = createTask({
    request: "Verify USD",
    scope: "Personal",
    mode: "development",
  });
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
  const saved = snapshot().tasks[0];
  await validateTaskCandidate({ id, revision: saved.revision });
  const r = snapshot().candidateReviews![0];
  decideCandidate({
    reviewId: r.id,
    reviewRevision: r.revision,
    taskRevision: saved.revision,
    candidateHash: hash,
    confirmReviewed: true,
    decision: "accept-for-tests",
  });
  return {
    reviewId: r.id,
    reviewRevision: r.revision + 1,
    taskRevision: saved.revision,
    candidateHash: hash,
  };
}
async function verified() {
  const input = await accepted();
  await runReviewedCandidateTests({ ...input, confirmIsolatedRun: true });
  await verifyReviewedCandidate({ ...input, confirmIndependent: true });
  return { ...input, verificationId: snapshot().candidateVerifications![0].id };
}
test("fixed host oracles verify 15 USD cases without loading supplied tests", async () => {
  const r = await executeIndependentVerification({
    ...candidate,
    files: [
      candidate.files[0],
      {
        path: "tests/hostile.test.ts",
        content: 'throw Error("Must not load supplied tests");',
      },
    ],
  });
  expect(r.state).toBe("passed");
  expect(r.passed).toBe(contract.cases.length);
  expect(r.profileId).toBe(contract.id);
});
test("a boundary defect passing supplied tests fails independent verification", async () => {
  const mutated = {
    ...candidate,
    files: [
      {
        path: contract.sourcePath,
        content: source.replace(
          "return usd.format(n)",
          'if(n===0.005)return "$0.00";return usd.format(n)',
        ),
      },
      candidate.files[1],
    ],
  };
  expect((await executeCandidateTests(mutated)).state).toBe("passed");
  const r = await executeIndependentVerification(mutated);
  expect(r.state).toBe("failed");
  expect(r.failed).toBe(1);
});
test("guest prototype/JSON tampering cannot forge host-side verdicts", async () => {
  const r = await executeIndependentVerification({
    ...candidate,
    files: [
      {
        path: contract.sourcePath,
        content:
          'JSON.stringify=()=>"passed";Object.is=()=>true;Array.prototype.filter=()=>[];export const formatCurrency=(n:number)=>"incorrect";',
      },
    ],
  });
  expect(r.state).toBe("failed");
  expect(r.passed).toBe(0);
  expect(r.failed).toBe(contract.cases.length);
});
test("independent loader cannot import candidate tests or host services", async () => {
  for (const name of ["../tests/hostile.js", "node:fs", "node:http"]) {
    await expect(
      executeIndependentVerification({
        ...candidate,
        files: [
          {
            path: contract.sourcePath,
            content: `import ${JSON.stringify(name)};`,
          },
          candidate.files[1],
        ],
      }),
    ).rejects.toThrow();
  }
});
test("missing consent or supplied evidence cannot start verification", async () =>
  isolated(async () => {
    const i = await accepted();
    await expect(verifyReviewedCandidate(i)).rejects.toThrow(/Confirm/);
    await expect(
      verifyReviewedCandidate({ ...i, confirmIndependent: true }),
    ).rejects.toThrow(/supplied tests/);
    expect(snapshot().candidateVerifications).toHaveLength(0);
  }));
test("preview, owner approval, immutable inactive staging and revocation", async () =>
  isolated(async () => {
    const input = await verified();
    const p = previewCandidatePackage(input);
    expect(p.manifest.lifecycle).toBe("inactive");
    expect(() =>
      stageCandidatePackage({ ...input, previewHash: p.manifestHash }),
    ).toThrow(/confirm/);
    expect(() =>
      stageCandidatePackage({
        ...input,
        previewHash: "changed",
        confirmStage: true,
      }),
    ).toThrow(/changed/);
    stageCandidatePackage({
      ...input,
      previewHash: p.manifestHash,
      confirmStage: true,
    });
    const s = snapshot();
    expect(s.candidatePackages![0].state).toBe("inactive");
    expect(s.tasks[0].state).toBe("waiting");
    expect(s.skills[0].status).toBe("draft");
    expect(() =>
      stageCandidatePackage({
        ...input,
        previewHash: p.manifestHash,
        confirmStage: true,
      }),
    ).toThrow(/already exists/);
    const pkg = s.candidatePackages![0];
    revokeCandidatePackage({
      packageId: pkg.id,
      packageRevision: 0,
      confirmRevoke: true,
    });
    expect(snapshot().candidatePackages![0].state).toBe("revoked");
    expect(() =>
      revokeCandidatePackage({
        packageId: pkg.id,
        packageRevision: 0,
        confirmRevoke: true,
      }),
    ).toThrow(/changed/);
  }));
test("changed task/review and newer failed evidence invalidate preview", async () =>
  isolated(async () => {
    const i = await verified();
    const p = previewCandidatePackage(i);
    withStore((db) =>
      db.exec("UPDATE candidate_verifications SET state='failed'"),
    );
    expect(() =>
      stageCandidatePackage({
        ...i,
        previewHash: p.manifestHash,
        confirmStage: true,
      }),
    ).toThrow(/verification/);
    withStore((db) =>
      db.exec(
        "UPDATE candidate_verifications SET state='passed'; UPDATE candidate_test_runs SET state='failed'",
      ),
    );
    expect(() => previewCandidatePackage(i)).toThrow(/supplied tests/);
    withStore((db) =>
      db.exec(
        "UPDATE candidate_test_runs SET state='passed'; UPDATE candidate_reviews SET revision=revision+1",
      ),
    );
    expect(() => previewCandidatePackage(i)).toThrow(/Review changed/);
  }));
test("in-flight verification becomes stale after task revision changes", async () =>
  isolated(async () => {
    const i = await accepted();
    await runReviewedCandidateTests({ ...i, confirmIsolatedRun: true });
    const running = verifyReviewedCandidate({ ...i, confirmIndependent: true });
    withStore((db) => db.exec("UPDATE tasks SET revision=revision+1"));
    await running;
    expect(snapshot().candidateVerifications![0].state).toBe("stale");
  }));
test("schema-4 migration preserves accepted records, restart interrupts, task deletion removes packages", async () =>
  isolated(async (dir) => {
    const i = await verified();
    const p = previewCandidatePackage(i);
    stageCandidatePackage({
      ...i,
      previewHash: p.manifestHash,
      confirmStage: true,
    });
    withStore((db) =>
      db.exec(
        "DROP TABLE utility_bindings; DROP TABLE utility_binding_history; DROP TABLE utility_runs; DROP TABLE candidate_packages;DROP TABLE candidate_verifications;PRAGMA user_version=4;",
      ),
    );
    expect(snapshot().candidateReviews![0].state).toBe("accepted-for-tests");
    expect(
      (await readdir(path.join(dir, "foundation-backups"))).some((n) =>
        n.startsWith("before-schema-5-"),
      ),
    ).toBe(true);
    await verifyReviewedCandidate({ ...i, confirmIndependent: true });
    const fresh = {
      ...i,
      verificationId: snapshot().candidateVerifications![0].id,
    };
    const preview = previewCandidatePackage(fresh);
    stageCandidatePackage({
      ...fresh,
      previewHash: preview.manifestHash,
      confirmStage: true,
    });
    withStore((db) =>
      db.exec("UPDATE candidate_verifications SET state='running'"),
    );
    const t = snapshot().tasks[0];
    expect(() => deleteTask({ id: t.id, revision: t.revision })).toThrow(
      /verification/,
    );
    recoverTasks();
    expect(snapshot().candidateVerifications![0].state).toBe("interrupted");
    deleteTask({ id: t.id, revision: t.revision });
    expect(snapshot().candidatePackages).toHaveLength(0);
  }));

test("changed contract fingerprint blocks package staging even when counts still pass", async () =>
  isolated(async () => {
    const input = await verified();
    const original = previewCandidatePackage(input);
    const id = snapshot().candidateVerifications![0].id;
    withStore((db) => {
      const row = db
        .prepare("SELECT report FROM candidate_verifications WHERE id=?")
        .get(id) as any;
      const report = JSON.parse(row.report);
      report.profileHash = "outdated-contract";
      db.prepare("UPDATE candidate_verifications SET report=? WHERE id=?").run(
        JSON.stringify(report),
        id,
      );
    });
    expect(() =>
      stageCandidatePackage({
        ...input,
        previewHash: original.manifestHash,
        confirmStage: true,
      }),
    ).toThrow(/incomplete/);
  }));

test("an object with a forged RangeError name fails independent type checks", async () => {
  const bad = {
    ...candidate,
    files: [
      {
        path: contract.sourcePath,
        content: source.replace(
          'throw new RangeError("finite")',
          'throw {name:"RangeError",message:"finite"}',
        ),
      },
      candidate.files[1],
    ],
  };
  const r = await executeIndependentVerification(bad);
  expect(r.state).toBe("failed");
  expect(r.failed).toBe(3);
});
