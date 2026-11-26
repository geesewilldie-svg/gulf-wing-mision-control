import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import {
  acquireHubArtifact,
  modelBody,
  permittedModelDelivery,
} from "../lib/server/hub-archive";
import { fixtureRole } from "./helpers/access";
import { acquisitionChecks } from "../lib/server/hub-acquisition";
import { inspectHubModel } from "../lib/server/hub-model";
const payload = Buffer.from(
  "GGUFsynthetic archive fixture, not a runnable model",
);
const digest = createHash("sha256").update(payload).digest("hex"),
  revision = "a".repeat(40);
const selection = () => ({
  repository: "owner/model",
  revision,
  filename: "model.gguf",
  expectedBytes: payload.length,
  expectedSha256: digest,
  expectedLicense: "apache-2.0",
  licenseReviewed: true,
  archiveOnly: true,
});
const metadata = (sha256 = digest) => ({
  id: "owner/model",
  sha: revision,
  private: false,
  gated: false,
  cardData: { license: "apache-2.0" },
  siblings: [
    {
      rfilename: "model.gguf",
      size: payload.length,
      lfs: { size: payload.length, sha256 },
    },
  ],
});
async function fixture(run: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hub-archive-")),
    previous = process.env.GW_SYNC_DATA_DIR,
    fetcher = global.fetch;
  process.env.GW_SYNC_DATA_DIR = root;
  try {
    await run(root);
  } finally {
    global.fetch = fetcher;
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
}
function transport(bytes = payload, reportedDigest = digest) {
  return async (url: URL | RequestInfo, options?: RequestInit) => {
    const address = String(url);
    expect(options?.method).toBe("GET");
    expect(options?.credentials).toBe("omit");
    expect((options?.headers as any)?.Authorization).toBeUndefined();
    if (address.includes("/api/models/"))
      return Response.json(metadata(reportedDigest));
    expect(address).toBe(
      `https://huggingface.co/owner/model/resolve/${revision}/model.gguf?download=true`,
    );
    return new Response(new Uint8Array(bytes));
  };
}

test("streamed archive bytes and local readback match source digest and a create-only receipt; no runtime is activated", async () => {
  await fixture(async (root) => {
    global.fetch = transport();
    const result = await acquireHubArtifact(
      selection(),
      new AbortController().signal,
    );
    expect(result.state).toBe("verified");
    expect(result.bytes).toBe(payload.length);
    expect(result.sha256).toBe(digest);
    expect(result.runtimeImported).toBe(false);
    expect(result.inferenceReady).toBe(false);
    expect(
      await fs.readFile(path.join(root, "model-assets", result.archiveFile)),
    ).toEqual(payload);
    const record = JSON.parse(
      await fs.readFile(
        path.join(root, "model-assets", "asset-000", "receipt.json"),
        "utf8",
      ),
    );
    expect(record.state).toBe("verified");
    expect(record.sha256).toBe(digest);
    expect(record.licenseReviewed).toBe(true);
    expect(
      await fs.readdir(path.join(root, "model-assets", "asset-000")),
    ).toEqual(["model.gguf", "receipt.json"]);
    const second = await acquireHubArtifact(
      selection(),
      new AbortController().signal,
    );
    expect(second.archiveFile).not.toBe(result.archiveFile);
    expect(
      await fs.readFile(path.join(root, "model-assets", result.archiveFile)),
    ).toEqual(payload);
  });
});

test("wrong digest, short/extra data, bad magic and response size mismatches never publish model files", async () => {
  for (const problem of ["digest", "short", "extra", "magic", "length"]) {
    await fixture(async (root) => {
      const badHash = "f".repeat(64),
        body =
          problem === "short"
            ? payload.subarray(0, -1)
            : problem === "extra"
              ? Buffer.concat([payload, Buffer.from("x")])
              : problem === "magic"
                ? Buffer.concat([Buffer.from("BAD!"), payload.subarray(4)])
                : payload;
      const base = transport(body, problem === "digest" ? badHash : digest);
      global.fetch = async (url, options) =>
        String(url).includes("/resolve/") && problem === "length"
          ? new Response(new Uint8Array(payload), {
              headers: { "content-length": "999" },
            })
          : base(url, options);
      await expect(
        acquireHubArtifact(
          {
            ...selection(),
            expectedSha256: problem === "digest" ? badHash : digest,
          },
          new AbortController().signal,
        ),
      ).rejects.toThrow();
      const dir = path.join(root, "model-assets", "asset-000");
      expect(await fs.readdir(dir)).toEqual(["receipt.json"]);
      expect(
        JSON.parse(await fs.readFile(path.join(dir, "receipt.json"), "utf8"))
          .state,
      ).toBe("failed");
    });
  }
});

test("delivery redirects are bounded HTTPS allowlisted GETs and never forward credentials or leak signed query data", async () => {
  const previous = global.fetch,
    calls: string[] = [];
  global.fetch = async (url, options) => {
    calls.push(String(url));
    expect(options?.redirect).toBe("manual");
    expect(options?.credentials).toBe("omit");
    return calls.length === 1
      ? new Response(null, {
          status: 302,
          headers: {
            location:
              "https://cas-bridge.xethub.hf.co/fixture?signature=SECRET",
          },
        })
      : new Response(new Uint8Array(payload));
  };
  try {
    const response = await modelBody(
      new URL("https://huggingface.co/fixture"),
      new AbortController().signal,
    );
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
    for (const url of [
      "http://huggingface.co/file",
      "https://huggingface.co.evil.test/file",
      "https://user:pass@huggingface.co/file",
      "https://127.0.0.1/file",
      "https://huggingface.co:8443/file",
    ])
      expect(permittedModelDelivery(new URL(url))).toBe(false);
    calls.length = 0;
    global.fetch = async (url) => {
      calls.push(String(url));
      return new Response(null, {
        status: 302,
        headers: { location: "https://evil.test/?secret=PRIVATE" },
      });
    };
    await expect(
      modelBody(
        new URL("https://huggingface.co/fixture"),
        new AbortController().signal,
      ),
    ).rejects.not.toThrow("PRIVATE");
    expect(calls).toHaveLength(1);
    calls.length = 0;
    global.fetch = async (url) => {
      calls.push(String(url));
      return new Response(null, {
        status: 302,
        headers: { location: "/again" },
      });
    };
    await expect(
      modelBody(
        new URL("https://huggingface.co/fixture"),
        new AbortController().signal,
      ),
    ).rejects.toThrow("redirect limit");
    expect(calls).toHaveLength(4);
  } finally {
    global.fetch = previous;
  }
});

test("cancellation cleans an owned partial, keeps its cancelled receipt, and releases single-transfer admission", async () => {
  await fixture(async (root) => {
    const controller = new AbortController();
    let bodyStarted: () => void = () => {};
    const started = new Promise<void>((r) => (bodyStarted = r));
    let cancelled = false;
    global.fetch = async (url) => {
      if (String(url).includes("/api/models/"))
        return Response.json(metadata());
      bodyStarted();
      return new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new Uint8Array(payload.subarray(0, 8)));
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
    };
    const pending = acquireHubArtifact(selection(), controller.signal);
    await started;
    await expect(
      acquireHubArtifact(selection(), new AbortController().signal),
    ).rejects.toMatchObject({ status: 429 });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ status: 499 });
    expect(cancelled).toBe(true);
    expect(
      await fs.readdir(path.join(root, "model-assets", "asset-000")),
    ).toEqual(["receipt.json"]);
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(root, "model-assets", "asset-000", "receipt.json"),
          "utf8",
        ),
      ).state,
    ).toBe("cancelled");
    global.fetch = transport();
    expect(
      (await acquireHubArtifact(selection(), new AbortController().signal))
        .state,
    ).toBe("verified");
  });
});

