import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { reviewHubImport } from "../lib/server/hub-import-review";
import { readHubArchive } from "../lib/server/hub-archive-history";
import { POST } from "../app/api/sync/models/hub/archive/route";
import { token } from "../lib/server/sync-store";
import { fixtureRole } from "./helpers/access";
const u64 = (n: number) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const str = (v: string) =>
  Buffer.concat([u64(Buffer.byteLength(v)), Buffer.from(v)]);
const bytes = Buffer.concat([
  Buffer.from("GGUF"),
  u32(3),
  u64(2),
  u64(2),
  str("general.architecture"),
  u32(8),
  str("llama"),
  str("llama.context_length"),
  u32(4),
  u32(4096),
  Buffer.from("unparsed tensor fixture"),
]);
const sha = createHash("sha256").update(bytes).digest("hex");
const request = (receiptSha256: string) => ({
  action: "import-review",
  slot: "asset-000",
  receiptSha256,
});
const signal = () => new AbortController().signal;
async function fixture(
  run: (
    root: string,
    digest: string,
    receipt: any,
    config: any,
  ) => Promise<void>,
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "import-review-")),
    previous = process.env.GW_SYNC_DATA_DIR,
    transport = global.fetch;
  process.env.GW_SYNC_DATA_DIR = root;
  const receipt = {
    version: 1,
    kind: "hub-model-archive",
    runId: randomUUID(),
    state: "verified",
    startedAt: "2026-11-26T12:00:00.000Z",
    verifiedAt: "2026-11-26T12:00:01.000Z",
    repository: "owner/model",
    revision: "a".repeat(40),
    sourceFilename: "model.gguf",
    reportedLicense: "apache-2.0",
    expectedBytes: bytes.length,
    expectedSha256: sha,
    archiveFile: "asset-000/model.gguf",
    licenseReviewed: true,
    archiveOnly: true,
    runtimeImported: false,
    inferenceReady: false,
    bytes: bytes.length,
    sha256: sha,
    receiptState: "saved",
    downloaded: true,
  };
  const dir = path.join(root, "model-assets/asset-000"),
    raw = JSON.stringify(receipt),
    config = {
      version: 1,
      pairingHash: "a".repeat(64),
      signingSecret: "b".repeat(64),
    };
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "model.gguf"), bytes);
  await fs.writeFile(path.join(dir, "receipt.json"), raw);
  await fs.writeFile(
    path.join(root, "sync-config.json"),
    JSON.stringify(config),
  );
  global.fetch = async (url, options) => {
    expect(String(url)).toBe("http://127.0.0.1:11434/api/version");
    expect(options?.method).toBe("GET");
    expect(options?.credentials).toBe("omit");
    expect(options?.redirect).toBe("error");
    expect(options?.body).toBeUndefined();
    return Response.json({ version: "0.9.0", privatePath: "PRIVATE PATH" });
  };
  try {
    await run(
      root,
      createHash("sha256").update(raw).digest("hex"),
      receipt,
      config,
    );
  } finally {
    global.fetch = transport;
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
}
test("review binds full current archive hash, declared metadata, reported runtime and host RAM without writes", () =>
  fixture(async (root, digest) => {
    const dir = path.join(root, "model-assets/asset-000"),
      before = await fs.stat(path.join(dir, "model.gguf")),
      raw = await fs.readFile(path.join(dir, "receipt.json"));
    const result = await reviewHubImport(request(digest), signal());
    expect(result).toMatchObject({
      slot: "asset-000",
      receiptSha256: digest,
      sha256: sha,
      bytes: bytes.length,
      metadata: { architecture: "llama", contextLength: 4096 },
      runtime: { state: "version-reported", version: "0.9.0" },
      importImplemented: false,
      runtimeImported: false,
      runtimeStorageVerified: false,
      inferenceReady: false,
    });
    expect(result.hostMemory.totalBytes).toBeGreaterThan(0);
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(await fs.readdir(dir)).toEqual(["model.gguf", "receipt.json"]);
    expect(await fs.readFile(path.join(dir, "model.gguf"))).toEqual(bytes);
    expect(await fs.readFile(path.join(dir, "receipt.json"))).toEqual(raw);
    expect((await fs.stat(path.join(dir, "model.gguf"))).mtimeMs).toBe(
      before.mtimeMs,
    );
  }));
