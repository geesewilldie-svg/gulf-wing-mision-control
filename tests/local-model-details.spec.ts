import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectLocalModelDetails } from "../lib/server/local-model-details";
import { POST } from "../app/api/sync/agents/route";
import { token } from "../lib/server/sync-store";
import { fixtureRole } from "./helpers/access";
const name = "fixture:latest",
  digest = "a".repeat(64);
const listed = { name, digest, size: 100, modified_at: "2026-11-26T12:00:00Z" };
const details = {
  details: {
    format: "gguf",
    family: "qwen2",
    parameter_size: "1.5B",
    quantization_level: "Q4_K_M",
  },
  model_info: {
    "general.architecture": "qwen2",
    "general.parameter_count": 1543714816,
    "qwen2.context_length": 32768,
    "qwen2.embedding_length": 1536,
  },
  capabilities: ["completion", "tools"],
  system: "PRIVATE SYSTEM",
  template: "PRIVATE TEMPLATE",
  modelfile: "PRIVATE PATH",
  license: "PRIVATE LICENSE",
  messages: [{ content: "PRIVATE HISTORY" }],
};
const signal = () => new AbortController().signal;
async function fixture(run: (config: any) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "local-details-")),
    previous = process.env.GW_SYNC_DATA_DIR,
    model = process.env.GW_NEXUS_MODEL,
    transport = global.fetch;
  process.env.GW_SYNC_DATA_DIR = dir;
  process.env.GW_NEXUS_MODEL = "fixture";
  const config = {
    version: 1,
    pairingHash: "a".repeat(64),
    signingSecret: "b".repeat(64),
  };
  await fs.writeFile(
    path.join(dir, "sync-config.json"),
    JSON.stringify(config),
  );
  try {
    await run(config);
  } finally {
    global.fetch = transport;
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    if (model === undefined) delete process.env.GW_NEXUS_MODEL;
    else process.env.GW_NEXUS_MODEL = model;
    await fs.rm(dir, { recursive: true, force: true });
  }
}
test("runtime inspection uses fixed catalog/show/catalog calls and projects no private raw model fields", () =>
  fixture(async () => {
    const calls: string[] = [];
    global.fetch = async (url, options) => {
      calls.push(String(url));
      expect(options?.redirect).toBe("error");
      if (String(url).endsWith("/api/tags")) {
        expect(options?.method).toBe("GET");
        return Response.json({ models: [listed] });
      }
      expect(String(url)).toBe("http://127.0.0.1:11434/api/show");
      expect(options?.method).toBe("POST");
      expect(options?.credentials).toBe("omit");
      expect(JSON.parse(String(options?.body))).toEqual({
        model: name,
        verbose: false,
      });
      return Response.json(details);
    };
    const result = await inspectLocalModelDetails(name, digest, signal());
    expect(result).toMatchObject({
      model: name,
      digest,
      architecture: "qwen2",
      quantization: "Q4_K_M",
      contextLength: 32768,
      capabilities: ["completion", "tools"],
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(calls).toEqual([
      "http://127.0.0.1:11434/api/tags",
      "http://127.0.0.1:11434/api/show",
      "http://127.0.0.1:11434/api/tags",
    ]);
  }));
test("unknown and unsupported metadata stays unknown with bounded capability coverage", () =>
  fixture(async () => {
    global.fetch = async (url) =>
      Response.json(
        String(url).endsWith("/api/tags")
          ? { models: [listed] }
          : {
              details: { family: "bad\nfamily", format: 123 },
              model_info: {
                "general.architecture": "qwen2",
                "qwen2.context_length": -1,
              },
              capabilities: ["completion", "\nunsafe", 12],
            },
      );
    const result = await inspectLocalModelDetails(name, digest, signal());
    expect(result).toMatchObject({
      format: null,
      family: null,
      contextLength: null,
      parameterCount: null,
      capabilities: ["completion"],
      capabilitiesKnown: false,
    });
  }));
test("cloud selectors, caller URLs, missing identity and stale catalog identities cannot reach show", () =>
  fixture(async () => {
    let calls = 0;
    global.fetch = async (url) => {
      calls++;
      expect(String(url)).toContain("/api/tags");
      return Response.json({ models: [{ ...listed, digest: "b".repeat(64) }] });
    };
    for (const model of [
      "qwen:cloud",
      "model-cloud:latest",
      "https://host/model",
      "namespace/model:latest",
      "model@cloud",
      "",
    ]) {
      await expect(
        inspectLocalModelDetails(model, digest, signal()),
      ).rejects.toThrow();
    }
    expect(calls).toBe(0);
    await expect(
      inspectLocalModelDetails(name, null, signal()),
    ).rejects.toThrow();
    await expect(
      inspectLocalModelDetails(name, digest, signal()),
    ).rejects.toThrow(/digest changed/);
    expect(calls).toBe(1);
  }));
test("changed catalog identities, remote metadata and oversized responses never yield an accepted model result", () =>
  fixture(async () => {
    for (const mode of ["changed", "remote", "oversized", "failed"]) {
      let tags = 0;
      global.fetch = async (url) => {
        if (String(url).endsWith("/api/tags")) {
          tags++;
          return Response.json({
            models: [
              {
                ...listed,
                digest:
                  tags > 1 && mode === "changed" ? "b".repeat(64) : digest,
              },
            ],
          });
        }
        if (mode === "remote")
          return Response.json({
            ...details,
            remote_host: "https://private.invalid",
          });
        if (mode === "oversized")
          return Response.json({ ...details, template: "x".repeat(500001) });
        if (mode === "failed")
          return new Response("PRIVATE ERROR", { status: 500 });
        return Response.json(details);
      };
      await expect(
        inspectLocalModelDetails(name, digest, signal()),
      ).rejects.toThrow();
    }
  }));
test("cancellation and two-request admission release without a generation or retry", () =>
  fixture(async () => {
    let count = 0;
    const controllers = [new AbortController(), new AbortController()];
    global.fetch = async (_url, options) => {
      count++;
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => reject(Error("cancelled")),
          { once: true },
        );
      });
    };
    const first = inspectLocalModelDetails(name, digest, controllers[0].signal),
      second = inspectLocalModelDetails(name, digest, controllers[1].signal);
    const rejectedFirst = expect(first).rejects.toThrow(/cancelled/),
      rejectedSecond = expect(second).rejects.toThrow(/cancelled/);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await expect(
      inspectLocalModelDetails(name, digest, signal()),
    ).rejects.toThrow(/busy/);
    controllers.forEach((c) => c.abort());
    await Promise.all([rejectedFirst, rejectedSecond]);
    expect(count).toBe(2);
    global.fetch = async (url) =>
      Response.json(
        String(url).endsWith("/api/tags") ? { models: [listed] } : details,
      );
    expect((await inspectLocalModelDetails(name, digest, signal())).model).toBe(
      name,
    );
  }));
