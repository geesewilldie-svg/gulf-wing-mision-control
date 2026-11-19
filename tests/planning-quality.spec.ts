import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createTask,
  changeTask,
  snapshot,
} from "../lib/server/foundation/store";
import { coordinatorTick } from "../lib/server/foundation/coordinator";
import {
  IncompletePlanError,
  planningIssues,
} from "../lib/server/foundation/planning-quality";
import { askProvider } from "../lib/server/agent-router";
test.describe.configure({ mode: "serial" });
async function isolated(operation: () => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "nexus-plan-quality-"));
  const previous = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    await operation();
  } finally {
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
}
function queue(request = "Prepare a checklist for testing Nexus on my phone") {
  const id = createTask({ request, scope: "Personal", mode: "plan" });
  changeTask({ id, revision: 0, action: "queue" });
  return id;
}
test("known invalid product claims are distinguished from correct descriptions", () => {
  expect(
    planningIssues(
      "This assumes that Nexus is a fictional mobile application.",
      "Test Nexus",
    ),
  ).toHaveLength(1);
  expect(
    planningIssues("Nexus is a real app, not fictional.", "Test Nexus"),
  ).toEqual([]);
  expect(
    planningIssues(
      "A fictional character called Nexus.",
      "Write a fictional story about Nexus",
    ),
  ).toEqual([]);
});
test("invalid and incomplete plans are retained as waiting drafts without promoting a skill", async () =>
  isolated(async () => {
    const invalid = queue();
    await coordinatorTick(
      async () => "This assumes Nexus is a fictional mobile application.",
    );
    let task = snapshot().tasks.find((t) => t.id === invalid)!;
    expect(task.state).toBe("waiting");
    expect(task.reason).toContain("needs review");
    expect(task.output).toContain("NEEDS REVIEW");
    const incomplete = queue("Create a Nexus test plan");
    await coordinatorTick(async () => {
      throw new IncompletePlanError("- Open Nexus and verify the");
    });
    task = snapshot().tasks.find((t) => t.id === incomplete)!;
    expect(task.state).toBe("waiting");
    expect(task.output).toContain("INCOMPLETE");
    expect(task.output).toContain("verify the");
    expect(snapshot().skills).toHaveLength(0);
  }));
test("actual planner sends implemented context and detects local output limits", async () =>
  isolated(async () => {
    const original = globalThis.fetch;
    const oldModel = process.env.GW_NEXUS_MODEL;
    process.env.GW_NEXUS_MODEL = "fixture-model";
    let limited = false;
    let missingCompletion = false;
    const requests: any[] = [];
    globalThis.fetch = (async (url: any, init: any) => {
      expect(String(url)).toBe("http://127.0.0.1:11434/api/chat");
      requests.push(JSON.parse(init.body));
      return Response.json({
        ...(missingCompletion
          ? {}
          : { done: true, done_reason: limited ? "length" : "stop" }),
        message: {
          content: limited
            ? "- Check the"
            : "1. Open Nexus over private HTTPS. Expected: paired controller access.\n2. Test local Isabella. Expected: an audible reply.",
        },
      });
    }) as typeof fetch;
    try {
      const complete = queue();
      await coordinatorTick();
      expect(snapshot().tasks.find((t) => t.id === complete)!.state).toBe(
        "completed",
      );
      expect(requests[0].messages[0].content).toContain(
        "Nexus is a real, implemented personal assistant",
      );
      expect(requests[0].messages[0].content).toContain("laptop pairing code");
      expect(requests[0].options.num_predict).toBe(768);
      limited = true;
      const cut = queue("Nexus phone checklist again");
      await coordinatorTick();
      expect(snapshot().tasks.find((t) => t.id === cut)!.state).toBe("waiting");
      missingCompletion = true;
      const uncertain = queue("Nexus plan without completion receipt");
      await coordinatorTick();
      const uncertainTask = snapshot().tasks.find((t) => t.id === uncertain)!;
      expect(uncertainTask.state).toBe("waiting");
      expect(uncertainTask.reason).toContain("not confirmed");
      missingCompletion = false;
      // Conversational responses keep their existing lightweight budget.
      limited = false;
      await askProvider(
        "local",
        "Hello",
        "Fixture",
        [],
        new AbortController().signal,
      );
      expect(requests.at(-1).options.num_predict).toBe(256);
    } finally {
      globalThis.fetch = original;
      if (oldModel === undefined) delete process.env.GW_NEXUS_MODEL;
      else process.env.GW_NEXUS_MODEL = oldModel;
    }
  }));
test("a cancelled plan cannot receive an incomplete draft", async () =>
  isolated(async () => {
    const id = queue();
    await coordinatorTick(async () => {
      const current = snapshot().tasks.find((t) => t.id === id)!;
      changeTask({ id, revision: current.revision, action: "cancel" });
      throw new IncompletePlanError("partial output");
    });
    const task = snapshot().tasks.find((t) => t.id === id)!;
    expect(task.state).toBe("cancelled");
    expect(task.output).toBe("");
  }));
