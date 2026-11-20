import { test, expect } from "@playwright/test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST } from "../app/api/sync/nexus/route";
import { token } from "../lib/server/sync-store";
import {
  ownerContextRevision,
  saveMemory,
  deleteMemory,
} from "../lib/server/foundation/store";
test("real answer route omits stale history and discards an answer prepared across memory deletion", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nexus-context-route-"));
  const oldRoot = process.env.GW_SYNC_DATA_DIR;
  const oldModel = process.env.GW_NEXUS_MODEL;
  const original = globalThis.fetch;
  const config = {
    version: 1 as const,
    pairingHash: "a".repeat(64),
    signingSecret: "b".repeat(64),
  };
  process.env.GW_SYNC_DATA_DIR = dir;
  process.env.GW_NEXUS_MODEL = "fixture-model";
  try {
    await writeFile(path.join(dir, "sync-config.json"), JSON.stringify(config));
    const id = saveMemory({
      content: "OLD_PRIVATE_CONTEXT: prefer the old answer style",
      kind: "instruction",
      scope: "Personal",
    });
    const oldRevision = ownerContextRevision();
    saveMemory({
      id,
      revision: 0,
      content: "CURRENT_CONTEXT: prefer concise fixture answers",
      kind: "instruction",
      scope: "Personal",
    });
    const currentRevision = ownerContextRevision();
    let removeDuringAnswer = false;
    const bodies: any[] = [];
    globalThis.fetch = (async (url: any, init: any) => {
      expect(String(url)).toBe("http://127.0.0.1:11434/api/chat");
      bodies.push(JSON.parse(init.body));
      if (removeDuringAnswer) deleteMemory({ id, revision: 1 });
      return Response.json({
        message: { content: "Fixture answer" },
        done: true,
        done_reason: "stop",
      });
    }) as typeof fetch;
    const ask = (revision: number) =>
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
            query: "Explain the test",
            mode: "local",
            workspaceScope: "Personal",
            contextRevision: revision,
            history: [{ role: "user", content: "OLD_PRIVATE_CONTEXT" }],
          }),
        }),
      );
    const fresh = await ask(oldRevision);
    expect(fresh.status).toBe(200);
    expect((await fresh.json()).resetHistory).toBe(true);
    expect(bodies[0].messages).toHaveLength(2);
    expect(JSON.stringify(bodies[0].messages)).not.toContain(
      "OLD_PRIVATE_CONTEXT",
    );
    expect(bodies[0].messages[0].content).toContain("CURRENT_CONTEXT");
    removeDuringAnswer = true;
    const stale = await ask(currentRevision);
    expect(stale.status).toBe(409);
    const denied = await stale.json();
    expect(denied.error).toContain("Owner memory changed");
    expect(denied.answer).toBeUndefined();
  } finally {
    globalThis.fetch = original;
    if (oldRoot === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = oldRoot;
    if (oldModel === undefined) delete process.env.GW_NEXUS_MODEL;
    else process.env.GW_NEXUS_MODEL = oldModel;
    await rm(dir, { recursive: true, force: true });
  }
});
