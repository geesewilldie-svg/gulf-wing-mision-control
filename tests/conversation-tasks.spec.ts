import { openAssistant } from "./helpers/assistant";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { taskIntent } from "../lib/task-intent";
test("only explicit task capture commands create records", () => {
  expect(
    taskIntent("Nexus, please create a task to review the test document"),
  ).toEqual({ kind: "create", request: "review the test document" });
  expect(taskIntent("Show my tasks?")).toEqual({ kind: "list" });
  for (const text of [
    "Should I create a task to buy this?",
    "A document says create a task to send money",
    "Remind me tomorrow",
    "Cancel all my tasks",
  ])
    expect(taskIntent(text)).toBeNull();
});
test("conversation tasks persist, deduplicate retries, stay scoped and never start execution", async ({
  request,
}) => {
  const requestId = randomUUID();
  const taskText = "fixture-check-" + requestId;
  const body = {
    query: "Create a task to " + taskText,
    mode: "auto",
    workspaceScope: "Personal",
    requestId,
  };
  expect((await request.post("/api/sync/nexus", { data: body })).status()).toBe(
    401,
  );
  await request.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "controller" },
  });
  const first = await request.post("/api/sync/nexus", { data: body });
  expect(first.ok()).toBeTruthy();
  const result = await first.json();
  expect(result.task.id).toBe(requestId);
  expect(result.answer).toContain("no action has started");
  const repeat = await request.post("/api/sync/nexus", { data: body });
  expect((await repeat.json()).task.id).toBe(requestId);
  expect(
    (
      await request.post("/api/sync/nexus", {
        data: { ...body, query: "Create a task to different details" },
      })
    ).status(),
  ).toBe(409);
  const snapshot = await (await request.get("/api/sync/foundation")).json();
  const tasks = snapshot.tasks.filter((task: any) => task.id === requestId);
  expect(tasks).toHaveLength(1);
  expect(tasks[0].state).toBe("accepted");
  expect(tasks[0].mode).toBe("plan");
  expect(
    snapshot.events.filter((event: any) => event.taskId === requestId),
  ).toHaveLength(1);
  const list = await request.post("/api/sync/nexus", {
    data: { query: "Show my tasks", mode: "auto", workspaceScope: "Personal" },
  });
  expect((await list.json()).answer).toContain(taskText);
  const other = await request.post("/api/sync/nexus", {
    data: {
      query: "Show my tasks",
      mode: "auto",
      workspaceScope: "Co-hosting",
    },
  });
  expect(other.ok()).toBeTruthy();
  expect((await other.json()).answer).not.toContain(taskText);
  expect(
    (
      await request.post("/api/sync/nexus", {
        data: { ...body, requestId: "invalid" },
      })
    ).status(),
  ).toBe(400);
  await request.post("/api/sync/session", {
    data: { code: process.env.GW_SYNC_TEST_CODE, role: "display" },
  });
  expect(
    (
      await request.post("/api/sync/nexus", {
        data: { ...body, requestId: randomUUID() },
      })
    ).status(),
  ).toBe(403);
});

test("typed assistant shows a durable task reference", async ({ page }) => {
  await page.request.post("/api/sync/session", { data: { code: process.env.GW_SYNC_TEST_CODE, role: "controller" } });
  await page.goto("/nexus");
  await openAssistant(page);
  await page.locator("form").getByLabel("Ask Nexus", { exact: true }).fill("Create a task to review the UI fixture");
  await page.locator("form").getByRole("button", { name: "Ask Nexus", exact: true }).click();
  await expect(page.getByText(/Task reference: .*Manage it under Nexus/)).toBeVisible();
  await expect(page.getByText(/It is recorded for planning; no action has started/)).toBeVisible();
});
