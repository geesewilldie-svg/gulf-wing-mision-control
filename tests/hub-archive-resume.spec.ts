import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { readHubArchive } from "../lib/server/hub-archive-history";
import { resumeHubArtifact } from "../lib/server/hub-archive-resume";
import { fixtureRole } from "./helpers/access";
const data = Buffer.from("GGUF synthetic resume fixture, not a runnable model"),
  sha = createHash("sha256").update(data).digest("hex"),
  revision = "a".repeat(40);
const manifest = () => ({
  id: "owner/model",
  sha: revision,
  private: false,
  gated: false,
  cardData: { license: "apache-2.0" },
  siblings: [
    {
      rfilename: "model.gguf",
      size: data.length,
      lfs: { size: data.length, sha256: sha },
    },
  ],
});
function receipt(state = "started") {
  return {
    version: 1,
    kind: "hub-model-archive",
    runId: randomUUID(),
    state,
    startedAt: "2026-11-26T12:00:00.000Z",
    finishedAt: "2026-11-26T12:00:01.000Z",
    repository: "owner/model",
    revision,
    sourceFilename: "model.gguf",
    reportedLicense: "apache-2.0",
    expectedBytes: data.length,
    expectedSha256: sha,
    archiveFile: "asset-000/model.gguf",
    licenseReviewed: true,
    archiveOnly: true,
    runtimeImported: false,
    inferenceReady: false,
  };
}
async function fixture(
  run: (root: string, dir: string) => Promise<void>,
  prefix = data.subarray(0, 12),
  state = "started",
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "archive-resume-")),
    dir = path.join(root, "model-assets", "asset-000"),
    old = process.env.GW_SYNC_DATA_DIR,
    fetcher = global.fetch;
  process.env.GW_SYNC_DATA_DIR = root;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "receipt.json"),
    JSON.stringify(receipt(state)),
  );
  await fs.writeFile(path.join(dir, "model.partial"), prefix);
  try {
    await run(root, dir);
  } finally {
    global.fetch = fetcher;
    if (old === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = old;
    await fs.rm(root, { recursive: true, force: true });
  }
}
async function request() {
  const record = (
    await readHubArchive(new AbortController().signal)
  ).records.find((r) => r.slot === "asset-000")!;
  return {
    action: "resume",
    slot: record.slot,
    receiptSha256: record.receiptSha256,
    expectedLicense: record.reportedLicense,
    licenseReviewed: true,
    archiveOnly: true,
  };
}
function transport(start = 12, mode = "range") {
  return async (url: URL | RequestInfo, options?: RequestInit) => {
    if (String(url).includes("/api/models/")) return Response.json(manifest());
    expect(String(url)).toBe(
      `https://huggingface.co/owner/model/resolve/${revision}/model.gguf?download=true`,
    );
    expect((options?.headers as any).Range).toBe(`bytes=${start}-`);
    expect(options?.credentials).toBe("omit");
    if (mode === "ignored") return new Response(new Uint8Array(data));
    return new Response(new Uint8Array(data.subarray(start)), {
      status: 206,
      headers: {
        "content-range": `bytes ${mode === "wrong" ? start + 1 : start}-${data.length - 1}/${data.length}`,
        "content-length": String(data.length - start),
      },
    });
  };
}
const signal = () => new AbortController().signal;

test("resume copies a stable prefix into a new slot, requests an exact range and verifies the complete file", async () => {
  for (const state of ["started", "failed", "cancelled"])
    await fixture(
      async (root, dir) => {
        const source = await fs.readFile(path.join(dir, "receipt.json")),
          prefix = await fs.readFile(path.join(dir, "model.partial")),
          before = await fs.stat(path.join(dir, "model.partial"));
        global.fetch = transport();
        const result = await resumeHubArtifact(await request(), signal());
        expect(result.state).toBe("verified");
        expect(result.resumedFrom?.slot).toBe("asset-000");
        expect(result.resumedFrom?.prefixBytes).toBe(12);
        expect(result.archiveFile).toBe("asset-001/model.gguf");
        expect(
          await fs.readFile(
            path.join(root, "model-assets", result.archiveFile),
          ),
        ).toEqual(data);
        expect(result.sha256).toBe(sha);
        expect(result.inferenceReady).toBe(false);
        expect(await fs.readFile(path.join(dir, "receipt.json"))).toEqual(
          source,
        );
        expect(await fs.readFile(path.join(dir, "model.partial"))).toEqual(
          prefix,
        );
        expect((await fs.stat(path.join(dir, "model.partial"))).mtimeMs).toBe(
          before.mtimeMs,
        );
        const list = await readHubArchive(signal()),
          resumed = list.records.find((r) => r.slot === "asset-001")!;
        expect(resumed.resumedFrom?.slot).toBe("asset-000");
        expect(list.records.find((r) => r.slot === "asset-000")?.state).toBe(
          state,
        );
      },
      data.subarray(0, 12),
      state,
    );
});

