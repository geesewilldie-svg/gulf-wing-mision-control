import { test, expect } from "@playwright/test";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  executeCandidateTests,
  runReviewedCandidateTests,
} from "../lib/server/foundation/candidate-tests";
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
  summary: "USD candidate",
  files: [
    {
      path: "src/currency.ts",
      content:
        'const usd=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2});export function formatCurrency(n:number){if(!Number.isFinite(n))throw new RangeError("Amount must be finite");return usd.format(n)}',
    },
    {
      path: "tests/currency.test.ts",
      content:
        'import {test} from "node:test";import {strict as assert} from "node:assert";import {formatCurrency} from "../src/currency.js";test("grouping",()=>assert.equal(formatCurrency(1234.5),"$1,234.50"));test("rounding",()=>assert.equal(formatCurrency(1.239),"$1.24"));test("negative",()=>assert.equal(formatCurrency(-12),"-$12.00"));test("invalid",()=>assert.throws(()=>formatCurrency(NaN),RangeError));',
    },
  ],
  testNotes: "Supplied tests",
};
function code(source: string) {
  return {
    ...candidate,
    files: [{ path: "tests/limited.test.ts", content: source }],
  };
}
async function isolated(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "nexus-tests-")),
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
function seed() {
  const id = createTask({
    request: "USD tests",
    scope: "Personal",
    mode: "development",
  });
  changeTask({ id, revision: 0, action: "queue" });
  const t = claimNext()!;
  finishTask(
    t,
    JSON.stringify({
      schemaVersion: 1,
      parentTaskId: id,
      sha256: createHash("sha256")
        .update(JSON.stringify(candidate))
        .digest("hex"),
      candidate,
    }),
    true,
    true,
  );
  return snapshot().tasks[0];
}
async function accept() {
  const t = seed();
  await validateTaskCandidate({ id: t.id, revision: t.revision });
  const r = snapshot().candidateReviews![0];
  decideCandidate({
    reviewId: r.id,
    reviewRevision: r.revision,
    taskRevision: t.revision,
    candidateHash: r.candidateHash,
    decision: "accept-for-tests",
    confirmReviewed: true,
  });
  return {
    reviewId: r.id,
    reviewRevision: r.revision + 1,
    taskRevision: t.revision,
    candidateHash: r.candidateHash,
    confirmIsolatedRun: true,
  };
}
test("currency candidate executes four supplied tests in WASM without installation", async () => {
  const r = await executeCandidateTests(candidate);
  expect(r.state).toBe("passed");
  expect(r.passed).toBe(4);
  expect(r.failed).toBe(0);
  expect(r.filesystem).toBe("unavailable");
  expect(r.network).toBe("unavailable");
  expect(r.installation).toBe("not-performed");
});
test("assertion failures are failures, not a successful empty run", async () => {
  const r = await executeCandidateTests(
    code(
      'import test from "node:test";import assert from "node:assert/strict";test("wrong",()=>assert.equal(1,2));',
    ),
  );
  expect(r.state).toBe("failed");
  expect(r.failed).toBe(1);
  await expect(
    executeCandidateTests(code("export const n=1;")),
  ).rejects.toThrow(/No completed/);
});
for (const module of [
  "node:fs",
  "node:child_process",
  "node:http",
  "https://outside.invalid/script.js",
  "/etc/passwd",
  "../../outside.js",
  "nexus:private",
])
  test("isolated loader blocks " + module, async () => {
    await expect(
      executeCandidateTests(code(`import ${JSON.stringify(module)};`)),
    ).rejects.toThrow(/allowed|outside|unsupported|unavailable/);
  });
