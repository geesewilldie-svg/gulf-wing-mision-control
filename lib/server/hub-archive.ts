import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { previewHubAcquisition } from "./hub-acquisition";
import { SyncError } from "./sync-store";
import type { HubArchiveReceipt, HubArchiveResumeOrigin } from "../hub-archive";

// Exact reviewed candidate delivery hosts only. Unknown redirects fail closed;
// signed redirect URLs and their query strings never enter receipts or errors.
const deliveryHosts = new Set([
  "huggingface.co",
  "cdn-lfs.huggingface.co",
  "cdn-lfs.hf.co",
  "cdn-lfs-us-1.hf.co",
  "cdn-lfs-eu-1.hf.co",
  "cas-bridge.xethub.hf.co",
]);
export function permittedModelDelivery(url: URL) {
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    !url.hash &&
    deliveryHosts.has(url.hostname)
  );
}
export async function modelBody(
  url: URL,
  signal: AbortSignal,
  start = 0,
  total?: number,
) {
  for (let hop = 0; hop < 4; hop++) {
    signal.throwIfAborted();
    if (!permittedModelDelivery(url))
      throw new SyncError(
        503,
        "The model delivery host is not supported. No alternate host was contacted.",
      );
    const response = await fetch(url.href, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
      headers: {
        Accept: "application/octet-stream",
        ...(start > 0 ? { Range: `bytes=${start}-` } : {}),
      },
      signal,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || location.length > 16000)
        throw new SyncError(503, "Unsupported model delivery redirect.");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok || response.status !== (start > 0 ? 206 : 200)) {
      await response.body?.cancel();
      throw new SyncError(
        503,
        "The model download was rejected. No automatic retry was attempted.",
      );
    }
    if (start > 0) {
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
        response.headers.get("content-range") || "",
      );
      if (
        !range ||
        Number(range[1]) !== start ||
        Number(range[2]) !== total! - 1 ||
        Number(range[3]) !== total
      ) {
        await response.body?.cancel();
        throw new SyncError(
          503,
          "The server did not return the exact reviewed resume range. No full restart was attempted.",
        );
      }
    }
    return response;
  }
  throw new SyncError(503, "The model delivery redirect limit was reached.");
}
export async function archiveDirectoryGuard(target: string, create = false) {
  const absolute = path.resolve(target),
    parsed = path.parse(absolute),
    segments = absolute
      .slice(parsed.root.length)
      .split(path.sep)
      .filter(Boolean);
  if (segments.length > 64) throw Error("Directory limit");
  const records: {
    name: string;
    ino: number;
    dev: number;
    birthtimeMs: number;
  }[] = [];
  let current = parsed.root;
  for (const segment of ["", ...segments]) {
    if (segment) current = path.join(current, segment);
    if (create && segment)
      try {
        await fs.mkdir(/* turbopackIgnore: true */ current, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    const stat = await fs.lstat(/* turbopackIgnore: true */ current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw Error("Unsafe archive directory");
    records.push({
      name: current,
      ino: stat.ino,
      dev: stat.dev,
      birthtimeMs: stat.birthtimeMs,
    });
  }
  return async () => {
    for (const before of records) {
      const after = await fs.lstat(/* turbopackIgnore: true */ before.name);
      if (
        !after.isDirectory() ||
        after.isSymbolicLink() ||
        before.ino !== after.ino ||
        before.dev !== after.dev ||
        before.birthtimeMs !== after.birthtimeMs
      )
        throw Error("Archive directory changed");
    }
  };
}
async function ownedPath(name: string, stat: { ino: number; dev: number }) {
  const actual = await fs.lstat(/* turbopackIgnore: true */ name);
  if (
    !actual.isFile() ||
    actual.isSymbolicLink() ||
    actual.ino !== stat.ino ||
    actual.dev !== stat.dev
  )
    throw Error("Archive file changed");
}
async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  return new Promise<ReadableStreamReadResult<Uint8Array>>(
    (resolve, reject) => {
      const abort = () => {
        void reader.cancel().catch(() => {});
        reject(Error("Cancelled transfer"));
      };
      signal.addEventListener("abort", abort, { once: true });
      reader
        .read()
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", abort));
      if (signal.aborted) abort();
    },
  );
}
export type ArchiveResumeSource = {
  origin: HubArchiveResumeOrigin;
  open: (
    signal: AbortSignal,
  ) => Promise<{
    handle: Awaited<ReturnType<typeof fs.open>>;
    validate: (signal: AbortSignal) => Promise<void>;
  }>;
};
const gateKey = Symbol.for("nexus.hub.archive.transfer.v1");
const registry = globalThis as unknown as Record<symbol, { active: boolean }>;
const gate = (registry[gateKey] ||= { active: false });
export async function acquireHubArtifact(
  value: any,
  signal: AbortSignal,
  resume?: ArchiveResumeSource,
): Promise<HubArchiveReceipt> {
  if (
    !value ||
    Array.isArray(value) ||
    Object.keys(value).length !== 8 ||
    Object.keys(value).some(
      (key) =>
        ![
          "repository",
          "revision",
          "filename",
          "expectedBytes",
          "expectedSha256",
          "expectedLicense",
          "licenseReviewed",
          "archiveOnly",
        ].includes(key),
    ) ||
    value.licenseReviewed !== true ||
    value.archiveOnly !== true ||
    typeof value.expectedLicense !== "string" ||
    !/^[A-Za-z0-9._-]{1,120}$/.test(value.expectedLicense)
  )
    throw new SyncError(
      400,
      "Review the exact artifact and license, and choose archive-only transfer. Custom URLs, paths, credentials and runtime imports are not accepted.",
    );
  if (gate.active)
    throw new SyncError(
      429,
      "A model archive transfer is already active. Wait or cancel it before another transfer.",
    );
  gate.active = true;
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(600000)]),
    runId = randomUUID();
  let directory = "",
    partial = "",
    final = "",
    recordPath = "",
    file: Awaited<ReturnType<typeof fs.open>> | undefined,
    receipt: Awaited<ReturnType<typeof fs.open>> | undefined;
  let stat: { ino: number; dev: number } | undefined,
    checkDirs: (() => Promise<void>) | undefined,
    receiptIdentity: { ino: number; dev: number } | undefined;
  let prefix: Awaited<ReturnType<ArchiveResumeSource["open"]>> | undefined;
  let published = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const base: Record<string, unknown> = {
    version: 1,
    kind: "hub-model-archive",
    runId,
    startedAt: new Date().toISOString(),
    state: "started",
    runtimeImported: false,
    inferenceReady: false,
  };
  async function save(data: unknown) {
    if (!receipt || !receiptIdentity) throw Error("No receipt");
    await checkDirs!();
    await ownedPath(recordPath, receiptIdentity);
    const bytes = Buffer.from(JSON.stringify(data));
    if (bytes.length > 8000) throw Error("Receipt limit");
    await receipt.write(bytes, 0, bytes.length, 0);
    await receipt.truncate(bytes.length);
    await receipt.sync();
    const buffer = Buffer.alloc(bytes.length + 1),
      read = await receipt.read(buffer, 0, buffer.length, 0);
    if (
      read.bytesRead !== bytes.length ||
      !buffer.subarray(0, read.bytesRead).equals(bytes)
    )
      throw Error("Receipt readback failed");
  }
  try {
    const { repository, revision, filename, expectedBytes, expectedSha256 } =
      value;
    const preview = await previewHubAcquisition(
      { repository, revision, filename, expectedBytes, expectedSha256 },
      bounded,
    );
    if (
      !preview.metadataAndCapacityReady ||
      preview.license !== value.expectedLicense
    )
      throw new SyncError(
        409,
        "Artifact prerequisites or license metadata changed. Review the acquisition preview again.",
      );
    const expected = preview.artifact.bytes!,
      digest = preview.artifact.sha256!;
    bounded.throwIfAborted();
    const archive = path.resolve(
      process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
      "model-assets",
    );
    const checkArchive = await archiveDirectoryGuard(archive, true);
    let slot = "";
    for (let i = 0; i < 100; i++) {
      await checkArchive();
      const candidate = path.join(
        archive,
        "asset-" + String(i).padStart(3, "0"),
      );
      try {
        await fs.mkdir(candidate, { mode: 0o700 });
        directory = candidate;
        slot = path.basename(candidate);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    if (!directory)
      throw new SyncError(
        409,
        "The model archive has reached its 100-record limit. Existing records and files were retained.",
      );
    checkDirs = await archiveDirectoryGuard(directory);
    partial = path.join(directory, "model.partial");
    final = path.join(directory, "model.gguf");
    recordPath = path.join(directory, "receipt.json");
    receipt = await fs.open(
      /* turbopackIgnore: true */ recordPath,
      "wx+",
      0o600,
    );
    receiptIdentity = await receipt.stat();
    Object.assign(base, {
      repository: preview.repository,
      revision: preview.revision,
      sourceFilename: filename,
      reportedLicense: preview.license,
      expectedBytes: expected,
      expectedSha256: digest,
      archiveFile: slot + "/model.gguf",
      licenseReviewed: true,
      archiveOnly: true,
      ...(resume ? { resumedFrom: resume.origin } : {}),
    });
    await save(base);
    await checkDirs();
    file = await fs.open(/* turbopackIgnore: true */ partial, "wx+", 0o600);
    stat = await file.stat();
    let count = 0,
      magic = Buffer.alloc(0);
    const hash = createHash("sha256");
    async function append(chunk: Uint8Array) {
      if (count + chunk.length > expected)
        throw new SyncError(
          503,
          "The model response exceeded its reviewed byte count.",
        );
      if (magic.length < 4) {
        magic = Buffer.concat([
          magic,
          Buffer.from(chunk.subarray(0, 4 - magic.length)),
        ]);
        if (magic.length === 4 && !magic.equals(Buffer.from("GGUF")))
          throw new SyncError(
            503,
            "The downloaded bytes did not contain the expected GGUF header.",
          );
      }
      let offset = 0;
      while (offset < chunk.length) {
        bounded.throwIfAborted();
        const write = await file!.write(
          chunk,
          offset,
          chunk.length - offset,
          count + offset,
        );
        if (!write.bytesWritten) throw Error("No write progress");
        offset += write.bytesWritten;
      }
      hash.update(chunk);
      count += chunk.length;
    }
    if (resume) {
      prefix = await resume.open(bounded);
      const buffer = Buffer.alloc(1024 * 1024);
      let offset = 0;
      while (offset < resume.origin.prefixBytes) {
        bounded.throwIfAborted();
        const r = await prefix.handle.read(
          buffer,
          0,
          Math.min(buffer.length, resume.origin.prefixBytes - offset),
          offset,
        );
        if (!r.bytesRead) throw Error("Short retained partial");
        await append(buffer.subarray(0, r.bytesRead));
        offset += r.bytesRead;
      }
      await prefix.validate(bounded);
      await prefix.handle.close();
      prefix = undefined;
    }
    if (count < expected) {
      const url = new URL(
        `https://huggingface.co/${preview.repository.split("/").map(encodeURIComponent).join("/")}/resolve/${preview.revision}/${filename.split("/").map(encodeURIComponent).join("/")}?download=true`,
      );
      const remaining = expected - count,
        response = await modelBody(url, bounded, count, expected),
        length = response.headers.get("content-length"),
        encoding = response.headers.get("content-encoding");
      if (
        (length !== null &&
          (!/^\d+$/.test(length) || Number(length) !== remaining)) ||
        (encoding && encoding !== "identity")
      ) {
        await response.body?.cancel();
        throw new SyncError(
          503,
          "The model response size or encoding did not match the reviewed artifact.",
        );
      }
      if (!response.body) throw Error("No model bytes");
      reader = response.body.getReader();
      while (true) {
        const r = await readChunk(reader, bounded);
        if (r.done) break;
        await append(r.value);
      }
    }
    if (
      count !== expected ||
      magic.length !== 4 ||
      hash.digest("hex") !== digest
    )
      throw new SyncError(
        503,
        "The downloaded model did not match its reviewed size and SHA-256. No model was published.",
      );
    await file.sync();
    await checkDirs();
    await ownedPath(partial, stat);
    const before = await file.stat();
    if (before.size !== expected) throw Error("Size changed");
    const verify = createHash("sha256"),
      buffer = Buffer.alloc(1024 * 1024);
    let offset = 0;
    while (offset < expected) {
      bounded.throwIfAborted();
      const read = await file.read(
        buffer,
        0,
        Math.min(buffer.length, expected - offset),
        offset,
      );
      if (!read.bytesRead) throw Error("Short readback");
      verify.update(buffer.subarray(0, read.bytesRead));
      offset += read.bytesRead;
    }
    const after = await file.stat();
    if (
      verify.digest("hex") !== digest ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs
    )
      throw Error("Model readback failed");
    await ownedPath(partial, stat);
    await checkDirs();
    bounded.throwIfAborted();
    // Create-only same-volume publication; never rename over an existing file.
    await fs.link(partial, final);
    published = true;
    await ownedPath(final, stat);
    await file.close();
    file = undefined;
    await fs.unlink(partial);
    const result: HubArchiveReceipt = {
      version: 1,
      runId,
      state: "verified",
      repository: preview.repository,
      revision: preview.revision,
      sourceFilename: filename,
      reportedLicense: preview.license!,
      bytes: count,
      sha256: digest,
      verifiedAt: new Date().toISOString(),
      archiveFile: slot + "/model.gguf",
      receiptState: "saved",
      ...(resume ? { resumedFrom: resume.origin } : {}),
      downloaded: true,
      runtimeImported: false,
      inferenceReady: false,
      notice:
        "Archive transfer verified against the reported size/SHA-256, including local readback. The file was not executed, imported into Ollama, selected as a model or added to owner memory. This is verification at the recorded time, not a permanent integrity guarantee.",
    };
    await save({ ...base, ...result });
    return result;
  } catch (error) {
    await reader?.cancel().catch(() => {});
    if (!published && partial && stat) {
      await file?.close().catch(() => {});
      file = undefined;
      try {
        await checkDirs!();
        await ownedPath(partial, stat);
        await fs.unlink(partial);
      } catch {}
    }
    try {
      if (receipt)
        await save({
          ...base,
          state: published
            ? "publication-unconfirmed"
            : signal.aborted
              ? "cancelled"
              : "failed",
          finishedAt: new Date().toISOString(),
        });
    } catch {}
    if (published)
      throw new SyncError(
        503,
        "An archive file may have been published but the final receipt could not be confirmed. No automatic retry or model activation was attempted.",
      );
    if (signal.aborted)
      throw new SyncError(
        499,
        "Model archive transfer cancelled. No model was activated; incomplete receipts are retained.",
      );
    if (error instanceof SyncError) throw error;
    throw new SyncError(
      503,
      "Model archive transfer could not be verified within its limits. No model was activated; inspect the private archive receipt before retrying.",
    );
  } finally {
    await reader?.cancel().catch(() => {});
    await prefix?.handle.close().catch(() => {});
    await file?.close().catch(() => {});
    await receipt?.close().catch(() => {});
    gate.active = false;
  }
}
