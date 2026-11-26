import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  acquisitionChecks,
  archiveAvailableBytes,
  previewHubAcquisition,
} from "../lib/server/hub-acquisition";
import {
  HUB_ARCHIVE_FILE_LIMIT,
  HUB_ARCHIVE_RESERVE,
} from "../lib/hub-acquisition";
import { inspectHubModel } from "../lib/server/hub-model";
import type { HubModelMetadata } from "../lib/hub-model";
import { fixtureRole } from "./helpers/access";
const revision = "a".repeat(40),
  digest = "b".repeat(64),
  filename = "model.gguf";
const manifest = () => ({
  id: "owner/model",
  sha: revision,
  private: false,
  gated: false,
  cardData: { license: "apache-2.0" },
  siblings: [
    { rfilename: filename, size: 1024, lfs: { size: 1024, sha256: digest } },
  ],
});
const selection = () => ({
  repository: "owner/model",
  revision,
  filename,
  expectedBytes: 1024,
  expectedSha256: digest,
});
async function metadata(): Promise<HubModelMetadata> {
  const previous = global.fetch;
  global.fetch = async () => Response.json(manifest());
  try {
    return await inspectHubModel(
      "owner/model",
      revision,
      new AbortController().signal,
    );
  } finally {
    global.fetch = previous;
  }
}
async function privateRoot(run: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hub-acquisition-")),
    previous = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = root;
  try {
    await run(root);
  } finally {
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("capacity probe reads the future archive volume without creating or scanning folders; symlink or file destinations stay unknown", async () => {
  await privateRoot(async (root) => {
    process.env.GW_SYNC_DATA_DIR = path.join(root, "missing-config-root");
    const capacity = await archiveAvailableBytes(new AbortController().signal);
    expect(capacity).not.toBeNull();
    expect(capacity!).toBeGreaterThanOrEqual(0);
    expect(await fs.readdir(root)).toEqual([]);
    process.env.GW_SYNC_DATA_DIR = root;
    await fs.mkdir(path.join(root, "external"));
    await fs.symlink(
      path.join(root, "external"),
      path.join(root, "model-assets"),
      "dir",
    );
    expect(
      await archiveAvailableBytes(new AbortController().signal),
    ).toBeNull();
    await fs.unlink(path.join(root, "model-assets"));
    await fs.writeFile(path.join(root, "model-assets"), "retained");
    expect(
      await archiveAvailableBytes(new AbortController().signal),
    ).toBeNull();
    expect(await fs.readFile(path.join(root, "model-assets"), "utf8")).toBe(
      "retained",
    );
  });
});

test("acquisition checks separate capacity, digest, bounded single-file format, terms and runtime readiness", async () => {
  const data = await metadata(),
    required = HUB_ARCHIVE_RESERVE + 2048;
  const good = acquisitionChecks(data, filename, required);
  expect(good.metadataAndCapacityReady).toBe(true);
  expect(good.requiredBytes).toBe(required);
  expect(
    good.checks.filter((c) => c.state === "review").map((c) => c.id),
  ).toEqual(["license-review", "runtime"]);
  expect(good.downloadImplemented).toBe(true);
  expect(good.downloaded).toBe(false);
  expect(good.inferenceReady).toBe(false);
  for (const available of [null, required - 1])
    expect(
      acquisitionChecks(data, filename, available).checks.find(
        (c) => c.id === "capacity",
      )?.state,
    ).toBe("blocked");
  for (const patch of [
    { bytes: null },
    { bytes: HUB_ARCHIVE_FILE_LIMIT + 1 },
    { bytes: 0 },
    { sha256: null },
  ]) {
    const result = acquisitionChecks(
      { ...data, artifacts: [{ ...data.artifacts[0], ...patch }] },
      filename,
      1e12,
    );
    expect(result.metadataAndCapacityReady).toBe(false);
  }
  for (const name of ["model.safetensors", "model-00001-of-00002.gguf"]) {
    expect(
      acquisitionChecks(
        { ...data, artifacts: [{ ...data.artifacts[0], filename: name }] },
        name,
        1e12,
      ).checks.find((c) => c.id === "format")?.state,
    ).toBe("blocked");
  }
  expect(
    acquisitionChecks({ ...data, license: null }, filename, 1e12)
      .metadataAndCapacityReady,
  ).toBe(false);
  expect(
    acquisitionChecks({ ...data, access: "gated-manual" }, filename, 1e12)
      .metadataAndCapacityReady,
  ).toBe(false);
});

test("preview re-reads the pinned artifact and rejects changed source sizes/hashes without creating archive files", async () => {
  const previous = global.fetch;
  const calls: string[] = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return Response.json(manifest());
  };
  try {
    await privateRoot(async (root) => {
      const result = await previewHubAcquisition(
        selection(),
        new AbortController().signal,
      );
      expect(result.artifact.sha256).toBe(digest);
      expect(result.repository).toBe("owner/model");
      expect(result.destination).toBe("Nexus private model archive");
      expect(JSON.stringify(result)).not.toContain(root);
      expect(calls).toEqual([
        `https://huggingface.co/api/models/owner/model/revision/${revision}?blobs=true`,
      ]);
      expect(await fs.readdir(root)).toEqual([]);
      global.fetch = async () =>
        Response.json({
          ...manifest(),
          siblings: [
            {
              rfilename: filename,
              size: 1025,
              lfs: { size: 1025, sha256: digest },
            },
          ],
        });
      await expect(
        previewHubAcquisition(selection(), new AbortController().signal),
      ).rejects.toMatchObject({ status: 409 });
      expect(await fs.readdir(root)).toEqual([]);
    });
  } finally {
    global.fetch = previous;
  }
});

test("invalid and caller-controlled transfer inputs fail before any source request", async () => {
  const previous = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return Response.json(manifest());
  };
  try {
    for (const extra of [
      { destination: "C:\\private" },
      { url: "https://evil.test" },
      { token: "secret" },
      { download: true },
    ])
      await expect(
        previewHubAcquisition(
          { ...selection(), ...extra },
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ status: 400 });
    for (const patch of [
      { revision: "main" },
      { filename: "../escape.gguf" },
      { expectedBytes: -1 },
      { expectedSha256: "bad" },
    ])
      await expect(
        previewHubAcquisition(
          { ...selection(), ...patch },
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(0);
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(
      previewHubAcquisition(selection(), cancelled.signal),
    ).rejects.toThrow();
    expect(calls).toBe(0);
  } finally {
    global.fetch = previous;
  }
});

test("acquisition preview API is controller-only and same-origin and rejects transfer parameters", async ({
  context,
}) => {
  const data = selection();
  expect(
    (
      await context.request.post("/api/sync/models/hub/preview", { data })
    ).status(),
  ).toBe(401);
  await fixtureRole(context, "display");
  expect(
    (
      await context.request.post("/api/sync/models/hub/preview", { data })
    ).status(),
  ).toBe(403);
  await fixtureRole(context);
  expect(
    (
      await context.request.post("/api/sync/models/hub/preview", {
        data,
        headers: { Origin: "https://foreign.test" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post("/api/sync/models/hub/preview", {
        data: { ...data, destination: "other" },
      })
    ).status(),
  ).toBe(400);
});

test("desktop and phone review the exact selected file, export a preview and clear stale selection/errors", async ({
  page,
  context,
}, info) => {
  await fixtureRole(context);
  const model = await metadata();
  model.artifacts.push({ ...model.artifacts[0], filename: "other.gguf" });
  const result = acquisitionChecks(model, filename, 1e12);
  let previews = 0,
    deny = false;
  await page.route("**/api/sync/models/hub", (r) => r.fulfill({ json: model }));
  await page.route("**/api/sync/models/hub/preview", (route) => {
    previews++;
    expect(route.request().postDataJSON()).toEqual(selection());
    return deny
      ? route.fulfill({
          status: 409,
          json: { error: "Artifact metadata changed" },
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
  await page
    .getByRole("textbox", { name: "Public model repository", exact: true })
    .fill("owner/model");
  await page
    .getByRole("button", { name: "Look up public model metadata", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Review artifact acquisition",
      exact: true,
    }),
  ).toBeVisible();
  expect(previews).toBe(0);
  await page
    .getByRole("combobox", { name: "Artifact to review", exact: true })
    .selectOption(filename);
  await page
    .getByRole("button", { name: "Review artifact acquisition", exact: true })
    .click();
  const region = page.getByRole("region", {
    name: "Artifact acquisition checks",
    exact: true,
  });
  await expect(region).toContainText("Metadata and capacity checks passed");
  await expect(region).toContainText("Review needed");
  await expect(region).toContainText("Review alone does not download");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download acquisition preview" })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "nexus-model-acquisition-preview.json",
  );
  await region.screenshot({
    path: `artifacts/hub-acquisition/${info.project.name}.png`,
    animations: "disabled",
  });
  await page
    .getByRole("combobox", { name: "Artifact to review", exact: true })
    .selectOption("other.gguf");
  await expect(region).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Artifact to review", exact: true })
    .selectOption(filename);
  deny = true;
  await page
    .getByRole("button", { name: "Review artifact acquisition", exact: true })
    .click();
  await expect(
    page.getByText("Artifact metadata changed", { exact: true }),
  ).toBeVisible();
  await expect(region).toHaveCount(0);
  expect(previews).toBe(2);
});