test("same-size tampering outside metadata, stale receipts and unsafe archive paths cannot receive review", () =>
  fixture(async (root, digest) => {
    await expect(
      reviewHubImport(request("0".repeat(64)), signal()),
    ).rejects.toThrow();
    const name = path.join(root, "model-assets/asset-000/model.gguf"),
      tampered = Buffer.from(bytes);
    tampered[tampered.length - 1] ^= 1;
    await fs.writeFile(name, tampered);
    await expect(reviewHubImport(request(digest), signal())).rejects.toThrow(
      /bytes do not match/,
    );
    await fs.unlink(name);
    await fs.symlink(
      path.join(root, "model-assets/asset-000/receipt.json"),
      name,
    );
    await expect(reviewHubImport(request(digest), signal())).rejects.toThrow();
  }));
test("unavailable or malformed runtime version stays unknown and never supplies compatibility acceptance", () =>
  fixture(async (_root, digest) => {
    for (const data of [
      null,
      { version: "bad\nversion" },
      { version: "0.9.0", secret: "private" },
    ]) {
      global.fetch = async () =>
        data
          ? Response.json(data)
          : new Response("private-error", { status: 500 });
      const result = await reviewHubImport(request(digest), signal());
      expect(result.runtime.state).toBe(
        data?.version === "0.9.0" ? "version-reported" : "unavailable",
      );
      expect(result.importImplemented).toBe(false);
      expect(JSON.stringify(result)).not.toContain("private");
    }
  }));
test("unfinished outcomes, missing identities, caller options and cancellation cannot promote readiness", () =>
  fixture(async (root, digest, receipt) => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return Response.json({ version: "0.9.0" });
    };
    for (const value of [
      { ...request(digest), slot: "../asset-000" },
      { ...request(digest), destination: "/private" },
      request("bad"),
    ])
      await expect(reviewHubImport(value, signal())).rejects.toThrow();
    expect(calls).toBe(0);
    const c = new AbortController();
    c.abort();
    await expect(reviewHubImport(request(digest), c.signal)).rejects.toThrow(
      /cancelled/,
    );
    expect(calls).toBe(0);
    const raw = JSON.stringify({ ...receipt, state: "started" });
    await fs.writeFile(
      path.join(root, "model-assets/asset-000/receipt.json"),
      raw,
    );
    await expect(
      reviewHubImport(
        request(createHash("sha256").update(raw).digest("hex")),
        signal(),
      ),
    ).rejects.toThrow(/completed transfer/);
  }));
test("review API requires controller, same origin and exact receipt-bound inputs before any runtime call", () =>
  fixture(async (_root, digest, _receipt, config) => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return Response.json({ version: "0.9.0" });
    };
    const send = (
      role: string | null,
      origin = "http://localhost:3000",
      body: any = request(digest),
    ) =>
      POST(
        new Request("http://localhost:3000/api/sync/models/hub/archive", {
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
          ...request(digest),
          model: "overwrite",
        })
      ).status,
    ).toBe(400);
    expect(calls).toBe(0);
    expect((await send("controller")).status).toBe(200);
    expect(calls).toBe(1);
  }));
