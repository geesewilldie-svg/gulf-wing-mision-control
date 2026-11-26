import { test, expect } from "@playwright/test";
import { inspectHubModel } from "../lib/server/hub-model";
import { fixtureRole } from "./helpers/access";
const commit = "a".repeat(40);
const manifest = () => ({
  id: "owner/model",
  sha: commit,
  private: false,
  gated: false,
  cardData: { license: "apache-2.0" },
  siblings: [
    {
      rfilename: "model.gguf",
      size: 1200,
      blobId: "b".repeat(40),
      lfs: { size: 1200, sha256: "c".repeat(64) },
    },
    { rfilename: "README.md", size: 25, blobId: "d".repeat(40) },
  ],
});
const signal = () => new AbortController().signal;

test("Hub lookup pins main to a commit and returns only reported public metadata with no credentials or generation", async () => {
  const previous = global.fetch,
    calls: { url: string; options: any }[] = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json({
      ...manifest(),
      untrustedPrivateText: "PRIVATE",
      token: "SECRET",
    });
  };
  try {
    const result = await inspectHubModel("owner/model", "", signal());
    expect(calls.map((c) => c.url)).toEqual([
      "https://huggingface.co/api/models/owner/model/revision/main?blobs=true",
      `https://huggingface.co/api/models/owner/model/revision/${commit}?blobs=true`,
    ]);
    for (const { options } of calls) {
      expect(options.method).toBe("GET");
      expect(options.redirect).toBe("error");
      expect(options.credentials).toBe("omit");
      expect(options.headers).toEqual({ Accept: "application/json" });
      expect(options.body).toBeUndefined();
    }
    expect(result.revision).toBe(commit);
    expect(result.totalBytes).toBe(1225);
    expect(result.license).toBe("apache-2.0");
    expect(result.sha256ReportedArtifacts).toBe(1);
    expect(result.artifacts[1].sha256).toBe("c".repeat(64));
    expect(result.downloaded).toBe(false);
    expect(result.inferenceReady).toBe(false);
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  } finally {
    global.fetch = previous;
  }
});

test("lookup rejects unsafe IDs and changed commit identity before accepting a manifest", async () => {
  const previous = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return Response.json(manifest());
  };
  try {
    for (const id of [
      "https://evil.test/model",
      "../secret",
      "owner/model?token=secret",
      "owner/model/other",
      "owner/%2e%2e",
      "owner/..model",
      null,
    ])
      await expect(
        inspectHubModel(id, undefined, signal()),
      ).rejects.toMatchObject({ status: 400 });
    await expect(
      inspectHubModel("owner/model", "branch", signal()),
    ).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(0);
    global.fetch = async () =>
      Response.json({ ...manifest(), sha: "f".repeat(40) });
    await expect(
      inspectHubModel("owner/model", commit, signal()),
    ).rejects.toThrow("did not match");
    global.fetch = async () =>
      Response.json({ ...manifest(), id: "someone/other" });
    await expect(
      inspectHubModel("owner/model", commit, signal()),
    ).rejects.toThrow("unsupported repository");
  } finally {
    global.fetch = previous;
  }
});

test("artifact coverage distinguishes missing hashes/sizes, invalid files and omitted display records", async () => {
  const previous = global.fetch;
  const data = manifest();
  data.siblings = Array.from({ length: 55 }, (_, i) => ({
    rfilename: `part-${i}.gguf`,
    size: i,
    blobId: "b".repeat(40),
  }));
  (data.siblings as any[]).push(
    { rfilename: "config.json" },
    { rfilename: "../escape", size: 99 },
    { rfilename: "part-0.gguf", size: 9 },
    { rfilename: "mismatch.bin", size: 5, lfs: { size: 6 } },
  );
  global.fetch = async () =>
    Response.json({
      ...data,
      cardData: { license: "<invalid>" },
      gated: "manual",
    });
  try {
    const result = await inspectHubModel("owner/model", commit, signal());
    expect(result.validArtifacts).toBe(56);
    expect(result.artifacts).toHaveLength(50);
    expect(result.omittedArtifacts).toBe(6);
    expect(result.withheldArtifacts).toBe(3);
    expect(result.unknownSizeArtifacts).toBe(1);
    expect(result.totalBytes).toBeNull();
    expect(result.knownBytes).toBe(1485);
    expect(result.sha256ReportedArtifacts).toBe(0);
    expect(result.license).toBeNull();
    expect(result.access).toBe("gated-manual");
    expect(result.artifacts.every((a) => a.sha256 === null)).toBe(true);
  } finally {
    global.fetch = previous;
  }
});

