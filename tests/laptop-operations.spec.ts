import { test, expect } from "@playwright/test";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  claimLaptopOperation,
  finishLaptopOperation,
  laptopOperation,
} from "../lib/server/laptop-operations";
import {
  withStore,
  saveMemory,
  snapshot,
} from "../lib/server/foundation/store";
import { operationStatusIntent } from "../lib/maintenance-intent";
import { fixtureRole } from "./helpers/access";

async function isolated(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "nexus-operation-"));
  const prior = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    await run(dir);
  } finally {
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    await rm(dir, { recursive: true, force: true });
  }
}
test("durable operation claims deduplicate requests, fence overlap and retain terminal outcomes", async () =>
  isolated(async () => {
    const key = "operation-request-0001";
    const first = claimLaptopOperation("check-connections", key, 30000);
    expect(first.execute).toBe(true);
    expect(claimLaptopOperation("check-connections", key, 30000)).toEqual({
      execute: false,
      receipt: first.receipt,
    });
    expect(() => claimLaptopOperation("start-services", key, 30000)).toThrow(
      "different operation",
    );
    expect(() =>
      claimLaptopOperation("start-services", "operation-request-0002", 30000),
    ).toThrow("already running");
    finishLaptopOperation(
      first.receipt.id,
      "complete",
      "Synthetic diagnostic returned successfully; readiness not independently verified.",
    );
    expect(laptopOperation(first.receipt.id).outcome).toBe("complete");
    expect(claimLaptopOperation("check-connections", key, 30000).execute).toBe(
      false,
    );
    expect(() =>
      finishLaptopOperation(first.receipt.id, "unknown", "Late writer"),
    ).toThrow("no longer current");
    const second = claimLaptopOperation(
      "start-services",
      "operation-request-0002",
      180000,
    );
    finishLaptopOperation(
      second.receipt.id,
      "not-started",
      "Permission revoked before dispatch.",
    );
    expect(laptopOperation(second.receipt.id).outcome).toBe("not-started");
    expect(() =>
      claimLaptopOperation("start-services", { command: "whoami" }, 30000),
    ).toThrow("Invalid");
  }));
test("an expired unconfirmed operation stays unknown and the same request never dispatches again", async () =>
  isolated(async () => {
    const key = "operation-request-expired";
    const first = claimLaptopOperation("start-services", key, 180000);
    withStore((db) =>
      db
        .prepare("UPDATE laptop_operations SET expires=0 WHERE id=?")
        .run(first.receipt.id),
    );
    expect(laptopOperation(first.receipt.id).outcome).toBe("unknown");
    expect(claimLaptopOperation("start-services", key, 180000).execute).toBe(
      false,
    );
    expect(() =>
      finishLaptopOperation(first.receipt.id, "complete", "Late result"),
    ).toThrow("no longer current");
    expect(
      operationStatusIntent(`Show laptop operation ${first.receipt.id}`),
    ).toBe(first.receipt.id);
    expect(
      operationStatusIntent(
        `Show laptop operation ${first.receipt.id} and restart`,
      ),
    ).toBeNull();
  }));
test("schema seven backs up version six and preserves existing memory", async () =>
  isolated(async (dir) => {
    saveMemory({
      kind: "fact",
      scope: "Personal",
      content: "Retained owner fact",
    });
    withStore((db) =>
      db.exec("DROP TABLE assistant_drafts; DROP TABLE laptop_operations; PRAGMA user_version=6;"),
    );
    expect(snapshot().memory[0].content).toBe("Retained owner fact");
    expect(
      (await readdir(path.join(dir, "foundation-backups"))).some((name) =>
        name.startsWith("before-schema-7-"),
      ),
    ).toBe(true);
    expect(
      claimLaptopOperation(
        "check-connections",
        "operation-after-migration",
        30000,
      ).execute,
    ).toBe(true);
  }));
test("operation status is controller-only, local-only and reports an absent receipt honestly", async ({
  context,
}) => {
  const data = {
    query: `Show laptop operation ${"a".repeat(24)}`,
    mode: "auto",
  };
  expect(
    (await context.request.post("/api/sync/nexus", { data })).status(),
  ).toBe(401);
  await fixtureRole(context, "display");
  expect(
    (await context.request.post("/api/sync/nexus", { data })).status(),
  ).toBe(403);
  await fixtureRole(context, "controller");
  expect(
    (
      await context.request.post("/api/sync/nexus", {
        data,
        headers: { Origin: "https://untrusted.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post("/api/sync/nexus", {
        data: { ...data, mode: "gemini", allowExternal: true },
      })
    ).status(),
  ).toBe(403);
  const absent = await context.request.post("/api/sync/nexus", { data });
  expect(absent.status()).toBe(404);
  expect((await absent.json()).error).toContain(
    "Older audit-only operations are not imported",
  );
});
