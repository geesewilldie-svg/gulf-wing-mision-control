import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import path from "node:path";
import { withOwnedReaBrowser } from "../lib/server/owned-rea-browser";
import {
  reaCatalogExchange,
  ownedInspectionEvidence,
  ownedInspectionArguments,
} from "../lib/server/rea-protocol";
import { fixtureRole } from "./helpers/access";

test("real REA inspects only a fresh owned loopback fixture and closes its process/browser", async () => {
  const node = process.env.NEXUS_REA_TEST_NODE,
    pkg = process.env.NEXUS_REA_TEST_PACKAGE;
  test.skip(
    !node || !pkg,
    "Requires the explicit isolated compatible runtime and package fixture.",
  );
  const result = await withOwnedReaBrowser(
    new AbortController().signal,
    async (fixture, signal) => {
      expect(fixture.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(fixture.url).toContain("/nexus-rea-self-test/");
      const child = spawn(
        node!,
        [path.join(pkg!, "scripts", "rea.mjs"), "mcp"],
        {
          cwd: pkg!,
          env: {
            NODE_ENV: "test",
            PATH: process.env.PATH,
            REA_MCP_TOOL_FAMILIES: "browser",
          },
          stdio: "pipe",
        },
      );
      const result = await reaCatalogExchange(child, signal, fixture);
      expect(child.exitCode).toBe(0);
      return { ...result, fixtureOrigin: fixture.origin };
    },
    { executable: "/usr/bin/chromium", testNoSandbox: true },
  );
  expect(result.inspection?.evidenceId).toMatch(/^ev_[a-f0-9]{64}$/);
  expect(result.inspection?.evidenceSha256).toMatch(/^[a-f0-9]{64}$/);
  await expect(fetch(result.fixtureOrigin)).rejects.toThrow();
});

test("fixture mismatch evidence is rejected even if a tool reports success", () => {
  const expected = {
    endpoint: "http://127.0.0.1:1",
    targetId: "A".repeat(32),
    url: "http://127.0.0.1:2/nexus-rea-self-test/fixture",
    origin: "http://127.0.0.1:2",
    title: "Owned fixture",
  };
  const data = {
    evidence_id: "ev_" + "a".repeat(64),
    predicate_type: "rea.web-page-inspection",
    operation: "inspect_web_page",
    provider: { id: "rea-cdp-browser" },
    parameters: ownedInspectionArguments(expected),
    subject: { identity: { url: expected.url } },
    normalized_result: {
      target: {
        target_id: expected.targetId,
        url: expected.url,
        origin: expected.origin,
        title: "OTHER TAB",
      },
    },
  };
  expect(() =>
    ownedInspectionEvidence({ structuredContent: data }, expected),
  ).toThrow();
  data.normalized_result.target.title = expected.title;
  expect(
    ownedInspectionEvidence({ structuredContent: data }, expected).evidenceId,
  ).toBe(data.evidence_id);
  data.parameters.include_storage_keys = true;
  expect(() =>
    ownedInspectionEvidence({ structuredContent: data }, expected),
  ).toThrow();
  data.parameters.include_storage_keys = false;
  expect(() =>
    ownedInspectionEvidence(
      { isError: true, structuredContent: data },
      expected,
    ),
  ).toThrow();
});

test("cancelling an owned fixture does not leave its local HTTP endpoint listening", async () => {
  const controller = new AbortController();
  let origin = "";
  await expect(
    withOwnedReaBrowser(
      controller.signal,
      async (fixture) => {
        origin = fixture.origin;
        controller.abort();
        throw Error("Cancelled fixture");
      },
      { executable: "/usr/bin/chromium", testNoSandbox: true },
    ),
  ).rejects.toThrow();
  if (origin) await expect(fetch(origin)).rejects.toThrow();
});

test("browser self-test API denies caller URLs and custom CDP endpoints with normal controller/origin guards", async ({
  context,
}) => {
  const data = { action: "rea-browser-self-test" };
  expect(
    (await context.request.post("/api/sync/agents", { data })).status(),
  ).toBe(401);
  await fixtureRole(context, "display");
  expect(
    (await context.request.post("/api/sync/agents", { data })).status(),
  ).toBe(403);
  await fixtureRole(context, "controller");
  expect(
    (
      await context.request.post("/api/sync/agents", {
        data,
        headers: { Origin: "https://foreign.test" },
      })
    ).status(),
  ).toBe(403);
  for (const extra of [
    { url: "https://external.test" },
    { cdp_endpoint: "http://127.0.0.1:9222" },
    { executable: "other.exe" },
  ])
    expect(
      (
        await context.request.post("/api/sync/agents", {
          data: { ...data, ...extra },
        })
      ).status(),
    ).toBe(400);
});

test("desktop and phone explicitly invoke the owned-browser test and distinguish it from general inspection", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  let calls = 0;
  await page.route("**/api/sync/agents", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { providers: [], events: [] } });
    expect(route.request().postDataJSON()).toEqual({
      action: "rea-browser-self-test",
    });
    calls++;
    return route.fulfill({
      json: {
        runId: "fixture-run",
        receiptState: "saved",
        evidenceId: "ev_" + "a".repeat(64),
        completeness: "policy_filtered",
        notice:
          "Owned loopback fixture verified. General site inspection remains unconnected.",
      },
    });
  });
  await page.goto("/nexus");
  await page.getByText("Connection activity", { exact: true }).click();
  await page.getByText("REA inspection prerequisites", { exact: true }).click();
  expect(calls).toBe(0);
  await page
    .getByRole("button", {
      name: "Test REA owned browser inspection",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", { name: "REA owned browser self-test results" }),
  ).toContainText("General site inspection remains unconnected");
  expect(calls).toBe(1);
});

test("self-test receipts verify exclusive writes and preserve a full or symlinked receipt directory", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const { writeReaSelfTestReceipt } = await import(
    "../lib/server/rea-browser-self-test"
  );
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rea-receipt-fixture-"));
  const previous = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = root;
  try {
    const summary = {
      runId: "owned-run",
      state: "verified",
      evidenceId: "ev_fixture",
    };
    expect(await writeReaSelfTestReceipt(summary)).toBe("saved");
    const dir = path.join(root, "rea-self-test-receipts");
    expect(
      JSON.parse(await fs.readFile(path.join(dir, "0.json"), "utf8")),
    ).toEqual(summary);
    for (let i = 1; i < 100; i++)
      await fs.writeFile(path.join(dir, i + ".json"), "retained");
    expect(await writeReaSelfTestReceipt({ runId: "new-run" })).toBe("pending");
    expect(await fs.readFile(path.join(dir, "99.json"), "utf8")).toBe(
      "retained",
    );
    await fs.rename(dir, path.join(root, "retained"));
    await fs.symlink(path.join(root, "retained"), dir, "dir");
    expect(await writeReaSelfTestReceipt(summary)).toBe("pending");
  } finally {
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
});
