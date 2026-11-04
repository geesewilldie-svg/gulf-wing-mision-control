import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkConnections } from "./check-nexus-connections.mjs";

test("ready local fixture checks only loopback, prints no model content/credentials and makes no changes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nexus-check-")),
    messages = [],
    calls = [];
  const config = JSON.stringify({ version: 1, model: "synthetic-model" });
  await writeFile(path.join(root, "nexus-config.json"), config);
  try {
    const issues = await checkConnections({
      root,
      env: { GW_SYNC_DATA_DIR: root },
      output: (s) => messages.push(s),
      fetcher: async (url, init) => {
        calls.push(url);
        assert.equal(new URL(url).hostname, "127.0.0.1");
        assert.equal(init.method, undefined);
        assert.equal(init.headers, undefined);
        if (url.includes("/agents")) return new Response("", { status: 401 });
        if (url.includes("/tags"))
          return Response.json({ models: [{ name: "synthetic-model" }] });
        return Response.json({ speech: true, transcription: true });
      },
    });
    assert.equal(issues, 0);
    assert.equal(calls.length, 3);
    assert.ok(messages.some((s) => s.includes("inference not exercised")));
    assert.ok(!messages.join("\n").includes("synthetic-model"));
    const { readFile } = await import("node:fs/promises");
    assert.equal(
      await readFile(path.join(root, "nexus-config.json"), "utf8"),
      config,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("old server, missing model and offline voice produce actionable setup items without raw error output", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nexus-check-")),
    messages = [];
  try {
    const issues = await checkConnections({
      root,
      env: { GW_SYNC_DATA_DIR: root },
      output: (s) => messages.push(s),
      fetcher: async (url) => {
        if (url.includes("/agents")) return new Response("", { status: 404 });
        throw Error("sensitive diagnostic fixture");
      },
    });
    assert.equal(issues, 4);
    assert.ok(messages.some((s) => s.includes("merged router build")));
    assert.ok(!messages.join("\n").includes("sensitive diagnostic fixture"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
