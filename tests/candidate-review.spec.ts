import { test, expect } from "@playwright/test";
import { mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  checkCandidate,
  savedCandidate,
} from "../lib/server/foundation/candidate-validation";
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
} from "../lib/server/foundation/store";
const candidate = {
  summary: "Currency candidate",
  files: [
    {
      path: "src/currency.ts",
      content:
        'export const usd = (n: number) => new Intl.NumberFormat("en-US", {style:"currency",currency:"USD"}).format(n);',
    },
    {
      path: "tests/currency.test.ts",
      content:
        'import { test } from "node:test"; import { strict as assert } from "node:assert"; import { usd } from "../src/currency.js"; test("currency", () => assert.equal(usd(12), "$12.00"));',
    },
  ],
  testNotes: "Tests not run",
};
async function isolated(fn: () => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "nexus-review-")),
    old = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    await fn();
  } finally {
    if (old === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = old;
    await rm(dir, { recursive: true, force: true });
  }
}
function seed() {
  const id = createTask({
    request: "Currency",
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
  return snapshot().tasks.find((t) => t.id === id)!;
}
test("compiler typechecks supplied tests without executing candidate initializers", async () => {
  const marker = path.join(tmpdir(), "nexus-must-not-execute-" + Date.now());
  const report = await checkCandidate({
    ...candidate,
    files: [
      ...candidate.files,
      {
        path: "src/side-effect.ts",
        content: `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "executed");`,
      },
    ],
  });
  expect(report.typecheck).toBe("passed");
  expect(report.tests).toBe("not-run");
  expect(report.risks.length).toBeGreaterThan(0);
  await expect(access(marker)).rejects.toThrow();
});
test("compiler rejects type errors and unavailable imports", async () => {
  const report = await checkCandidate({
    ...candidate,
    files: [
      {
        path: "src/error.ts",
        content:
          'import secret from "../../private-secret"; export const n: number = "wrong";',
      },
    ],
  });
  expect(report.typecheck).toBe("failed");
  expect(report.diagnostics.length).toBeGreaterThan(0);
});
test("artifact identity and hash are checked", () => {
  expect(() =>
    savedCandidate(
      JSON.stringify({
        schemaVersion: 1,
        parentTaskId: "t",
        sha256: "wrong",
        candidate,
      }),
      "t",
    ),
  ).toThrow(/hash/);
});
test("review decisions bind exact revisions, remain draft and supersede earlier reports", async () =>
  isolated(async () => {
    const task = seed();
    await validateTaskCandidate({ id: task.id, revision: task.revision });
    let review = snapshot().candidateReviews![0];
    expect(review.state).toBe("checks-passed");
    const decision = {
      reviewId: review.id,
      reviewRevision: review.revision,
      taskRevision: task.revision,
      candidateHash: review.candidateHash,
      confirmReviewed: true,
      decision: "accept-for-tests",
    };
    decideCandidate(decision);
    expect(snapshot().candidateReviews![0].state).toBe("accepted-for-tests");
    expect(snapshot().tasks[0].state).toBe("waiting");
    expect(snapshot().skills[0].status).toBe("draft");
    expect(() => decideCandidate(decision)).toThrow(/revision/);
    await validateTaskCandidate({ id: task.id, revision: task.revision });
    expect(() =>
      decideCandidate({ ...decision, reviewRevision: review.revision + 1 }),
    ).toThrow(/newer/);
    review = snapshot().candidateReviews![0];
    withStore((db) => {
      db.prepare("UPDATE tasks SET revision=revision+1 WHERE id=?").run(
        task.id,
      );
    });
    expect(() =>
      decideCandidate({
        ...decision,
        reviewId: review.id,
        reviewRevision: review.revision,
      }),
    ).toThrow(/changed/);
  }));
test("restart interrupts checking reviews without replay", async () =>
  isolated(async () => {
    const task = seed();
    await validateTaskCandidate({ id: task.id, revision: task.revision });
    withStore((db) => db.exec("UPDATE candidate_reviews SET state='checking'"));
    recoverTasks();
    expect(snapshot().candidateReviews![0].state).toBe("interrupted");
  }));

test("failed reports cannot be accepted and schema-2 migration preserves tasks", async () =>
  isolated(async () => {
    const task = seed();
    withStore((db) =>
      db.exec("DROP TABLE candidate_reviews; PRAGMA user_version=2;"),
    );
    expect(snapshot().tasks[0].id).toBe(task.id);
    expect(
      withStore(
        (db) => (db.prepare("PRAGMA user_version").get() as any).user_version,
      ),
    ).toBe(3);
    await validateTaskCandidate({ id: task.id, revision: task.revision });
    const review = snapshot().candidateReviews![0];
    withStore((db) =>
      db
        .prepare("UPDATE candidate_reviews SET report=? WHERE id=?")
        .run(
          JSON.stringify({
            typecheck: "failed",
            tests: "not-run",
            codeExecution: "not-run",
          }),
          review.id,
        ),
    );
    expect(() =>
      decideCandidate({
        reviewId: review.id,
        reviewRevision: review.revision,
        taskRevision: task.revision,
        candidateHash: review.candidateHash,
        confirmReviewed: true,
        decision: "accept-for-tests",
      }),
    ).toThrow(/passing type check/);
  }));