test("desktop and phone explicitly review, export truthful blockers and clear stale/denied results", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let record: any, result: any;
  await fixture(async (_root, digest) => {
    record = (await readHubArchive(signal())).records[0];
    result = await reviewHubImport(request(digest), signal());
  });
  let calls = 0,
    stale = false,
    deny = false;
  await page.route("**/api/sync/models/hub/archive", (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "list")
      return route.fulfill({
        json: {
          state: "available",
          records: [record],
          validRecords: 1,
          withheldRecords: 0,
          occupiedSlots: 1,
          capacity: 100,
          pageLimit: 20,
          readAt: new Date().toISOString(),
          notice: "Local archive records",
        },
      });
    calls++;
    expect(body).toEqual(request(record.receiptSha256));
    return deny
      ? route.fulfill({ status: 403, json: { error: "Controller required" } })
      : route.fulfill({
          json: { ...result, runId: stale ? "changed" : result.runId },
        });
  });
  await page.goto("/nexus");
  await page
    .getByRole("navigation", { name: "Nexus sections" })
    .getByRole("button", { name: "Connections", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Models and tools", exact: true })
    .click();
  await page.getByText("Local model archive", { exact: true }).click();
  await page
    .getByRole("button", { name: "Inspect local model archive", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Import review asset-000",
    exact: true,
  });
  expect(calls).toBe(0);
  await panel
    .getByRole("button", {
      name: "Review runtime import · asset-000",
      exact: true,
    })
    .click();
  await expect(
    panel.getByText("Archive checked; import remains unavailable", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(panel.getByText("0.9.0", { exact: true })).toBeVisible();
  await expect(panel.getByText("llama", { exact: true })).toBeVisible();
  await expect(panel.getByRole("listitem")).toHaveCount(result.blockers.length);
  const download = page.waitForEvent("download");
  await panel
    .getByRole("button", {
      name: "Download import review · asset-000",
      exact: true,
    })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "nexus-import-review-asset-000.json",
  );
  await panel.scrollIntoViewIfNeeded();
  await fs.mkdir("artifacts/import-review", { recursive: true });
  await panel.screenshot({
    path: `artifacts/import-review/${info.project.name}.png`,
  });
  expect(
    await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  stale = true;
  await panel
    .getByRole("button", {
      name: "Review runtime import · asset-000",
      exact: true,
    })
    .click();
  await expect(
    panel.getByText("The archive identity changed. Inspect the archive again."),
  ).toBeVisible();
  await expect(
    panel.getByText("Archive checked; import remains unavailable", {
      exact: true,
    }),
  ).toHaveCount(0);
  deny = true;
  await panel
    .getByRole("button", {
      name: "Review runtime import · asset-000",
      exact: true,
    })
    .click();
  await expect(
    panel.getByText("Controller required", { exact: true }),
  ).toBeVisible();
});
test("compiled production review hashes a real archive and only reads the owned runtime version fixture", async ({
  context,
}) => {
  let receipt: any;
  await fixture(async (_root, _digest, source) => {
    receipt = { ...source, archiveFile: "asset-099/model.gguf" };
  });
  const dir = path.join(
    process.env.GW_SYNC_TEST_ROOT!,
    "model-assets/asset-099",
  );
  await fs.mkdir(dir, { recursive: true });
  const raw = JSON.stringify(receipt);
  await fs.writeFile(path.join(dir, "receipt.json"), raw);
  await fs.writeFile(path.join(dir, "model.gguf"), bytes);
  const { createServer } = await import("node:http"),
    calls: string[] = [];
  const server = createServer((req, res) => {
    calls.push(`${req.method} ${req.url}`);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ version: "0.9.0" }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(11434, "127.0.0.1", resolve);
  });
  try {
    await fixtureRole(context);
    const response = await context.request.post(
      "/api/sync/models/hub/archive",
      {
        data: {
          action: "import-review",
          slot: "asset-099",
          receiptSha256: createHash("sha256").update(raw).digest("hex"),
        },
      },
    );
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      slot: "asset-099",
      sha256: sha,
      runtime: { version: "0.9.0" },
      runtimeImported: false,
      importImplemented: false,
    });
    expect(calls).toEqual(["GET /api/version"]);
    expect(await fs.readFile(path.join(dir, "model.gguf"))).toEqual(bytes);
    expect(await fs.readFile(path.join(dir, "receipt.json"), "utf8")).toBe(raw);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await fs.rm(dir, { recursive: true, force: true });
  }
});