test("failed, oversized, unsupported and cancelled Hub requests do not retry or leak upstream errors", async () => {
  const previous = global.fetch;
  try {
    for (const response of [
      new Response("PRIVATE SECRET", { status: 403 }),
      new Response("PRIVATE SECRET", { status: 429 }),
      new Response("x".repeat(2000001)),
      Response.json({ ...manifest(), siblings: Array(2001).fill({}) }),
      Response.json({ ...manifest(), private: true }),
    ]) {
      let count = 0;
      global.fetch = async () => {
        count++;
        return response;
      };
      await expect(
        inspectHubModel("owner/model", commit, signal()),
      ).rejects.not.toThrow("PRIVATE SECRET");
      expect(count).toBe(1);
    }
    global.fetch = async (_url, options) =>
      new Promise((_resolve, reject) => {
        options!.signal!.addEventListener(
          "abort",
          () => reject(Error("aborted")),
          { once: true },
        );
      });
    const controller = new AbortController();
    const pending = inspectHubModel("owner/model", commit, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ status: 499 });
  } finally {
    global.fetch = previous;
  }
});

test("Hub API requires controller and same origin and accepts no token, endpoint, question or file input", async ({
  context,
}) => {
  const data = { repository: "owner/model", revision: commit };
  expect(
    (await context.request.post("/api/sync/models/hub", { data })).status(),
  ).toBe(401);
  await fixtureRole(context, "display");
  expect(
    (await context.request.post("/api/sync/models/hub", { data })).status(),
  ).toBe(403);
  await fixtureRole(context);
  expect(
    (
      await context.request.post("/api/sync/models/hub", {
        data,
        headers: { Origin: "https://foreign.test" },
      })
    ).status(),
  ).toBe(403);
  for (const extra of [
    { token: "secret" },
    { endpoint: "http://127.0.0.1" },
    { question: "private" },
    { files: [] },
  ])
    expect(
      (
        await context.request.post("/api/sync/models/hub", {
          data: { ...data, ...extra },
        })
      ).status(),
    ).toBe(400);
  expect(
    (
      await context.request.post("/api/sync/models/hub", {
        data: { repository: "https://evil.test" },
      })
    ).status(),
  ).toBe(400);
});

test("desktop and phone inspect metadata explicitly, keep labels readable and clear results after failure", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  let calls = 0,
    deny = false;
  const previous = global.fetch;
  global.fetch = async () => Response.json(manifest());
  let result;
  try {
    result = await inspectHubModel("owner/model", commit, signal());
  } finally {
    global.fetch = previous;
  }
  await page.route("**/api/sync/models/hub", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      repository: "owner/model",
      revision: "",
    });
    calls++;
    return deny
      ? route.fulfill({
          status: 503,
          json: { error: "Public metadata unavailable" },
        })
      : route.fulfill({ json: result });
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
  expect(calls).toBe(0);
  await page
    .getByRole("textbox", { name: "Public model repository", exact: true })
    .fill("owner/model");
  await page
    .getByRole("button", { name: "Look up public model metadata", exact: true })
    .click();
  const region = page.getByRole("region", {
    name: "Hub model metadata result",
  });
  await expect(region).toContainText(commit);
  await expect(region).toContainText("apache-2.0");
  await page.getByText("Artifact metadata", { exact: true }).click();
  await expect(region).toContainText("model.gguf");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download visible metadata" }).click();
  expect((await download).suggestedFilename()).toBe(
    "nexus-hub-model-metadata.json",
  );
  await region.screenshot({
    path: `artifacts/hub-metadata/${info.project.name}.png`,
    animations: "disabled",
  });
  deny = true;
  await page
    .getByRole("button", { name: "Look up public model metadata", exact: true })
    .click();
  await expect(region).toHaveCount(0);
  await expect(
    page.getByText("Public metadata unavailable", { exact: true }),
  ).toBeVisible();
  expect(calls).toBe(2);
});

test("at most two metadata lookups run concurrently and slots are released after completion", async () => {
  const previous = global.fetch;
  const releases: ((response: Response) => void)[] = [];
  global.fetch = async () =>
    new Promise<Response>((resolve) => releases.push(resolve));
  let one: ReturnType<typeof inspectHubModel> | undefined,
    two: ReturnType<typeof inspectHubModel> | undefined;
  try {
    one = inspectHubModel("owner/model", commit, signal());
    two = inspectHubModel("owner/model", commit, signal());
    await expect(
      inspectHubModel("owner/model", commit, signal()),
    ).rejects.toMatchObject({ status: 429 });
    expect(releases.length).toBe(2);
    releases.forEach((release) => release(Response.json(manifest())));
    await Promise.all([one, two]);
    global.fetch = async () => Response.json(manifest());
    expect(
      (await inspectHubModel("owner/model", commit, signal())).revision,
    ).toBe(commit);
  } finally {
    releases.forEach((release) => release(Response.json(manifest())));
    await Promise.allSettled([one, two]);
    global.fetch = previous;
  }
});
