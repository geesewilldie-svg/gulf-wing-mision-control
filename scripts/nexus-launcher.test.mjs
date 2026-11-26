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

test("a reused saved PID for build or another process cannot suppress a missing server restart", async () => {
  const { managedServiceProbe, serviceProcessPattern } = await import(
    "./nexus-launcher-lib.mjs"
  );
  const server = {
    ...services[1],
    command: "C:\\Program Files\\nodejs\\node.exe",
    args: [
      "C:\\Users\\Owner [test]\\Nexus\\node_modules\\next\\dist\\bin\\next",
      "start",
      "--hostname",
      "0.0.0.0",
    ],
  };
  const matches = new RegExp(serviceProcessPattern(server), "i");
  const prefix =
    '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\Owner [test]\\Nexus\\node_modules\\next\\dist\\bin\\next"';
  assert.equal(matches.test(prefix + " start --hostname 0.0.0.0"), true);
  for (const args of [
    " build",
    " start --hostname 127.0.0.1",
    " start --hostname 0.0.0.0 --port 4000",
    " start --hostname 0.0.0.0 --extra",
  ])
    assert.equal(matches.test(prefix + args), false);
  let starts = 0;
  const state = await managedServiceProbe(
    server,
    { pid: 31916, command: server.command },
    {
      health: async () => "down",
      identity: async (_service, pid) => {
        assert.equal(pid, 31916);
        return matches.test(prefix + " build");
      },
    },
  );
  assert.equal(state, "down");
  const result = await startServices([server], {
    log: () => {},
    probe: async () => state,
    prepare: async () => true,
    start: async () => {
      starts++;
      return 123;
    },
    wait: async () => "ready",
  });
  assert.equal(starts, 1);
  assert.equal(result[0].state, "ready");
});

test("healthy services bypass process metadata, absent processes restart, and unverifiable identity never launches duplicates", async () => {
  const { managedServiceProbe } = await import("./nexus-launcher-lib.mjs");
  assert.equal(
    await managedServiceProbe(
      services[1],
      { pid: 42 },
      {
        health: async () => "ready",
        identity: async () => {
          throw Error("must not query");
        },
      },
    ),
    "ready",
  );
  for (const [identity, expected] of [
    [false, "down"],
    [true, "pending"],
    [null, "unverified"],
  ])
    assert.equal(
      await managedServiceProbe(
        services[1],
        { pid: 42 },
        { health: async () => "down", identity: async () => identity },
      ),
      expected,
    );
  const result = await startServices([services[1]], {
    log: () => {},
    probe: async () => "unverified",
    prepare: async () => {
      throw Error("must not prepare");
    },
    start: async () => {
      throw Error("must not launch");
    },
  });
  assert.equal(result[0].state, "blocked");
});

test("a matching existing launch is awaited and reused, including failure/warming outcomes", async () => {
  for (const state of ["ready", "degraded", "failed", "warming"]) {
    let waited = 0;
    const result = await startServices([services[1]], {
      log: () => {},
      probe: async () => "pending",
      waitExisting: async () => {
        waited++;
        return state;
      },
      prepare: async () => {
        throw Error("must not prepare");
      },
      start: async () => {
        throw Error("must not start duplicate");
      },
    });
    assert.equal(waited, 1);
    assert.equal(result[0].state, state);
  }
});
