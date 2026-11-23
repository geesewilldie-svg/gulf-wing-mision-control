import { test, expect } from "@playwright/test";
import { answerMemorySources } from "../lib/server/answer-memory-sources";
import { POST } from "../app/api/sync/nexus/route";
import { token } from "../lib/server/sync-store";
import {
  saveMemory,
  deleteMemory,
  ownerContextRevision,
} from "../lib/server/foundation/store";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

test("retained snapshots and every continued passage are excluded before ranking", () => {
  const make = (id: string, source: string, text: string) => ({
    id,
    source,
    location: "Imported note",
    text,
  });
  const filtered = answerMemorySources([
    make("1", "Renamed.md", "# Nexus owner memory\nWorkspace: Personal"),
    make("2", "Renamed.md", "PRIVATE_FORGOTTEN_LATER_CHUNK"),
    make(
      "3",
      "Obsidian · Nexus Knowledge / Nexus Memory Snapshots/batch/note.md",
      "late chunk",
    ),
    make(
      "4",
      "Obsidian · Nexus Memory Snapshots\\batch\\note.md",
      "late chunk",
    ),
    make(
      "5",
      "Renamed work.md",
      "\ufeff# Nexus reviewed work note\nTask reference: x",
    ),
    make("6", "Ordinary.md", "A useful operating note"),
  ]);
  expect(filtered.withheldSources).toBe(4);
  expect(filtered.documents.map((d) => d.id)).toEqual(["6"]);
});

test("answer route withholds retained facts from search and provider prompts while using current local owner memory", async () => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "nexus-snapshot-context-"),
  );
  const keys = [
    "GW_SYNC_DATA_DIR",
    "GW_NEXUS_MODEL",
    "GW_NEXUS_ALLOW_EXTERNAL",
    "GW_NEXUS_OPENAI_KEY",
    "GW_NEXUS_OPENAI_MODEL",
    "GW_NEXUS_MAX_EXTERNAL_PER_DAY",
    "GW_NEXUS_OBSIDIAN_VAULT",
  ] as const;
  const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const original = globalThis.fetch;
  process.env.GW_SYNC_DATA_DIR = dir;
  process.env.GW_NEXUS_MODEL = "fixture-model";
  process.env.GW_NEXUS_ALLOW_EXTERNAL = "1";
  process.env.GW_NEXUS_OPENAI_KEY = "synthetic-not-a-real-key";
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
    await fs.writeFile(
      path.join(dir, "knowledge.json"),
      JSON.stringify([
        {
          id: "snapshot-1",
          source: "Old snapshot.md",
          location: "Imported note",
          text: "# Nexus owner memory\nWorkspace: Personal\nQUARTZ PRIVATE_OLD_FACT",
        },
        {
          id: "snapshot-2",
          source: "Old snapshot.md",
          location: "continued",
          text: "QUARTZ PRIVATE_OLD_LATER_SECTION",
        },
        {
          id: "work-note",
          source: "Obsidian · Nexus Memory Snapshots/batch/task.md",
          location: "Imported note",
          text: "QUARTZ UNVERIFIED_TASK_PROPOSAL",
        },
        {
          id: "ordinary",
          source: "Operating note.md",
          location: "Imported note",
          text: "QUARTZ NORMAL_SOURCE",
        },
      ]),
    );
    const id = saveMemory({
      scope: "Personal",
      kind: "fact",
      content: "QUARTZ PRIVATE_CURRENT_FACT",
    });
    const bodies: { url: string; body: any }[] = [];
    globalThis.fetch = (async (url: any, init: any) => {
      const address = String(url);
      expect([
        "http://127.0.0.1:11434/api/chat",
        "https://api.openai.com/v1/chat/completions",
      ]).toContain(address);
      bodies.push({ url: address, body: JSON.parse(init.body) });
      return address.includes("openai.com")
        ? Response.json({
            choices: [
              {
                message: { content: "Synthetic external reply" },
                finish_reason: "stop",
              },
            ],
          })
        : Response.json({
            message: { content: "Synthetic local reply" },
            done: true,
            done_reason: "stop",
          });
    }) as typeof fetch;
    const ask = (mode: string) =>
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
            contextRevision: ownerContextRevision(),
          }),
        }),
      );
    const search = await ask("knowledge");
    expect(search.status).toBe(200);
    const searched = await search.json();
    expect(searched.sources.map((s: any) => s.id)).toEqual(["ordinary"]);
    expect(searched.warnings.join(" ")).toContain(
      "excluded from automatic answer context",
    );
    expect((await ask("local")).status).toBe(200);
    expect(JSON.stringify(bodies[0].body)).toContain("PRIVATE_CURRENT_FACT");
    expect(JSON.stringify(bodies[0].body)).toContain("NORMAL_SOURCE");
    expect(JSON.stringify(bodies[0].body)).not.toContain("PRIVATE_OLD");
    deleteMemory({ id, revision: 0 });
    expect((await ask("local")).status).toBe(200);
    expect(JSON.stringify(bodies[1].body)).not.toContain(
      "PRIVATE_CURRENT_FACT",
    );
    const external = await ask("openai");
    expect(external.status).toBe(200);
    expect(bodies).toHaveLength(3);
    const outbound = JSON.stringify(bodies[2].body);
    expect(outbound).toContain("NORMAL_SOURCE");
    expect(outbound).not.toContain("PRIVATE_");
    expect(outbound).not.toContain("UNVERIFIED_TASK_PROPOSAL");
  } finally {
    globalThis.fetch = original;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
});