test("complete retained files are copied and verified without a model-body request", async () => {
  await fixture(async (root) => {
    let metadata = 0;
    global.fetch = async (url) => {
      expect(String(url)).toContain("/api/models/");
      metadata++;
      return Response.json(manifest());
    };
    const result = await resumeHubArtifact(await request(), signal());
    expect(metadata).toBe(1);
    expect(result.resumedFrom?.prefixBytes).toBe(data.length);
    expect(
      await fs.readFile(path.join(root, "model-assets", result.archiveFile)),
    ).toEqual(data);
  }, data);
});

test("ignored or incorrect ranges and a poisoned prefix never publish a new model or replace the source", async () => {
  for (const mode of ["ignored", "wrong", "poisoned"])
    await fixture(
      async (root, dir) => {
        const original = await fs.readFile(path.join(dir, "model.partial"));
        let bodies = 0;
        const base = transport(12, mode);
        global.fetch = async (url, options) => {
          if (String(url).includes("/resolve/")) bodies++;
          return base(url, options);
        };
        await expect(
          resumeHubArtifact(await request(), signal()),
        ).rejects.toThrow();
        expect(bodies).toBe(1);
        expect(await fs.readFile(path.join(dir, "model.partial"))).toEqual(
          original,
        );
        const failed = path.join(root, "model-assets", "asset-001");
        expect(await fs.readdir(failed)).toEqual(["receipt.json"]);
        expect(
          JSON.parse(
            await fs.readFile(path.join(failed, "receipt.json"), "utf8"),
          ).state,
        ).toBe("failed");
      },
      mode === "poisoned" ? Buffer.from("GGUFpoisoned") : data.subarray(0, 12),
    );
});

test("receipt/prefix changes, existing publication and unsafe source files reject resume", async () => {
  await fixture(async (root, dir) => {
    const body = await request();
    await fs.appendFile(path.join(dir, "receipt.json"), " ");
    global.fetch = async () => {
      throw Error("No request expected");
    };
    await expect(resumeHubArtifact(body, signal())).rejects.toMatchObject({
      status: 409,
    });
    expect(await fs.readdir(path.join(root, "model-assets"))).toEqual([
      "asset-000",
    ]);
  });
  await fixture(async (_root, dir) => {
    const body = await request();
    global.fetch = async (url) => {
      expect(String(url)).toContain("/api/models/");
      await fs.appendFile(path.join(dir, "model.partial"), "x");
      return Response.json(manifest());
    };
    await expect(resumeHubArtifact(body, signal())).rejects.toMatchObject({
      status: 409,
    });
    expect(await fs.readFile(path.join(dir, "model.partial"))).toEqual(
      Buffer.concat([data.subarray(0, 12), Buffer.from("x")]),
    );
  });
  await fixture(async (_root, dir) => {
    await fs.writeFile(path.join(dir, "model.gguf"), data);
    await expect(
      resumeHubArtifact(await request(), signal()),
    ).rejects.toMatchObject({ status: 409 });
  });
  await fixture(async (root, dir) => {
    await fs.unlink(path.join(dir, "model.partial"));
    await fs.writeFile(path.join(root, "private.txt"), "PRIVATE");
    await fs.symlink(
      path.join(root, "private.txt"),
      path.join(dir, "model.partial"),
    );
    await expect(
      resumeHubArtifact(await request(), signal()),
    ).rejects.toMatchObject({ status: 409 });
    expect(await fs.readFile(path.join(root, "private.txt"), "utf8")).toBe(
      "PRIVATE",
    );
  });
});

