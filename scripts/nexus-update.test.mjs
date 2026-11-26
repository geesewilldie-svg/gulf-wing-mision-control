import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextServerPattern,
  updateNexus,
  updateBranch,
  sameGeneratedNextEnvironment,
  verifyNexusAssets,
} from "./nexus-update-lib.mjs";
const fixture = () => {
  const events = [];
  return {
    events,
    io: {
      branch: async () => updateBranch,
      dirty: async () => false,
      log: () => {},
      pull: async () => events.push("pull"),
      stopOwnedServer: async () => events.push("stop"),
      portFree: async () => true,
      dependenciesChanged: async () => true,
      dependencies: async () => events.push("dependencies"),
      build: async () => events.push("build"),
      start: async () => events.push("start"),
      verifyAssets: async () => events.push("assets"),
      saveSuccess: async () => events.push("save"),
    },
  };
};
test("updater orders pull, stop, dependencies, build and restart; unchanged dependencies are reused", async () => {
  const { io, events } = fixture();
  await updateNexus(io);
  assert.deepEqual(events, [
    "pull",
    "stop",
    "dependencies",
    "build",
    "start",
    "assets",
    "save",
  ]);
  const other = fixture();
  other.io.dependenciesChanged = async () => false;
  await updateNexus(other.io);
  assert.deepEqual(other.events, [
    "pull",
    "stop",
    "build",
    "start",
    "assets",
    "save",
  ]);
});
test("wrong branch, dirty edits or failed pull stop before killing a service", async () => {
  for (const change of [
    { branch: async () => "main" },
    { dirty: async () => true },
    {
      pull: async () => {
        throw Error("network");
      },
    },
  ]) {
    const { io, events } = fixture();
    await assert.rejects(updateNexus({ ...io, ...change }));
    assert.ok(!events.includes("stop"));
  }
});
test("occupied port or failed build never starts an invalid build or marks update successful", async () => {
  const first = fixture();
  first.io.portFree = async () => false;
  await assert.rejects(updateNexus(first.io));
  assert.deepEqual(first.events, ["pull", "stop"]);
  const second = fixture();
  second.io.build = async () => {
    throw Error("build failed");
  };
  await assert.rejects(updateNexus(second.io));
  assert.ok(!second.events.includes("start"));
  assert.ok(!second.events.includes("save"));
});
test("server matcher accepts only this repository Next start and escapes path characters", () => {
  const repo = "C:\\Users\\Owner [test]\\Nexus";
  const pattern = new RegExp(nextServerPattern(repo), "i");
  assert.ok(
    pattern.test(
      '"C:\\Program Files\\nodejs\\node.exe" ' +
        repo +
        "\\node_modules\\next\\dist\\bin\\next start --hostname 0.0.0.0",
    ),
  );
  assert.ok(
    pattern.test(
      '"C:\\node.exe" "' +
        repo +
        '\\node_modules\\next\\dist\\bin\\next" start',
    ),
  );
  for (const value of [
    '"C:\\node.exe" C:\\other\\node_modules\\next\\dist\\bin\\next start',
    '"C:\\node.exe" ' + repo + "\\node_modules\\next\\dist\\bin\\next build",
    '"C:\\node.exe" server.js --note ' +
      repo +
      "\\node_modules\\next\\dist\\bin\\next start",
  ])
    assert.ok(!pattern.test(value));
});

test("only generated Next type-path differences are eligible for cleanup", () => {
  const before =
    'import "./.next/dev/types/routes.d.ts";\nimport "./.next/dev/types/root-params.d.ts";';
  const after = before.replaceAll(".next/dev/types", ".next/types");
  assert.equal(sameGeneratedNextEnvironment(before, after), true);
  assert.equal(
    sameGeneratedNextEnvironment(before, after + "\n// user modification"),
    false,
  );
  assert.equal(
    sameGeneratedNextEnvironment(before, after.replace("routes", "secrets")),
    false,
  );
});

test("asset readiness checks current CSS/JS and rejects the unstyled-page failure", async () => {
  const html =
    '<link href="/_next/static/style.css" rel="stylesheet"><script src="/_next/static/app.js"></script><script src="https://outside.test/leak.js"></script>';
  const urls = [];
  const fake = async (url) => {
    urls.push(url);
    return url.endsWith("/nexus")
      ? new Response(html)
      : new Response("asset", {
          headers: {
            "content-type": url.endsWith(".css")
              ? "text/css"
              : "application/javascript",
          },
        });
  };
  assert.equal(await verifyNexusAssets(fake), 2);
  assert.equal(urls.length, 3);
  assert.ok(urls.every((url) => url.startsWith("http://127.0.0.1:3000/")));
  await assert.rejects(
    verifyNexusAssets(async (url) =>
      url.endsWith("/nexus")
        ? new Response(html)
        : new Response("failed", { status: 500 }),
    ),
  );
});

test("update restart ignores a recycled launcher PID from Next build and verifies the replacement assets", async () => {
  const { managedServiceProbe, serviceProcessPattern, startServices } =
    await import("./nexus-launcher-lib.mjs");
  const { io, events } = fixture();
  const service = {
    id: "server",
    name: "Mission Control",
    port: 3000,
    command: "C:\\node.exe",
    args: [
      "C:\\Nexus\\node_modules\\next\\dist\\bin\\next",
      "start",
      "--hostname",
      "0.0.0.0",
    ],
  };
  let currentCommandLine =
    '"C:\\node.exe" C:\\Nexus\\node_modules\\next\\dist\\bin\\next start --hostname 0.0.0.0';
  io.build = async () => {
    events.push("build");
    currentCommandLine =
      '"C:\\node.exe" C:\\Nexus\\node_modules\\next\\dist\\bin\\next build';
  };
  let launched = 0;
  io.start = async () => {
    const result = await startServices([service], {
      log: () => {},
      probe: () =>
        managedServiceProbe(
          service,
          { pid: 31916, command: service.command },
          {
            health: async () => "down",
            identity: async () =>
              new RegExp(serviceProcessPattern(service), "i").test(
                currentCommandLine,
              ),
          },
        ),
      prepare: async () => true,
      start: async () => {
        launched++;
        events.push("restart");
        return 100;
      },
      wait: async () => "ready",
    });
    assert.equal(result[0].state, "ready");
  };
  await updateNexus(io);
  assert.equal(launched, 1);
  assert.deepEqual(events, [
    "pull",
    "stop",
    "dependencies",
    "build",
    "restart",
    "assets",
    "save",
  ]);
});