test("API detail action requires controller, origin and exact fields", () =>
  fixture(async (config) => {
    let calls = 0;
    global.fetch = async (url) => {
      calls++;
      return Response.json(
        String(url).endsWith("/api/tags") ? { models: [listed] } : details,
      );
    };
    const send = (
      role: string | null,
      origin = "http://localhost:3000",
      body: any = { action: "local-model-details", model: name, digest },
    ) =>
      POST(
        new Request("http://localhost:3000/api/sync/agents", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin,
            "content-type": "application/json",
            ...(role
              ? { cookie: "gw_sync_session=" + token(config, role as any) }
              : {}),
          },
          body: JSON.stringify(body),
        }),
      );
    expect((await send(null)).status).toBe(401);
    expect((await send("display")).status).toBe(403);
    expect((await send("controller", "https://foreign.invalid")).status).toBe(
      403,
    );
    expect(
      (
        await send("controller", undefined, {
          action: "local-model-details",
          model: name,
          digest,
          url: "http://private",
        })
      ).status,
    ).toBe(400);
    expect(calls).toBe(0);
    expect((await send("controller")).status).toBe(200);
    expect(calls).toBe(3);
  }));
test("desktop and phone show explicit runtime details, preserve unknowns and clear denied or stale results", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let calls = 0,
    deny = false,
    stale = false;
  await page.route("**/api/sync/agents", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: { providers: [], events: [], workers: [], obsidian: false },
      });
    const body = route.request().postDataJSON();
    if (body.action === "local-model-catalog")
      return route.fulfill({
        json: {
          configuredModel: "fixture",
          configuredListed: true,
          reportedEntries: 1,
          uniqueModels: 1,
          omitted: 0,
          rejectedEntries: 0,
          checkedAt: new Date().toISOString(),
          models: [{ name, digest, bytes: 100, modifiedAt: null }],
          notice: "Installed list only",
        },
      });
    calls++;
    expect(body).toEqual({
      action: "local-model-details",
      model: name,
      digest,
    });
    return deny
      ? route.fulfill({ status: 403, json: { error: "Controller required" } })
      : route.fulfill({
          json: {
            model: name,
            digest: stale ? "b".repeat(64) : digest,
            checkedAt: new Date().toISOString(),
            format: "gguf",
            family: "qwen2",
            architecture: "qwen2",
            parameterSize: "1.5B",
            parameterCount: null,
            quantization: "Q4_K_M",
            contextLength: 32768,
            embeddingLength: null,
            capabilities: ["completion", "tools"],
            capabilitiesKnown: true,
            capabilitiesOmitted: 0,
            notice: "Reported metadata only. No generation or model change.",
          },
        });
  });
  await page.goto("/nexus");
  await page.getByText("Connection activity", { exact: true }).click();
  const catalog = page.locator(".nexus-local-model-catalog");
  await catalog.locator("summary").click();
  await catalog
    .getByRole("button", {
      name: "Inspect installed local models",
      exact: true,
    })
    .click();
  const panel = page.getByRole("region", {
    name: `Installed model details ${name}`,
    exact: true,
  });
  expect(calls).toBe(0);
  await panel
    .getByRole("button", {
      name: `Inspect model details · ${name}`,
      exact: true,
    })
    .click();
  await expect(panel.getByText("Q4_K_M", { exact: true })).toBeVisible();
  await expect(panel.getByText("32768", { exact: true })).toBeVisible();
  await expect(panel.getByText("Unknown", { exact: true })).toHaveCount(2);
  await panel.scrollIntoViewIfNeeded();
  await fs.mkdir("artifacts/local-model-details", { recursive: true });
  await panel.screenshot({
    path: `artifacts/local-model-details/${info.project.name}.png`,
  });
  expect(
    await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  stale = true;
  await panel
    .getByRole("button", {
      name: `Inspect model details · ${name}`,
      exact: true,
    })
    .click();
  await expect(
    panel.getByText(
      "The model identity changed. Inspect the local catalog again.",
    ),
  ).toBeVisible();
  await expect(panel.getByText("Q4_K_M", { exact: true })).toHaveCount(0);
  deny = true;
  await panel
    .getByRole("button", {
      name: `Inspect model details · ${name}`,
      exact: true,
    })
    .click();
  await expect(
    panel.getByText("Controller required", { exact: true }),
  ).toBeVisible();
});

test("compiled production API inspects an owned loopback runtime fixture with metadata calls only", async ({
  context,
}) => {
  const { createServer } = await import("node:http");
  const calls: { method: string; url: string; body: string }[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk.toString();
    calls.push({ method: req.method!, url: req.url!, body });
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET" && req.url === "/api/tags")
      res.end(JSON.stringify({ models: [listed] }));
    else if (req.method === "POST" && req.url === "/api/show")
      res.end(JSON.stringify(details));
    else {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Unexpected runtime operation" }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(11434, "127.0.0.1", resolve);
  });
  try {
    await fixtureRole(context);
    const response = await context.request.post("/api/sync/agents", {
      data: { action: "local-model-details", model: name, digest },
    });
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      model: name,
      digest,
      quantization: "Q4_K_M",
      contextLength: 32768,
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ["GET", "/api/tags"],
      ["POST", "/api/show"],
      ["GET", "/api/tags"],
    ]);
    expect(JSON.parse(calls[1].body)).toEqual({ model: name, verbose: false });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
