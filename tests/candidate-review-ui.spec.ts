import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import {
  createTask,
  withStore,
  snapshot,
} from "../lib/server/foundation/store";
import { fixtureRole } from "./helpers/access";
function seed() {
  const old = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = process.env.GW_SYNC_TEST_ROOT!;
  try {
    const candidate = {
      summary: "Review UI fixture",
      files: [
        {
          path: "src/ui-value.ts",
          content: "export const value: number = 42;",
        },
        {
          path: "tests/ui.test.ts",
          content:
            'import test from "node:test";import assert from "node:assert/strict";import {value} from "../src/ui-value.js";test("value",()=>assert.equal(value,42));',
        },
      ],
      testNotes: "Not run",
    };
    const id = createTask({
      request: "Review fixture " + test.info().project.name,
      scope: "Personal",
      mode: "development",
    });
    // Seed a saved result directly in the disposable test database; never queue
    // a provider job or race the background coordinator for this UI fixture.
    const output = JSON.stringify({
      schemaVersion: 1,
      parentTaskId: id,
      sha256: createHash("sha256")
        .update(JSON.stringify(candidate))
        .digest("hex"),
      candidate,
    });
    withStore((db) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(
          "UPDATE tasks SET revision=3,state='waiting',output=? WHERE id=?",
        ).run(output, id);
        db.prepare("INSERT INTO skills VALUES(?,?,?,'draft')").run(
          "draft-" + id,
          id,
          "Synthetic review fixture",
        );
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    });
    return snapshot().tasks.find((t) => t.id === id)!;
  } finally {
    if (old === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = old;
  }
}
test("controller reviews a saved candidate without another provider attempt", async ({
  page,
  context,
}) => {
  const task = seed();
  await fixtureRole(context);
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Foundation", exact: true }).click();
  const card = page.getByRole("article", { name: "Task: " + task.request });
  await card
    .getByRole("button", { name: "Validate saved candidate", exact: true })
    .click();
  await expect(card.getByText(/checks-passed · task revision/)).toBeVisible();
  const accept = card.getByRole("button", {
    name: "Accept for isolated testing",
    exact: true,
  });
  await expect(accept).toBeDisabled();
  await card
    .getByLabel("I reviewed this exact saved artifact and report.")
    .check();
  await accept.click();
  await expect(
    card.getByText(/accepted-for-tests · task revision/),
  ).toBeVisible();
  await expect(accept).toBeDisabled();
  await expect(
    card.getByText(
      "Static validation: type check passed. Tests were not run during this check.",
      { exact: true },
    ),
  ).toBeVisible();
  const saved = await (
    await context.request.get("/api/sync/foundation")
  ).json();
  expect(saved.tasks.find((t: any) => t.id === task.id).state).toBe("waiting");
  expect(saved.skills.find((s: any) => s.taskId === task.id).status).toBe(
    "draft",
  );
  const run = card.getByRole("button", {
    name: "Run isolated tests",
    exact: true,
  });
  await expect(run).toBeDisabled();
  await card
    .getByLabel("I approve one isolated test run of this exact candidate.")
    .check();
  await run.click();
  await expect(
    card.getByText("Isolated tests: passed · 1 passed · 0 failed", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(run).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: "Foundation", exact: true }).click();
  await expect(
    card.getByText(/accepted-for-tests · task revision/),
  ).toBeVisible();
  await expect(
    card.getByText("Isolated tests: passed · 1 passed · 0 failed", {
      exact: true,
    }),
  ).toBeVisible();
});
test("candidate operations reject display-only and cross-origin requests", async ({
  context,
}) => {
  await fixtureRole(context, "display");
  expect(
    (
      await context.request.post("/api/sync/foundation", {
        data: { op: "candidate.validate", id: "unused", revision: 3 },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post("/api/sync/foundation", {
        data: { op: "candidate.test", reviewId: "unused" },
      })
    ).status(),
  ).toBe(403);
  await fixtureRole(context, "controller");
  expect(
    (
      await context.request.post("/api/sync/foundation", {
        headers: { origin: "https://outside.invalid" },
        data: { op: "candidate.decide" },
      })
    ).status(),
  ).toBe(403);
});