test("cancelled resumed tails retain the original prefix and do not publish or automatically restart", async () => {
  await fixture(async (root, dir) => {
    const controller = new AbortController();
    let started: () => void = () => {};
    const waiting = new Promise<void>((r) => (started = r));
    let bodies = 0;
    global.fetch = async (url, options) => {
      if (String(url).includes("/api/models/"))
        return Response.json(manifest());
      bodies++;
      expect((options?.headers as any).Range).toBe("bytes=12-");
      started();
      return new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new Uint8Array(data.subarray(12, 16)));
          },
        }),
        {
          status: 206,
          headers: {
            "content-range": `bytes 12-${data.length - 1}/${data.length}`,
          },
        },
      );
    };
    const body = await request(),
      pending = resumeHubArtifact(body, controller.signal);
    await waiting;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ status: 499 });
    expect(bodies).toBe(1);
    expect(await fs.readFile(path.join(dir, "model.partial"))).toEqual(
      data.subarray(0, 12),
    );
    expect(
      await fs.readdir(path.join(root, "model-assets", "asset-001")),
    ).toEqual(["receipt.json"]);
  });
});

test("resume API remains controller-only, origin-bound and rejects caller transfer parameters", async ({
  context,
}) => {
  const url = "/api/sync/models/hub/archive",
    body = {
      action: "resume",
      slot: "asset-000",
      receiptSha256: "a".repeat(64),
      expectedLicense: "apache-2.0",
      licenseReviewed: true,
      archiveOnly: true,
    };
  expect((await context.request.post(url, { data: body })).status()).toBe(401);
  await fixtureRole(context, "display");
  expect((await context.request.post(url, { data: body })).status()).toBe(403);
  await fixtureRole(context);
  expect(
    (
      await context.request.post(url, {
        data: body,
        headers: { Origin: "https://foreign.test" },
      })
    ).status(),
  ).toBe(403);
  for (const change of [
    { licenseReviewed: false },
    { archiveOnly: false },
    { destination: "C:\\other" },
    { url: "https://evil.test" },
    { range: "bytes=5-" },
    { token: "secret" },
  ])
    expect(
      (
        await context.request.post(url, { data: { ...body, ...change } })
      ).status(),
    ).toBe(400);
});

test("desktop and phone require explicit review for a new resumed copy and show the preserved original", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let resumes = 0;
  const record = {
    slot: "asset-000",
    runId: randomUUID(),
    state: "started",
    repository: "owner/model",
    revision,
    sourceFilename: "model.gguf",
    reportedLicense: "apache-2.0",
    recordedBytes: data.length,
    recordedSha256: sha,
    recordedAt: "2026-11-26T12:00:00.000Z",
    fileState: "missing",
    fileBytes: null,
    partialPresent: true,
    partialBytes: 12,
    receiptSha256: "c".repeat(64),
  };
  await page.route("**/api/sync/models/hub/archive", (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "list")
      return route.fulfill({
        json: {
          state: "available",
          readAt: "2026-11-26T12:01:00.000Z",
          records: [record],
          validRecords: 1,
          withheldRecords: 0,
          occupiedSlots: 1,
          capacity: 100,
          pageLimit: 20,
          notice: "Recorded archive metadata only.",
        },
      });
    resumes++;
    expect(body).toEqual({
      action: "resume",
      slot: record.slot,
      receiptSha256: record.receiptSha256,
      expectedLicense: record.reportedLicense,
      licenseReviewed: true,
      archiveOnly: true,
    });
    return route.fulfill({
      json: {
        version: 1,
        state: "verified",
        runId: "new-run",
        repository: "owner/model",
        revision,
        sourceFilename: "model.gguf",
        reportedLicense: "apache-2.0",
        bytes: data.length,
        sha256: sha,
        verifiedAt: "2026-11-26T12:02:00.000Z",
        archiveFile: "asset-001/model.gguf",
        receiptState: "saved",
        downloaded: true,
        runtimeImported: false,
        inferenceReady: false,
        resumedFrom: {
          slot: record.slot,
          runId: record.runId,
          receiptSha256: record.receiptSha256,
          prefixBytes: 12,
        },
        notice: "New archive copy verified; no runtime import.",
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
  const button = page.getByRole("button", {
    name: "Resume retained partial · asset-000",
    exact: true,
  });
  await expect(button).toBeDisabled();
  expect(resumes).toBe(0);
  await page
    .getByRole("checkbox", {
      name: "I reviewed this commit's license and want to resume an archive-only copy into a new slot.",
      exact: true,
    })
    .check();
  await button.click();
  const result = page.getByRole("region", {
    name: "Archive resume result asset-000",
    exact: true,
  });
  await expect(result).toContainText("New archive copy verified");
  await expect(result).toContainText("asset-001/model.gguf");
  await expect(result).toContainText("original run outcome is unchanged");
  await expect(button).toBeDisabled();
  expect(resumes).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await result.screenshot({
    path: `artifacts/hub-resume/${info.project.name}.png`,
    animations: "disabled",
  });
});
