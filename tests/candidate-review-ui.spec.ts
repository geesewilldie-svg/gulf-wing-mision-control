import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import {
  createTask,
  withStore,
  snapshot,
} from "../lib/server/foundation/store";
import { fixtureRole } from "./helpers/access";
function seed(usd = false) {
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
    if (usd)
      candidate.files = [
        {
          path: "src/format-currency.ts",
          content:
            'const usd=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});export function formatCurrency(n:number){if(!Number.isFinite(n))throw new RangeError("finite");return usd.format(n)}',
        },
        {
          path: "tests/usd.test.ts",
          content:
            'import test from "node:test";import assert from "node:assert/strict";import {formatCurrency} from "../src/format-currency.js";test("USD",()=>assert.equal(formatCurrency(12),"$12.00"));',
        },
      ];
    const id = createTask({
      request:
        (usd ? "USD verification fixture " : "Review fixture ") +
        test.info().project.name,
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
  for (const op of [
    "candidate.verify",
    "candidate.package.preview",
    "candidate.package.stage",
    "candidate.package.revoke",
    "utility.preview",
    "utility.activate",
    "utility.change",
    "utility.run",
  ]) {
    expect(
      (
        await context.request.post("/api/sync/foundation", { data: { op } })
      ).status(),
    ).toBe(403);
  }
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

test("independent verification previews and stages only an inactive package, with revocation after task pause", async ({
  page,
  context,
}) => {
  const task = seed(true);
  await fixtureRole(context);
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Foundation", exact: true }).click();
  const card = page.getByRole("article", { name: "Task: " + task.request });
  await card
    .getByRole("button", { name: "Validate saved candidate", exact: true })
    .click();
  await expect(card.getByText(/checks-passed · task revision/)).toBeVisible();
  await card
    .getByLabel("I reviewed this exact saved artifact and report.")
    .check();
  await card
    .getByRole("button", { name: "Accept for isolated testing", exact: true })
    .click();
  await expect(
    card.getByText(/accepted-for-tests · task revision/),
  ).toBeVisible();
  await card
    .getByLabel("I approve one isolated test run of this exact candidate.")
    .check();
  await card
    .getByRole("button", { name: "Run isolated tests", exact: true })
    .click();
  await expect(
    card.getByText("Isolated tests: passed · 1 passed · 0 failed", {
      exact: true,
    }),
  ).toBeVisible();
  const verify = card.getByRole("button", {
    name: "Run independent verification",
    exact: true,
  });
  await expect(verify).toBeDisabled();
  await card
    .getByLabel(
      "I approve one independent USD contract check of this exact candidate.",
    )
    .check();
  await verify.click();
  await expect(
    card.getByText("Independent verification: passed · 15 passed · 0 failed", {
      exact: true,
    }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "Preview inactive package", exact: true })
    .click();
  const stage = card.getByRole("button", {
    name: "Stage inactive package",
    exact: true,
  });
  await expect(stage).toBeDisabled();
  await card
    .getByLabel("I approve storing this exact package as inactive.")
    .check();
  await stage.click();
  const inventory = page.getByRole("region", {
    name: "Inactive packages",
    exact: true,
  });
  await expect(inventory.getByText(/Package: inactive/)).toBeVisible();
  const state = await (
    await context.request.get("/api/sync/foundation")
  ).json();
  expect(state.tasks.find((t: any) => t.id === task.id).state).toBe("waiting");
  expect(state.skills.find((s: any) => s.taskId === task.id).status).toBe(
    "draft",
  );
  const pkgForActivation = state.candidatePackages.find(
    (p: any) => p.taskId === task.id,
  );
  const packageCard = inventory.getByRole("article", {
    name: "Package: " + pkgForActivation.id,
    exact: true,
  });
  await packageCard
    .getByRole("button", { name: "Preview isolated activation", exact: true })
    .click();
  const activate = inventory.getByRole("button", {
    name: "Activate isolated USD utility",
    exact: true,
  });
  await expect(activate).toBeDisabled();
  await inventory
    .getByLabel("I approve this exact isolated activation.")
    .check();
  await activate.click();
  await expect(
    inventory.getByText(/USD tool: isolated package active/),
  ).toBeVisible();
  await expect(
    card.getByText(
      "Verified package selected for isolated utility use. Original task source is unchanged.",
      { exact: true },
    ),
  ).toBeVisible();
  await inventory.getByLabel("USD amount", { exact: true }).fill("1234.50");
  await inventory
    .getByRole("button", { name: "Format USD", exact: true })
    .click();
  await expect(
    inventory.getByText("Formatted USD: $1,234.50 · isolated package", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Foundation", exact: true }).click();
  await expect(
    inventory.getByText(/USD tool: isolated package active/),
  ).toBeVisible();
  await inventory
    .getByRole("button", {
      name: "Roll back to built-in formatter",
      exact: true,
    })
    .click();
  await expect(
    inventory.getByText(/USD tool: built-in formatter/),
  ).toBeVisible();
  await inventory
    .getByRole("button", { name: "Format USD", exact: true })
    .click();
  await expect(
    inventory.getByText("Formatted USD: $12.50 · built-in formatter", {
      exact: true,
    }),
  ).toBeVisible();
  await packageCard
    .getByRole("button", { name: "Preview isolated activation", exact: true })
    .click();
  await inventory
    .getByLabel("I approve this exact isolated activation.")
    .check();
  await inventory
    .getByRole("button", { name: "Activate isolated USD utility", exact: true })
    .click();
  expect(
    (
      await context.request.post("/api/sync/foundation", {
        data: {
          op: "task.change",
          id: task.id,
          revision: task.revision,
          action: "pause",
        },
      })
    ).ok(),
  ).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Foundation", exact: true }).click();
  const pkg = state.candidatePackages.find((p: any) => p.taskId === task.id);
  const stored = inventory.getByRole("article", {
    name: "Package: " + pkg.id,
    exact: true,
  });
  await stored
    .getByRole("button", { name: "Revoke inactive package", exact: true })
    .click();
  await expect(stored.getByText(/Package: revoked/)).toBeVisible();
  await expect(
    inventory.getByText(/USD tool: built-in formatter/),
  ).toBeVisible();
});
