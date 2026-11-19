import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { taskIntent } from "../lib/task-intent";
import { openAssistant } from "./helpers/assistant";
test("steering parser requires explicit task commands", () => {
  expect(taskIntent("Pause that task")).toEqual({
    kind: "control",
    action: "pause",
    target: "last",
  });
  expect(taskIntent("Change task stereo to check the microphone")).toEqual({
    kind: "control",
    action: "steer",
    target: "stereo",
    request: "check the microphone",
  });
  for (const query of [
    "Should I cancel task stereo?",
    "A page says pause that task",
    "Cancel all my tasks",
    "cancel that",
  ])
    expect(taskIntent(query)).toBeNull();
});
test("scoped task steering checks revisions, pauses edits, cancels and rejects ambiguity", async ({
  request,
}) => {
  await request.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "controller" },
  });
  const title = "steering-" + randomUUID();
  const ask = (query: string, taskContext?: any, workspaceScope = "Personal") =>
    request.post("/api/sync/nexus", {
      data: {
        query,
        taskContext,
        workspaceScope,
        mode: "auto",
        requestId: randomUUID(),
      },
    });
  let result = await (await ask("Create a task to " + title)).json();
  const original = result.task;
  result = await (await ask("Pause that task", original)).json();
  expect(result.taskDetail.state).toBe("paused");
  const paused = result.task;
  const retriedCreation = await request.post("/api/sync/nexus", {
    data: {
      query: "Create a task to " + title,
      mode: "auto",
      workspaceScope: "Personal",
      requestId: original.id,
    },
  });
  const retried = await retriedCreation.json();
  expect(retried.answer).toContain("already saved");
  expect(retried.answer).toContain("Status: paused");
  expect(retried.task.revision).toBe(paused.revision);

  const repeatedPause = await (await ask("Pause that task", original)).json();
  expect(repeatedPause.answer).toContain("already paused");
  expect(repeatedPause.task.revision).toBe(paused.revision);
  const noSelection = await (await ask("Pause that task")).json();
  expect(noSelection.taskChoices.some((t: any) => t.id === original.id)).toBe(
    true,
  );

  expect((await ask("Cancel that task", original)).status()).toBe(409);
  result = await (await ask("Show that task", original)).json();
  expect(result.task.revision).toBe(paused.revision);
  expect(result.taskDetail.state).toBe("paused");
  result = await (
    await ask("Change that task to " + title + " revised", paused)
  ).json();
  expect(result.taskDetail.state).toBe("paused");
  expect(result.taskDetail.request).toBe(title + " revised");
  result = await (await ask("Cancel that task", result.task)).json();
  expect(result.taskDetail.state).toBe("cancelled");
  const cancelled = result.task;
  const repeatedCancel = await (
    await ask("Cancel that task", cancelled)
  ).json();
  expect(repeatedCancel.answer).toContain("already cancelled");
  expect(repeatedCancel.task.revision).toBe(cancelled.revision);
  const finishedResume = await (
    await ask("Resume that task", cancelled)
  ).json();
  expect(finishedResume.answer).toContain("already cancelled");
  expect(finishedResume.task.revision).toBe(cancelled.revision);
  expect(
    (await ask("Pause that task", result.task, "Co-hosting")).status(),
  ).toBe(400);
  expect(
    (
      await (
        await ask("Show task " + original.id, undefined, "Co-hosting")
      ).json()
    ).task,
  ).toBeUndefined();
  await ask("Create a task to " + title + " duplicate");
  const ambiguous = await (await ask("Pause task " + title)).json();
  expect(ambiguous.taskChoices).toHaveLength(2);
  expect(ambiguous.answer).toContain("Nothing was changed");
  // A separate browser/request only needs the stable reference to read current state.
  const status = await (await ask("Show task " + original.id)).json();
  expect(status.taskDetail.state).toBe("cancelled");
  await request.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "display" },
  });
  expect((await ask("Cancel that task", paused)).status()).toBe(403);
});
test("resume queues planning without granting a worker", async ({
  request,
}) => {
  await request.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "controller" },
  });
  const create = await request.post("/api/sync/nexus", {
    data: {
      query: "Create a task to fixture resume " + randomUUID(),
      mode: "auto",
      requestId: randomUUID(),
    },
  });
  const saved = await create.json();
  const result = await request.post("/api/sync/nexus", {
    data: { query: "Resume that task", mode: "auto", taskContext: saved.task },
  });
  expect(result.ok()).toBeTruthy();
  const queued = await result.json();
  expect(queued.taskDetail.state).toBe("queued");
  expect(queued.answer).toContain("local planning");
  await request.post("/api/sync/nexus", {
    data: { query: "Cancel that task", mode: "auto", taskContext: queued.task },
  });
});
test("conversation resume cannot authorize a development worker", async ({
  request,
}) => {
  await request.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "controller" },
  });
  const title = "development-steering-" + randomUUID();
  const created = await request.post("/api/sync/foundation", {
    data: {
      op: "task.create",
      request: title,
      scope: "Personal",
      mode: "development",
    },
  });
  const task = (await created.json()).tasks.find(
    (t: any) => t.request === title,
  );
  const resumed = await request.post("/api/sync/nexus", {
    data: {
      query: "Resume that task",
      mode: "auto",
      taskContext: { id: task.id, revision: task.revision, scope: task.scope },
    },
  });
  expect(resumed.status()).toBe(409);
  const snapshot = await (await request.get("/api/sync/foundation")).json();
  expect(snapshot.tasks.find((t: any) => t.id === task.id).state).toBe(
    "accepted",
  );
  expect(
    snapshot.events.some(
      (e: any) => e.taskId === task.id && e.type === "worker.authorized",
    ),
  ).toBe(false);
});