test("host globals and CommonJS escape are unavailable", async () => {
  const r = await executeCandidateTests(
    code(
      'import test from "node:test";import assert from "node:assert/strict";test("no host",()=>{assert.equal(typeof process,"undefined");assert.equal(typeof require,"undefined");assert.equal(typeof fetch,"undefined");assert.equal(typeof setTimeout,"undefined");assert.equal(typeof Buffer,"undefined");assert.equal(typeof __nexus_format_usd,"undefined");assert.equal(Function("return typeof process")(),"undefined");});',
    ),
  );
  expect(r.state).toBe("passed");
});
test("runaway code is interrupted and async tests fail explicitly", async () => {
  await expect(executeCandidateTests(code("while(true) {}"))).rejects.toThrow(
    /interrupted|budget/,
  );
  const r = await executeCandidateTests(
    code('import test from "node:test";test("async",async()=>1);'),
  );
  expect(r.state).toBe("failed");
  expect(r.tests[0].detail).toContain("Async");
});
test("review consent/hash gates execution and passing leaves waiting/draft records", async () =>
  isolated(async () => {
    const input = await accept();
    await expect(
      runReviewedCandidateTests({ ...input, confirmIsolatedRun: false }),
    ).rejects.toThrow(/Confirm/);
    await expect(
      runReviewedCandidateTests({ ...input, candidateHash: "wrong" }),
    ).rejects.toThrow(/review/);
    await runReviewedCandidateTests(input);
    const s = snapshot();
    expect(s.candidateTestRuns![0].state).toBe("passed");
    expect(s.candidateTestRuns![0].report.passed).toBe(4);
    expect(s.tasks[0].state).toBe("waiting");
    expect(s.skills[0].status).toBe("draft");
    withStore((db) => db.exec("UPDATE tasks SET revision=revision+1"));
    await expect(runReviewedCandidateTests(input)).rejects.toThrow(/changed/);
  }));
test("restart interrupts test evidence, and schema-3 migration backs up accepted review", async () =>
  isolated(async (dir) => {
    await accept();
    const review = snapshot().candidateReviews![0];
    withStore((db) =>
      db.exec(
        "DROP TABLE candidate_packages; DROP TABLE candidate_verifications; DROP TABLE candidate_test_runs; PRAGMA user_version=3;",
      ),
    );
    expect(snapshot().candidateReviews![0].id).toBe(review.id);
    expect(
      (await readdir(path.join(dir, "foundation-backups"))).some((n) =>
        n.startsWith("before-schema-4-"),
      ),
    ).toBe(true);
    withStore((db) =>
      db
        .prepare(
          "INSERT INTO candidate_test_runs VALUES('interrupted-fixture',?,?,?,?, 'running','{}',?,?)",
        )
        .run(
          review.taskId,
          review.taskRevision,
          review.id,
          review.candidateHash,
          new Date().toISOString(),
          new Date().toISOString(),
        ),
    );
    recoverTasks();
    expect(snapshot().candidateTestRuns![0].state).toBe("interrupted");
  }));
test("aborted isolated run cannot return passing evidence", async () => {
  const abort = new AbortController();
  const pending = executeCandidateTests(code("while(true) {}"), abort.signal);
  abort.abort();
  await expect(pending).rejects.toThrow(/cancelled/);
});

test("changed task makes an in-flight test result stale", async () =>
  isolated(async () => {
    const input = await accept();
    const pending = runReviewedCandidateTests(input);
    withStore((db) => db.exec("UPDATE tasks SET revision=revision+1"));
    await pending;
    expect(snapshot().candidateTestRuns![0].state).toBe("stale");
    expect(snapshot().skills[0].status).toBe("draft");
  }));
test("memory exhaustion and top-level await do not produce passing reports", async () => {
  await expect(
    executeCandidateTests(
      code('const a=[];while(true){a.push(new Array(10000).fill("memory"))}'),
    ),
  ).rejects.toThrow();
  await expect(
    executeCandidateTests(
      code(
        'import test from "node:test";test("before await",()=>{});await new Promise(()=>{});',
      ),
    ),
  ).rejects.toThrow(/Async/);
});

test("throws supports exact name/message matcher and rejects mismatches", async () => {
  const passing = await executeCandidateTests(
    code(
      'import test from "node:test";import assert from "node:assert/strict";test("matches",()=>assert.throws(()=>{throw new RangeError("finite")},{name:"RangeError",message:"finite"}));',
    ),
  );
  expect(passing.state).toBe("passed");
  const failing = await executeCandidateTests(
    code(
      'import test from "node:test";import assert from "node:assert/strict";test("does not match",()=>assert.throws(()=>{throw new Error("wrong")},{name:"RangeError",message:"finite"}));',
    ),
  );
  expect(failing.state).toBe("failed");
});
