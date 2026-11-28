import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { reaCheckIntent } from "../lib/rea-check-intent";
import { conversationReaCheck } from "../lib/server/conversation-rea-check";
import { reaTarget } from "../lib/rea-readiness";
import { POST } from "../app/api/sync/nexus/route";
import { token } from "../lib/server/sync-store";
import { fixtureRole } from "./helpers/access";
import { openAssistant } from "./helpers/assistant";
async function fixture(run: (config: any) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "local-model-catalog-"));
  const prior = process.env.GW_SYNC_DATA_DIR,
    model = process.env.GW_NEXUS_MODEL,
    original = globalThis.fetch;
  process.env.GW_SYNC_DATA_DIR = dir;
  process.env.GW_NEXUS_MODEL = "fixture";
  const config = {
    version: 1,
    pairingHash: "a".repeat(64),
    signingSecret: "b".repeat(64),
  };
  try {
    await fs.writeFile(
      path.join(dir, "sync-config.json"),
      JSON.stringify(config),
    );
    await run(config);
  } finally {
    globalThis.fetch = original;
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    if (model === undefined) delete process.env.GW_NEXUS_MODEL;
    else process.env.GW_NEXUS_MODEL = model;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const preflight = {
  checkedAt: "2026-11-28T12:00:00.000Z",
  nodeVersion: "v24.19.0",
  runtimeCompatible: false,
  packageState: "missing" as const,
  expected: reaTarget,
  adapterReady: false as const,
  notice: "Metadata only; no process was launched.",
};
const protocol = {
  serverVersion: "6.10.1",
  tools: [{ name: "inspect_web_page", schemaSha256: "a".repeat(64) }],
  checkedAt: "2026-11-28T12:00:00.000Z",
  protocolVerified: true,
  toolsCalled: 0,
  browserReady: false,
  notice:
    "Initialize/catalog and clean shutdown only. Site inspection remains unconnected.",
};
test("REA prerequisite and protocol grammar cannot accept targets, CLI options or combined instructions", () => {
  expect(reaCheckIntent("Nexus, please check REA prerequisites.")).toBe(
    "preflight",
  );
  expect(reaCheckIntent("Test REA protocol")).toBe("protocol");
  for (const text of [
    "Test REA protocol https://example.test",
    "Test REA protocol and open browser",
    "Check REA prerequisites --setup",
  ])
    expect(reaCheckIntent(text)).toBe("help");
  expect(reaCheckIntent("Don't test REA protocol")).toBeNull();
  expect(reaCheckIntent("Explain test REA protocol")).toBeNull();
});
test("REA conversation separates metadata from one explicit protocol invocation and respects cancellation", async () => {
  let metadata = 0,
    executions = 0;
  const signal = new AbortController().signal;
  const probes = {
    preflight: async () => {
      metadata++;
      return preflight;
    },
    protocol: async (...args: any[]) => {
      executions++;
      expect(args).toEqual([signal]);
      return protocol;
    },
  };
  const first = await conversationReaCheck("preflight", signal, probes);
  expect(first.answer).toContain("does not meet");
  expect(first.answer).toContain("not found");
  expect("reaPrerequisites" in first && first.reaPrerequisites).toEqual(
    preflight,
  );
  expect(metadata).toBe(1);
  expect(executions).toBe(0);
  const second = await conversationReaCheck("protocol", signal, probes);
  expect(second.answer).toContain("No tool was called");
  expect("reaProtocol" in second && second.reaProtocol).toEqual(protocol);
  expect(second).toMatchObject({
    resetHistory: true,
    clearRecordReferences: true,
    routing: { selected: [] },
  });
  expect(executions).toBe(1);
  expect(metadata).toBe(1);
  await conversationReaCheck("help", signal, probes);
  expect(executions).toBe(1);
  const abort = new AbortController();
  abort.abort();
  await expect(
    conversationReaCheck("protocol", abort.signal, probes),
  ).rejects.toThrow();
  expect(executions).toBe(1);
});
test("actual prerequisite reads remain local and protocol guards reject absent or incompatible setup", () =>
  fixture(async (config) => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      throw Error("Network forbidden");
    };
    const send = (
      query = "Check REA prerequisites",
      role: string | null = "controller",
      mode = "auto",
      origin = "http://localhost:3000",
    ) =>
      POST(
        new Request("http://localhost:3000/api/sync/nexus", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin,
            "content-type": "application/json",
            ...(role
              ? { cookie: "gw_sync_session=" + token(config, role as any) }
              : {}),
          },
          body: JSON.stringify({
            query,
            mode,
            voiceConversation: true,
            allowExternal: true,
            publicQuery: "unused public terms",
          }),
        }),
      );
    for (const query of ["Check REA prerequisites", "Test REA protocol"]) {
      expect((await send(query, null)).status).toBe(401);
      expect((await send(query, "display")).status).toBe(403);
      expect(
        (await send(query, "controller", "auto", "https://foreign.test"))
          .status,
      ).toBe(403);
      for (const mode of ["knowledge", "compare", "openai"])
        expect((await send(query, "controller", mode)).status).toBe(403);
    }
    const read = await send();
    expect(read.status).toBe(200);
    expect((await read.json()).reaPrerequisites).toMatchObject({
      packageState: "missing",
      adapterReady: false,
    });
    const check = await send("Test REA protocol");
    expect(check.status).toBe(409);
    expect(await check.json()).not.toHaveProperty("reaProtocol");
    expect((await send("Test REA protocol https://example.test")).status).toBe(
      200,
    );
    expect(calls).toBe(0);
  }));