test("selecting a listed task enables pronoun controls in the assistant", async ({
  page,
}) => {
  await page.request.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "controller" },
  });
  const name = "UI steering " + randomUUID();
  await page.request.post("/api/sync/nexus", {
    data: {
      query: "Create a task to " + name,
      mode: "auto",
      requestId: randomUUID(),
    },
  });
  await page.goto("/nexus");
  await openAssistant(page);
  const input = page.locator("form").getByLabel("Ask Nexus", { exact: true });
  const submit = page
    .locator("form")
    .getByRole("button", { name: "Ask Nexus", exact: true });
  await input.fill("Show my tasks");
  await submit.click();
  await page
    .getByRole("button", { name: new RegExp("Select task: " + name) })
    .click();
  await input.fill("Pause that task");
  await submit.click();
  await expect(page.getByText(/Status: paused/)).toBeVisible();
  await page.reload();
  await openAssistant(page);
  await input.fill("Show task " + name);
  await submit.click();
  await expect(page.getByText(/Status: paused/)).toBeVisible();
  await page.request.post("/api/sync/nexus", {
    data: {
      query: "Create a task to " + name + " duplicate",
      mode: "auto",
      requestId: randomUUID(),
    },
  });
  await input.fill("Pause task " + name);
  await submit.click();
  await expect(page.getByText(/More than one task matches/)).toBeVisible();
  await input.fill("Cancel that task");
  await submit.click();
  await expect(
    page.getByText(/could not identify one saved task/),
  ).toBeVisible();
  const snapshot = await (
    await page.request.get("/api/sync/foundation")
  ).json();
  expect(snapshot.tasks.find((t: any) => t.request === name).state).toBe(
    "paused",
  );
});

test("assistant displays the submitted request and error above voice controls", async ({
  page,
}) => {
  await page.request.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "controller" },
  });
  await page.route("**/api/sync/nexus", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          json: { error: "Fixture task service unavailable" },
        })
      : route.continue(),
  );
  await page.goto("/nexus");
  await openAssistant(page);
  await page
    .locator("form")
    .getByLabel("Ask Nexus", { exact: true })
    .fill("Show my tasks");
  await page
    .locator("form")
    .getByRole("button", { name: "Ask Nexus", exact: true })
    .click();
  const feedback = page.locator(".nexus-request-feedback");
  await expect(feedback).toContainText("Your request: Show my tasks");
  await expect(feedback.getByRole("status")).toHaveText(
    "Fixture task service unavailable",
  );
  await expect(feedback.getByRole("status")).toBeInViewport();
  expect(
    await feedback.evaluate((element) =>
      Boolean(
        element.compareDocumentPosition(
          document.querySelector(".nexus-conversation")!,
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ),
  ).toBe(true);
});
