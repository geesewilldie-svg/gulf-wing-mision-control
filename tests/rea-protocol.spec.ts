import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  reaCatalogExchange,
  inspectReaProtocol,
} from "../lib/server/rea-protocol";
import { reaRuntimeCompatible } from "../lib/rea-readiness";
import { fixtureRole } from "./helpers/access";
const script = `
const readline=require('node:readline');const mode=process.argv[1];
const names=['list_browser_targets','inspect_web_page','capture_web_screenshot','analyze_web_bundle','observe_web_session','compare_web_captures'];
const rl=readline.createInterface({input:process.stdin});
rl.on('line',line=>{const message=JSON.parse(line);process.stderr.write('trace:'+message.method+'\\n');
if(message.method==='initialize')process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:1,result:{protocolVersion:'2025-06-18',serverInfo:{name:'rea',version:mode==='wrong'?'0.0.0':'6.10.1'}}})+'\\n');
if(message.method==='tools/list'){
if(mode==='hang')return;
if(mode==='oversized'){process.stdout.write('x'.repeat(1500001)+'\\n');return;}
if(mode==='request'){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:99,method:'tools/call',params:{name:'unexpected'}})+'\\n');return;}
const bytes=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:2,result:{tools:names.map(name=>({name,inputSchema:{type:'object',title:'é'}}))}})+'\\n');
const split=bytes.indexOf(Buffer.from('é'))+1;process.stdout.write(bytes.subarray(0,split));setImmediate(()=>process.stdout.write(bytes.subarray(split)));
}});`;
function fixture(mode = "normal") {
  const child = spawn(process.execPath, ["-e", script, mode], {
    stdio: "pipe",
  });
  let trace = "";
  child.stderr.on("data", (chunk) => (trace += chunk.toString()));
  return { child, trace: () => trace };
}

test("bounded REA exchange sends only initialize and catalog methods, handles split UTF-8 and waits for clean exit", async () => {
  const { child, trace } = fixture();
  const result = await reaCatalogExchange(child, new AbortController().signal);
  expect(result.tools).toHaveLength(6);
  expect(result.tools[0].schemaSha256).toBe(
    createHash("sha256")
      .update(JSON.stringify({ type: "object", title: "é" }))
      .digest("hex"),
  );
  expect(trace().trim().split("\n")).toEqual([
    "trace:initialize",
    "trace:notifications/initialized",
    "trace:tools/list",
  ]);
  expect(child.exitCode).toBe(0);
});

test("unrecognized server, tool requests and oversized output stop only the owned protocol process", async () => {
  for (const mode of ["wrong", "request", "oversized"]) {
    const { child } = fixture(mode);
    await expect(
      reaCatalogExchange(child, new AbortController().signal),
    ).rejects.toMatchObject({ status: 503 });
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  }
});

test("cancelling a catalog check stops the owned process without a ready result", async () => {
  const { child } = fixture("hang"),
    controller = new AbortController();
  const result = reaCatalogExchange(child, controller.signal);
  setTimeout(() => controller.abort(), 100);
  await expect(result).rejects.toThrow("cancelled");
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
});

test("incompatible server runtime does not launch a protocol process", async () => {
  test.skip(
    reaRuntimeCompatible(process.version),
    "This guard scenario requires the older cloud runtime.",
  );
  await expect(
    inspectReaProtocol(new AbortController().signal),
  ).rejects.toMatchObject({ status: 409 });
});

test("the pinned real REA process completes a compatible-runtime catalog check without invoking tools", async () => {
  const node = process.env.NEXUS_REA_TEST_NODE,
    pkg = process.env.NEXUS_REA_TEST_PACKAGE;
  test.skip(
    !node || !pkg,
    "Explicit isolated compatible runtime/package fixture is required.",
  );
  const child = spawn(node!, [path.join(pkg!, "scripts", "rea.mjs"), "mcp"], {
    cwd: pkg!,
    env: {
      NODE_ENV: "test",
      PATH: process.env.PATH,
      REA_MCP_TOOL_FAMILIES: "browser",
    },
    stdio: "pipe",
  });
  const result = await reaCatalogExchange(child, new AbortController().signal);
  expect(result.serverVersion).toBe("6.10.1");
  expect(result.tools).toHaveLength(6);
  expect(child.exitCode).toBe(0);
});

test("protocol API remains controller-only and cannot accept caller RPC methods", async ({
  context,
}) => {
  const data = { action: "rea-protocol-check" };
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
  expect(
    (
      await context.request.post("/api/sync/agents", {
        data: { ...data, method: "tools/call" },
      })
    ).status(),
  ).toBe(400);
});

test("desktop and phone launch protocol check only on explicit request and show catalog separately from browser readiness", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  let calls = 0;
  await page.route("**/api/sync/agents", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { providers: [], events: [] } });
    expect(route.request().postDataJSON()).toEqual({
      action: "rea-protocol-check",
    });
    calls++;
    return route.fulfill({
      json: {
        serverVersion: "6.10.1",
        tools: [{ name: "inspect_web_page", schemaSha256: "a".repeat(64) }],
        checkedAt: new Date().toISOString(),
        notice:
          "Protocol and clean shutdown verified. Site inspection remains unconnected.",
      },
    });
  });
  await page.goto("/nexus");
  await page.getByText("Connection activity", { exact: true }).click();
  await page.getByText("REA inspection prerequisites", { exact: true }).click();
  expect(calls).toBe(0);
  await page
    .getByRole("button", {
      name: "Test REA protocol without browser",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", { name: "REA protocol results" }),
  ).toContainText("Site inspection remains unconnected");
  expect(calls).toBe(1);
});
