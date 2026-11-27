import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { GGUF_METADATA_LIMIT, parseGgufMetadata } from "../lib/gguf-metadata";
import {
  inspectHubArchiveMetadata,
  readHubArchive,
} from "../lib/server/hub-archive-history";
import { fixtureRole } from "./helpers/access";
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const u64 = (n: number) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};
const str = (v: string) =>
  Buffer.concat([u64(Buffer.byteLength(v)), Buffer.from(v)]);
const entry = (key: string, type: number, value: Buffer) =>
  Buffer.concat([str(key), u32(type), value]);
function model(
  entries = [
    entry("general.architecture", 8, str("llama")),
    entry("general.name", 8, str("Tiny fixture")),
    entry("llama.context_length", 4, u32(4096)),
  ],
  version = 3,
) {
  return Buffer.concat([
    Buffer.from("GGUF"),
    u32(version),
    u64(42),
    u64(entries.length),
    ...entries,
    Buffer.from("tensor bytes are not parsed"),
  ]);
}
test("GGUF v2/v3 metadata projection skips arrays and does not invent unknown fields", () => {
  for (const version of [2, 3]) {
    const parsed = parseGgufMetadata(
      model(
        [
          entry(
            "ignored.tokens",
            9,
            Buffer.concat([u32(8), u64(2), str("one"), str("two")]),
          ),
          entry("general.architecture", 8, str("llama")),
          entry("llama.context_length", 4, u32(4096)),
        ],
        version,
      ),
    );
    expect(parsed).toMatchObject({
      version,
      tensorCount: 42,
      metadataRead: 3,
      metadataComplete: true,
      architecture: "llama",
      contextLength: 4096,
      modelName: null,
      blockCount: null,
    });
  }
});
test("bounded metadata reports incomplete coverage; malformed headers, types and duplicate keys reject", () => {
  const huge = model([
    entry(
      "huge",
      8,
      Buffer.concat([
        u64(GGUF_METADATA_LIMIT),
        Buffer.alloc(GGUF_METADATA_LIMIT),
      ]),
    ),
  ]);
  const parsed = parseGgufMetadata(huge);
  expect(parsed.metadataComplete).toBe(false);
  expect(parsed.metadataRead).toBe(0);
  expect(parsed.bytesInspected).toBe(GGUF_METADATA_LIMIT);
  for (const bytes of [
    Buffer.from("invalid"),
    model([], 1),
    model([entry("bad", 99, Buffer.alloc(0))]),
    model([entry("same", 4, u32(1)), entry("same", 4, u32(2))]),
  ])
    expect(() => parseGgufMetadata(bytes)).toThrow();
  const control = parseGgufMetadata(
    model([entry("general.name", 8, str("untrusted\nname"))]),
  );
  expect(control.modelName).toBeNull();
});
async function fixture(
  run: (root: string, digest: string, receipt: any) => Promise<void>,
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gguf-metadata-")),
    previous = process.env.GW_SYNC_DATA_DIR,
    transport = global.fetch;
  const bytes = model(),
    sha = createHash("sha256").update(bytes).digest("hex");
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
  process.env.GW_SYNC_DATA_DIR = root;
  global.fetch = async () => {
    throw Error("Network forbidden");
  };
  try {
    const dir = path.join(root, "model-assets/asset-000");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "model.gguf"), bytes);
    const raw = JSON.stringify(receipt);
    await fs.writeFile(path.join(dir, "receipt.json"), raw);
    await run(root, createHash("sha256").update(raw).digest("hex"), receipt);
  } finally {
    global.fetch = transport;
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
}
test("local metadata inspection preserves bytes, receipts and mtime without provider calls", async () => {
  await fixture(async (root, digest, receipt) => {
    const dir = path.join(root, "model-assets/asset-000"),
      before = await fs.stat(path.join(dir, "model.gguf"));
    const r = await inspectHubArchiveMetadata(
      "asset-000",
      digest,
      new AbortController().signal,
    );
    expect(r.metadata.architecture).toBe("llama");
    expect(r.runId).toBe(receipt.runId);
    expect(r.notice).toContain("hardware fit");
    expect((await fs.stat(path.join(dir, "model.gguf"))).mtimeMs).toBe(
      before.mtimeMs,
    );
    expect(
      JSON.parse(await fs.readFile(path.join(dir, "receipt.json"), "utf8")),
    ).toEqual(receipt);
    expect(await fs.readdir(dir)).toEqual(["model.gguf", "receipt.json"]);
  });
});
test("stale receipts, caller paths, cancelled reads, size changes and symlink models are rejected", async () => {
  await fixture(async (root, digest) => {
    const signal = new AbortController().signal;
    await expect(
      inspectHubArchiveMetadata("../asset-000", digest, signal),
    ).rejects.toThrow();
    await expect(
      inspectHubArchiveMetadata("asset-000", "0".repeat(64), signal),
    ).rejects.toThrow();
    const c = new AbortController();
    c.abort();
    await expect(
      inspectHubArchiveMetadata("asset-000", digest, c.signal),
    ).rejects.toThrow();
    const name = path.join(root, "model-assets/asset-000/model.gguf");
    await fs.appendFile(name, "x");
    await expect(
      inspectHubArchiveMetadata("asset-000", digest, signal),
    ).rejects.toThrow();
    await fs.unlink(name);
    await fs.symlink(
      path.join(root, "model-assets/asset-000/receipt.json"),
      name,
    );
    await expect(
      inspectHubArchiveMetadata("asset-000", digest, signal),
    ).rejects.toThrow();
  });
});
test("compiled metadata API keeps controller/origin and exact-input guards", async ({
  request,
  context,
}) => {
  const body = {
    action: "metadata",
    slot: "asset-000",
    receiptSha256: "a".repeat(64),
  };
  expect(
    (
      await request.post("/api/sync/models/hub/archive", { data: body })
    ).status(),
  ).toBe(401);
  await fixtureRole(context);
  expect(
    (
      await context.request.post("/api/sync/models/hub/archive", {
        data: body,
        headers: { Origin: "https://foreign.invalid" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post("/api/sync/models/hub/archive", {
        data: { ...body, path: "/tmp/private" },
      })
    ).status(),
  ).toBe(400);
});
test("desktop and phone explicitly inspect declared metadata and clear stale or denied results", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let record: any;
  await fixture(async (_root) => {
    record = (await readHubArchive(new AbortController().signal)).records[0];
  });
  let count = 0,
    deny = false,
    stale = false;
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
          notice: "Local records",
        },
      });
    count++;
    expect(body).toEqual({
      action: "metadata",
      slot: record.slot,
      receiptSha256: record.receiptSha256,
    });
    return deny
      ? route.fulfill({ status: 403, json: { error: "Controller required" } })
      : route.fulfill({
          json: {
            slot: record.slot,
            runId: stale ? "different" : record.runId,
            receiptSha256: record.receiptSha256,
            metadata: parseGgufMetadata(model()),
            notice:
              "Declared metadata only. No runtime compatibility or hardware fit verified.",
          },
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
  expect(count).toBe(0);
  const section = page.getByRole("region", {
    name: "GGUF metadata asset-000",
    exact: true,
  });
  await section
    .getByRole("button", {
      name: "Inspect GGUF metadata · asset-000",
      exact: true,
    })
    .click();
  await expect(section.getByText("llama", { exact: true })).toBeVisible();
  await expect(section.getByText("4096", { exact: true })).toBeVisible();
  await section.scrollIntoViewIfNeeded();
  await fs.mkdir("artifacts/gguf-metadata", { recursive: true });
  await section.screenshot({
    path: `artifacts/gguf-metadata/${info.project.name}.png`,
  });
  expect(
    await section.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  stale = true;
  await section
    .getByRole("button", {
      name: "Inspect GGUF metadata · asset-000",
      exact: true,
    })
    .click();
  await expect(
    section.getByText("The record changed. Inspect the archive again."),
  ).toBeVisible();
  await expect(section.getByText("llama", { exact: true })).toHaveCount(0);
  deny = true;
  await section
    .getByRole("button", {
      name: "Inspect GGUF metadata · asset-000",
      exact: true,
    })
    .click();
  await expect(
    section.getByText("Controller required", { exact: true }),
  ).toBeVisible();
});

test("compiled production API reads real local metadata without changing the archive", async ({
  context,
}) => {
  await fixtureRole(context);
  let receipt: any;
  await fixture(async (_root, _digest, source) => {
    receipt = { ...source, archiveFile: "asset-099/model.gguf" };
  });
  const dir = path.join(
    process.env.GW_SYNC_TEST_ROOT!,
    "model-assets/asset-099",
  );
  await fs.mkdir(dir, { recursive: true });
  const raw = JSON.stringify(receipt),
    bytes = model(),
    name = path.join(dir, "model.gguf");
  await fs.writeFile(name, bytes);
  await fs.writeFile(path.join(dir, "receipt.json"), raw);
  try {
    const before = await fs.stat(name);
    const response = await context.request.post(
      "/api/sync/models/hub/archive",
      {
        data: {
          action: "metadata",
          slot: "asset-099",
          receiptSha256: createHash("sha256").update(raw).digest("hex"),
        },
      },
    );
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      slot: "asset-099",
      runId: receipt.runId,
      metadata: {
        architecture: "llama",
        contextLength: 4096,
        metadataComplete: true,
      },
    });
    expect(await fs.readFile(name)).toEqual(bytes);
    expect((await fs.stat(name)).mtimeMs).toBe(before.mtimeMs);
    expect(await fs.readFile(path.join(dir, "receipt.json"), "utf8")).toBe(raw);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