test("compiled REA conversation returns prerequisites and refuses unsupported protocol setup", async ({
  context,
}) => {
  await fixtureRole(context);
  const first = await context.request.post("/api/sync/nexus", {
    data: {
      query: "Check REA prerequisites",
      mode: "auto",
      voiceConversation: true,
    },
  });
  expect(first.status()).toBe(200);
  expect((await first.json()).reaPrerequisites).toMatchObject({
    packageState: "missing",
    adapterReady: false,
  });
  const second = await context.request.post("/api/sync/nexus", {
    data: { query: "Test REA protocol", mode: "auto", voiceConversation: true },
  });
  expect(second.status()).toBe(409);
  expect(await second.json()).not.toHaveProperty("reaProtocol");
});
test("assistant reuses returned prerequisite/protocol views without another tool request", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let extra = 0;
  await page.route("**/api/sync/agents", (route) => {
    if (route.request().method() === "POST") {
      extra++;
      return route.fulfill({
        status: 403,
        json: { error: "Controller required" },
      });
    }
    return route.fulfill({ json: { providers: [], events: [], workers: [] } });
  });
  await page.route("**/api/sync/nexus", (route) => {
    if (route.request().method() !== "POST")
      return route.fulfill({
        json: { sources: [], providers: [], sections: 0, localModel: false },
      });
    const checking =
      route.request().postDataJSON().query === "Test REA protocol";
    return route.fulfill({
      json: {
        engine: "Nexus REA check",
        answer:
          "Explicit check result displayed. General website inspection remains unconnected.",
        sources: [],
        warnings: [],
        resetHistory: true,
        clearRecordReferences: true,
        ...(checking
          ? { reaProtocol: protocol }
          : { reaPrerequisites: preflight }),
      },
    });
  });
  await page.goto("/nexus");
  await openAssistant(page);
  const drawer = page.getByRole("complementary", {
    name: "Nexus personal assistant",
    exact: true,
  });
  const input = drawer.getByRole("textbox", { name: "Ask Nexus", exact: true }),
    submit = drawer.getByRole("button", { name: "Ask Nexus", exact: true });
  await input.fill("Check REA prerequisites");
  await submit.click();
  await expect(
    drawer.getByRole("region", {
      name: "REA prerequisite results",
      exact: true,
    }),
  ).toContainText("Adapter ready: no");
  expect(extra).toBe(0);
  await input.fill("Test REA protocol");
  await submit.click();
  const result = drawer.getByRole("region", {
    name: "REA protocol results",
    exact: true,
  });
  await expect(result).toContainText("Site inspection remains unconnected");
  expect(extra).toBe(0);
  expect(
    await result.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await fs.mkdir("artifacts/conversation-rea-check", { recursive: true });
  await result.screenshot({
    path: `artifacts/conversation-rea-check/${info.project.name}.png`,
  });
});
