import test from "node:test";
import assert from "node:assert/strict";
import { startServices, backgroundVoicePython } from "./nexus-launcher-lib.mjs";
const services = [
  { id: "ollama", name: "Ollama", port: 11434 },
  { id: "server", name: "Mission Control", port: 3000 },
  { id: "voice", name: "Nexus voice", port: 8766 },
];
test("one launch starts each missing service once and subsequent launch reuses healthy processes", async () => {
  const running = new Set(),
    started = [];
  const io = {
    log: () => {},
    probe: async (s) => (running.has(s.id) ? "ready" : "down"),
    prepare: async () => true,
    start: async (s) => {
      started.push(s.id);
      return 42;
    },
    wait: async (s, pid) => {
      assert.equal(pid, 42);
      running.add(s.id);
      return "ready";
    },
  };
  assert.ok(
    (await startServices(services, io)).every((r) => r.state === "ready"),
  );
  await startServices(services, io);
  assert.deepEqual(started, ["ollama", "server", "voice"]);
});
test("unknown ports, incomplete voice and warming processes are never killed or duplicated", async () => {
  let starts = 0;
  const result = await startServices(services, {
    log: () => {},
    probe: async (s) =>
      s.id === "server"
        ? "occupied"
        : s.id === "voice"
          ? "degraded"
          : "pending",
    prepare: async () => {
      throw Error("must not prepare");
    },
    start: async () => {
      starts++;
    },
    wait: async () => {
      throw Error("must not wait");
    },
  });
  assert.equal(starts, 0);
  assert.deepEqual(
    result.map((r) => r.state),
    ["warming", "blocked", "degraded"],
  );
});
test("missing files and failed voice do not prevent an independently healthy dashboard from remaining available", async () => {
  const result = await startServices(services, {
    log: () => {},
    probe: async (s) => (s.id === "server" ? "ready" : "down"),
    prepare: async (s) => s.id !== "ollama",
    start: async () => {
      throw Error("synthetic start failure");
    },
    wait: async () => {
      throw Error("not reached");
    },
  });
  assert.deepEqual(
    result.map((r) => r.state),
    ["missing", "ready", "failed"],
  );
});

test("background voice requires pythonw rather than silently falling back to a terminal interpreter", async () => {
  const folder = "voice-scripts";
  const selected = await backgroundVoicePython(folder, async (file) =>
    file.endsWith("pythonw.exe"),
  );
  assert.ok(selected.endsWith("pythonw.exe"));
  assert.equal(
    await backgroundVoicePython(folder, async (file) =>
      file.endsWith("python.exe"),
    ),
    null,
  );
});

test("an exited process is reported differently from a still-loading worker", async () => {
  const logs = [];
  await startServices([services[2]], {
    log: (s) => logs.push(s),
    probe: async () => "down",
    prepare: async () => true,
    start: async () => 42,
    wait: async () => "failed",
  });
  assert.ok(logs.some((s) => s.includes("process exited before readiness")));
});
