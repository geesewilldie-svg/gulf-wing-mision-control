import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  createTask,
  withStore,
  deleteTask,
} from "../lib/server/foundation/store";
import {
  workMemoryContext,
  workContextStamp,
} from "../lib/server/work-memory-context";
import { POST } from "../app/api/sync/nexus/route";
import { token } from "../lib/server/sync-store";
import { fixtureRole } from "./helpers/access";

test("local work retrieval is scoped, bounded and ignores active and empty task outputs", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-work-context-"));
  const previous = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    const add = (scope: string, state: string, output: string) => {
      const id = createTask({
        scope,
        mode: "plan",
        request: "QUARTZ checklist",
      });
      withStore((db) =>
        db
          .prepare("UPDATE tasks SET state=?,output=? WHERE id=?")
          .run(state, output, id),
      );
      return id;
    };
    for (let i = 0; i < 4; i++)
      add("Personal", "completed", "QUARTZ artifact " + "x".repeat(4000));
    add("Aviation", "completed", "CROSS_WORKSPACE_SECRET");
    add("Personal", "running", "ACTIVE_SECRET");
    add("Personal", "failed", "");
    const result = workMemoryContext("Personal", "QUARTZ");
    expect(result.records).toHaveLength(2);
    expect(
      result.records.every(
        (r) => r.outputExcerpt.length <= 600 && r.workspace === "Personal",
      ),
    ).toBe(true);
    expect(result.context.length).toBeLessThan(3000);
    expect(result.context).toContain("not owner facts");
    expect(result.context).not.toContain("CROSS_WORKSPACE_SECRET");
    expect(result.context).not.toContain("ACTIVE_SECRET");
    expect(workMemoryContext("Personal", "unmatchedxyz").records).toEqual([]);
    expect(workContextStamp("Personal")).not.toBe(workContextStamp("Aviation"));
  } finally {
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("real answer route uses fresh task history locally, clears stale chat and fences deletion during generation", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-work-answer-"));
  const keys = [
    "GW_SYNC_DATA_DIR",
    "GW_NEXUS_MODEL",
    "GW_NEXUS_ALLOW_EXTERNAL",
    "GW_NEXUS_OPENAI_KEY",
    "GW_NEXUS_OPENAI_MODEL",
    "GW_NEXUS_MAX_EXTERNAL_PER_DAY",
    "GW_NEXUS_OBSIDIAN_VAULT",
  ];
  const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const original = globalThis.fetch;
  process.env.GW_SYNC_DATA_DIR = dir;
  process.env.GW_NEXUS_MODEL = "fixture-model";
  process.env.GW_NEXUS_ALLOW_EXTERNAL = "1";
  process.env.GW_NEXUS_OPENAI_KEY = "synthetic-key";
  process.env.GW_NEXUS_OPENAI_MODEL = "fixture-model";
  process.env.GW_NEXUS_MAX_EXTERNAL_PER_DAY = "2";
  delete process.env.GW_NEXUS_OBSIDIAN_VAULT;
  const config = {
    version: 1 as const,
    pairingHash: "a".repeat(64),
    signingSecret: "b".repeat(64),
  };
  try {
    await fs.writeFile(
      path.join(dir, "sync-config.json"),
      JSON.stringify(config),
    );
    const id = createTask({
      scope: "Personal",
      mode: "plan",
      request: "QUARTZ phone testing",
    });
    withStore((db) =>
      db
        .prepare(
          "UPDATE tasks SET state='completed',output='PRIVATE_WORK_V1' WHERE id=?",
        )
        .run(id),
    );
    const bodies: any[] = [];
    let remove = false;
    globalThis.fetch = (async (url: any, init: any) => {
      const address = String(url);
      expect([
        "http://127.0.0.1:11434/api/chat",
        "https://api.openai.com/v1/chat/completions",
      ]).toContain(address);
      bodies.push(JSON.parse(init.body));
      if (remove) deleteTask({ id, revision: 1 });
      return address.includes("openai.com")
        ? Response.json({
            choices: [
              {
                message: { content: "Fixture external reply" },
                finish_reason: "stop",
              },
            ],
          })
        : Response.json({
            message: { content: "Fixture local reply" },
            done: true,
            done_reason: "stop",
          });
    }) as typeof fetch;
    const ask = (mode: string, stamp?: string, history: any[] = []) =>
      POST(
        new Request("http://localhost:3000/api/sync/nexus", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "content-type": "application/json",
            cookie: "gw_sync_session=" + token(config, "controller"),
          },
          body: JSON.stringify({
            query: "Explain QUARTZ",
            mode,
            allowExternal: mode === "openai",
            workspaceScope: "Personal",
            workContextStamp: stamp,
            history,
          }),
        }),
      );
    const first = await ask("local");
    expect(first.status).toBe(200);
    const initial = await first.json();
    expect(initial.workReferences).toMatchObject([
      { id, revision: 0, workspace: "Personal", reference: "W1" },
    ]);
    expect(initial.workReferences[0]).not.toHaveProperty("outputExcerpt");
    expect(JSON.stringify(bodies[0])).toContain("PRIVATE_WORK_V1");
    withStore((db) =>
      db
        .prepare(
          "UPDATE tasks SET revision=1,output='PRIVATE_WORK_V2' WHERE id=?",
        )
        .run(id),
    );
    const second = await ask("local", initial.workContextStamp, [
      { role: "assistant", content: "PRIVATE_WORK_V1" },
    ]);
    const updated = await second.json();
    expect(second.status).toBe(200);
    expect(updated.resetHistory).toBe(true);
    expect(JSON.stringify(bodies[1])).toContain("PRIVATE_WORK_V2");
    expect(JSON.stringify(bodies[1])).not.toContain("PRIVATE_WORK_V1");
    const external = await ask("openai", updated.workContextStamp, [
      { role: "assistant", content: "PRIVATE_WORK_V2" },
    ]);
    expect(external.status).toBe(200);
    expect((await external.json()).workReferences).toEqual([]);
    expect(JSON.stringify(bodies[2])).not.toContain("PRIVATE_WORK");
    remove = true;
    const rejected = await ask("local", updated.workContextStamp);
    expect(rejected.status).toBe(409);
    expect((await rejected.json()).error).toContain("Saved work changed");
    expect(workMemoryContext("Personal", "QUARTZ").records).toEqual([]);
  } finally {
    globalThis.fetch = original;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("desktop and phone display saved-work references and send the context stamp next time", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  const { openAssistant } = await import("./helpers/assistant");
  let calls = 0;
  await page.route("**/api/sync/nexus", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON();
    if (calls++) expect(body.workContextStamp).toBe("a".repeat(64));
    return route.fulfill({
      json: {
        engine: "Fixture local",
        answer: "Saved planning output [W1]",
        sources: [],
        warnings: [],
        workContextStamp: "a".repeat(64),
        workReferences: [
          {
            reference: "W1",
            id: "fixture-task",
            revision: 2,
            workspace: "Personal",
            state: "completed",
            request: "QUARTZ phone testing",
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    });
  });
  await page.goto("/nexus");
  await openAssistant(page);
  const ask = page
    .locator("form")
    .getByRole("button", { name: "Ask Nexus", exact: true });
  const input = page.locator("form").getByLabel("Ask Nexus", { exact: true });
  await input.fill("Explain QUARTZ");
  await ask.click();
  const refs = page.getByRole("region", {
    name: "Saved work used in this answer",
  });
  await expect(refs).toContainText("QUARTZ phone testing");
  await expect(refs).toContainText("Unverified task history");
  await input.fill("Explain QUARTZ again");
  await ask.click();
  await expect(refs).toBeVisible();
  expect(calls).toBe(2);
});