test("archive quota, changed license and unsafe directory do not overwrite or download weights", async () => {
  await fixture(async (root) => {
    let bodies = 0;
    global.fetch = async (url, options) => {
      if (String(url).includes("/resolve/")) bodies++;
      return transport()(url, options);
    };
    await expect(
      acquireHubArtifact(
        { ...selection(), expectedLicense: "mit" },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await fs.mkdir(path.join(root, "model-assets"));
    for (let i = 0; i < 100; i++)
      await fs.mkdir(
        path.join(root, "model-assets", "asset-" + String(i).padStart(3, "0")),
      );
    await expect(
      acquireHubArtifact(selection(), new AbortController().signal),
    ).rejects.toThrow("100-record limit");
    expect(bodies).toBe(0);
    expect((await fs.readdir(path.join(root, "model-assets"))).length).toBe(
      100,
    );
  });
  await fixture(async (root) => {
    global.fetch = transport();
    await fs.mkdir(path.join(root, "other"));
    await fs.symlink(
      path.join(root, "other"),
      path.join(root, "model-assets"),
      "dir",
    );
    await expect(
      acquireHubArtifact(selection(), new AbortController().signal),
    ).rejects.toMatchObject({ status: 409 });
    expect(await fs.readdir(path.join(root, "other"))).toEqual([]);
  });
});

test("acquisition API requires controller, origin and exact archive-only acknowledgment, and refuses custom paths or tokens", async ({
  context,
}) => {
  const data = selection();
  expect(
    (
      await context.request.post("/api/sync/models/hub/acquire", { data })
    ).status(),
  ).toBe(401);
  await fixtureRole(context, "display");
  expect(
    (
      await context.request.post("/api/sync/models/hub/acquire", { data })
    ).status(),
  ).toBe(403);
  await fixtureRole(context);
  expect(
    (
      await context.request.post("/api/sync/models/hub/acquire", {
        data,
        headers: { Origin: "https://foreign.test" },
      })
    ).status(),
  ).toBe(403);
  for (const change of [
    { licenseReviewed: false },
    { archiveOnly: false },
    { destination: "C:\\private" },
    { token: "secret" },
    { url: "https://evil.test" },
  ])
    expect(
      (
        await context.request.post("/api/sync/models/hub/acquire", {
          data: { ...data, ...change },
        })
      ).status(),
    ).toBe(400);
});

test("desktop and phone require license review, submit the exact artifact once and show archive versus inference status", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  const previous = global.fetch;
  global.fetch = async () => Response.json(metadata());
  let model;
  try {
    model = await inspectHubModel(
      "owner/model",
      revision,
      new AbortController().signal,
    );
  } finally {
    global.fetch = previous;
  }
  const preview = acquisitionChecks(model, "model.gguf", 1e12);
  let transfers = 0;
  await page.route("**/api/sync/models/hub", (r) => r.fulfill({ json: model }));
  await page.route("**/api/sync/models/hub/preview", (r) =>
    r.fulfill({ json: preview }),
  );
  await page.route("**/api/sync/models/hub/acquire", (route) => {
    transfers++;
    expect(route.request().postDataJSON()).toEqual(selection());
    return route.fulfill({
      json: {
        version: 1,
        runId: "fixture",
        state: "verified",
        repository: "owner/model",
        revision,
        sourceFilename: "model.gguf",
        reportedLicense: "apache-2.0",
        bytes: payload.length,
        sha256: digest,
        verifiedAt: "2026-11-26T12:00:00.000Z",
        archiveFile: "asset-000/model.gguf",
        receiptState: "saved",
        downloaded: true,
        runtimeImported: false,
        inferenceReady: false,
        notice:
          "Archive verified. No runtime import or activation was performed.",
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
  await page.getByText("Hugging Face model metadata", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Public model repository", exact: true })
    .fill("owner/model");
  await page
    .getByRole("button", { name: "Look up public model metadata", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review artifact acquisition", exact: true })
    .click();
  const button = page.getByRole("button", {
    name: "Download reviewed file to laptop archive",
    exact: true,
  });
  await expect(button).toBeDisabled();
  expect(transfers).toBe(0);
  await page
    .getByRole("checkbox", {
      name: "I reviewed the license terms for this commit and want to archive this file only.",
      exact: true,
    })
    .check();
  await expect(button).toBeEnabled();
  await button.click();
  const result = page.getByRole("region", {
    name: "Model archive transfer result",
    exact: true,
  });
  await expect(result).toContainText("Archived and verified");
  await expect(result).toContainText("Runtime imported: no");
  await expect(button).toBeDisabled();
  expect(transfers).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await result.screenshot({
    path: `artifacts/hub-archive/${info.project.name}.png`,
    animations: "disabled",
  });
});
