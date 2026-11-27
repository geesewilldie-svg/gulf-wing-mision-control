import { inspectRuntimeModelReceipt } from "./runtime-model-store";
import { inspectRuntimeBlobReceipt } from "./runtime-blob-store";
import { GGUF_METADATA_LIMIT, parseGgufMetadata } from "../gguf-metadata";
import fs, { type FileHandle } from "node:fs/promises";
import { constants, type Stats } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { hubRepository } from "../hub-model";
import { HUB_ARCHIVE_FILE_LIMIT } from "../hub-acquisition";
import type {
  HubArchiveHistory,
  HubArchiveRecord,
  HubArchiveVerification,
} from "../hub-archive";
import { archiveDirectoryGuard, type ArchiveResumeSource } from "./hub-archive";
import { SyncError } from "./sync-store";
import {
  inspectArchiveRecovery,
  saveArchiveRecovery,
} from "./hub-archive-recovery";
import type {
  HubArchiveReconciliation,
  HubArchiveRecovery,
} from "../hub-archive";
const root = () =>
  path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
    "model-assets",
  );
const slotValid = (slot: unknown): slot is string =>
  typeof slot === "string" && /^asset-0\d{2}$/.test(slot);
const iso = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length === 24 &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
const same = (a: any, b: any) =>
  a.ino === b.ino && a.dev === b.dev && a.birthtimeMs === b.birthtimeMs;
export function projectArchiveRecord(
  data: any,
  slot: string,
): Omit<HubArchiveRecord, "fileState" | "fileBytes" | "partialPresent"> | null {
  if (
    !slotValid(slot) ||
    !data ||
    data.version !== 1 ||
    data.kind !== "hub-model-archive" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      data.runId || "",
    ) ||
    ![
      "started",
      "verified",
      "failed",
      "cancelled",
      "publication-unconfirmed",
    ].includes(data.state) ||
    !hubRepository(data.repository) ||
    typeof data.revision !== "string" ||
    !/^[a-f0-9]{40}$/.test(data.revision) ||
    typeof data.sourceFilename !== "string" ||
    !data.sourceFilename.length ||
    data.sourceFilename.length > 240 ||
    /[\\\x00-\x1f\x7f]/.test(data.sourceFilename) ||
    data.sourceFilename
      .split("/")
      .some((p: string) => !p || p === "." || p === "..") ||
    typeof data.reportedLicense !== "string" ||
    !/^[A-Za-z0-9._-]{1,120}$/.test(data.reportedLicense) ||
    !Number.isSafeInteger(data.expectedBytes) ||
    data.expectedBytes <= 0 ||
    data.expectedBytes > HUB_ARCHIVE_FILE_LIMIT ||
    typeof data.expectedSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(data.expectedSha256) ||
    data.archiveFile !== slot + "/model.gguf" ||
    !iso(data.startedAt) ||
    data.licenseReviewed !== true ||
    data.archiveOnly !== true ||
    data.runtimeImported !== false ||
    data.inferenceReady !== false
  )
    return null;
  let recordedAt = data.startedAt;
  if (data.state === "verified") {
    if (
      data.bytes !== data.expectedBytes ||
      data.sha256 !== data.expectedSha256 ||
      !iso(data.verifiedAt) ||
      data.verifiedAt < data.startedAt ||
      data.receiptState !== "saved" ||
      data.downloaded !== true
    )
      return null;
    recordedAt = data.verifiedAt;
  } else if (data.state !== "started") {
    if (!iso(data.finishedAt) || data.finishedAt < data.startedAt) return null;
    recordedAt = data.finishedAt;
  }
  let resumedFrom;
  if (data.resumedFrom) {
    const r = data.resumedFrom;
    if (
      !slotValid(r.slot) ||
      r.slot === slot ||
      typeof r.runId !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        r.runId,
      ) ||
      typeof r.receiptSha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(r.receiptSha256) ||
      !Number.isSafeInteger(r.prefixBytes) ||
      r.prefixBytes <= 0 ||
      r.prefixBytes > data.expectedBytes
    )
      return null;
    resumedFrom = {
      slot: r.slot,
      runId: r.runId,
      receiptSha256: r.receiptSha256,
      prefixBytes: r.prefixBytes,
    };
  }
  return {
    slot,
    ...(resumedFrom ? { resumedFrom } : {}),
    runId: data.runId,
    state: data.state,
    repository: data.repository,
    revision: data.revision,
    sourceFilename: data.sourceFilename,
    reportedLicense: data.reportedLicense,
    recordedBytes: data.expectedBytes,
    recordedSha256: data.expectedSha256,
    recordedAt,
  };
}
async function readReceipt(slot: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const directory = path.join(root(), slot),
    guard = await archiveDirectoryGuard(directory),
    name = path.join(directory, "receipt.json");
  let handle;
  try {
    const before = await fs.lstat(/* turbopackIgnore: true */ name);
    if (!before.isFile() || before.isSymbolicLink() || before.size > 8000)
      throw Error("Unsafe receipt");
    handle = await fs.open(
      /* turbopackIgnore: true */ name,
      constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
    );
    const opened = await handle.stat();
    if (
      !same(before, opened) ||
      !opened.isFile() ||
      opened.size !== before.size
    )
      throw Error("Receipt changed");
    const buffer = Buffer.alloc(8001),
      read = await handle.read(buffer, 0, buffer.length, 0),
      after = await handle.stat(),
      current = await fs.lstat(/* turbopackIgnore: true */ name);
    if (
      read.bytesRead !== before.size ||
      read.bytesRead > 8000 ||
      !same(before, after) ||
      !same(before, current) ||
      current.isSymbolicLink() ||
      after.size !== before.size ||
      current.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      current.mtimeMs !== before.mtimeMs
    )
      throw Error("Receipt changed");
    await guard();
    signal.throwIfAborted();
    const bytes = buffer.subarray(0, read.bytesRead),
      record = projectArchiveRecord(JSON.parse(bytes.toString("utf8")), slot);
    if (!record) throw Error("Unsupported receipt");
    return {
      record,
      identity: before,
      digest: createHash("sha256").update(bytes).digest("hex"),
      guard,
      directory,
    };
  } finally {
    await handle?.close().catch(() => {});
  }
}
export async function readHubArchive(
  signal: AbortSignal,
): Promise<HubArchiveHistory> {
  const base: HubArchiveHistory = {
    state: "unavailable",
    readAt: new Date().toISOString(),
    records: [],
    validRecords: 0,
    withheldRecords: 0,
    occupiedSlots: 0,
    capacity: 100,
    pageLimit: 20,
    notice:
      "Recorded local archive outcomes and current file-size metadata only. No weights were read, downloaded or activated. A recorded verified receipt is not a fresh hash check or independent authentication of its source. Unfinished receipts may describe active or interrupted work.",
  };
  let guard: () => Promise<void>;
  try {
    guard = await archiveDirectoryGuard(root());
  } catch (error) {
    signal.throwIfAborted();
    return {
      ...base,
      state:
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "not-created"
          : "unavailable",
    };
  }
  const records: HubArchiveRecord[] = [];
  let occupiedSlots = 0,
    withheldRecords = 0;
  for (let i = 0; i < 100; i++) {
    signal.throwIfAborted();
    const slot = "asset-" + String(i).padStart(3, "0"),
      dir = path.join(root(), slot);
    let exists = false;
    try {
      const item = await fs.lstat(/* turbopackIgnore: true */ dir);
      exists = true;
      occupiedSlots++;
      if (!item.isDirectory() || item.isSymbolicLink())
        throw Error("Unsafe slot");
      const source = await readReceipt(slot, signal);
      let fileState: HubArchiveRecord["fileState"] = "unsafe-or-unavailable",
        fileBytes: number | null = null,
        partialPresent: boolean | null = null,
        partialBytes: number | null = null;
      try {
        const file = await fs.lstat(
          /* turbopackIgnore: true */ path.join(dir, "model.gguf"),
        );
        if (
          file.isFile() &&
          !file.isSymbolicLink() &&
          Number.isSafeInteger(file.size)
        ) {
          fileBytes = file.size;
          fileState =
            file.size === source.record.recordedBytes
              ? "size-matches-record"
              : "size-mismatch";
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          fileState = "missing";
      }
      try {
        const partial = await fs.lstat(
          /* turbopackIgnore: true */ path.join(dir, "model.partial"),
        );
        partialBytes =
          partial.isFile() &&
          !partial.isSymbolicLink() &&
          Number.isSafeInteger(partial.size)
            ? partial.size
            : null;
        partialPresent =
          partial.isFile() && !partial.isSymbolicLink() ? true : null;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          partialPresent = false;
      }
      await source.guard();
      records.push({
        ...source.record,
        fileState,
        fileBytes,
        partialPresent,
        partialBytes,
        receiptSha256: source.digest,
        runtimeModel: await inspectRuntimeModelReceipt(dir, {
          receiptSha256: source.digest,
          sha256: source.record.recordedSha256,
          bytes: source.record.recordedBytes,
        }),
        runtimeBlob: await inspectRuntimeBlobReceipt(dir, {
          receiptSha256: source.digest,
          sha256: source.record.recordedSha256,
          bytes: source.record.recordedBytes,
        }),
        recovery: await inspectArchiveRecovery(dir, {
          slot,
          runId: source.record.runId,
          receiptSha256: source.digest,
          bytes: source.record.recordedBytes,
          sha256: source.record.recordedSha256,
          sourceState: source.record.state,
        }),
      });
    } catch (error) {
      if (exists || (error as NodeJS.ErrnoException).code !== "ENOENT") {
        withheldRecords++;
        if (!exists) occupiedSlots++;
      }
    }
  }
  signal.throwIfAborted();
  try {
    await guard();
  } catch {
    return base;
  }
  records.sort(
    (a, b) =>
      b.recordedAt.localeCompare(a.recordedAt) || a.slot.localeCompare(b.slot),
  );
  return {
    ...base,
    state: "available",
    records: records.slice(0, 20),
    validRecords: records.length,
    withheldRecords,
    occupiedSlots,
  };
}
let checking = false;
async function checkArchiveFile(
  slot: unknown,
  signal: AbortSignal,
  mode: "verify" | "reconcile",
  expectedReceipt?: string,
  onMatch?: (
    source: Awaited<ReturnType<typeof readReceipt>>,
    before: Stats,
    bounded: AbortSignal,
    handle: FileHandle,
  ) => Promise<void>,
): Promise<HubArchiveVerification> {
  if (!slotValid(slot))
    throw new SyncError(400, "Choose a recorded archive slot, not a path.");
  if (checking)
    throw new SyncError(429, "An archive file check is already active.");
  checking = true;
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(600000)]);
  let handle;
  try {
    const source = await readReceipt(slot, bounded),
      record = source.record;
    if (expectedReceipt && source.digest !== expectedReceipt)
      throw new SyncError(
        409,
        "The archive record changed. Inspect it again before reconciliation.",
      );
    if (
      mode === "verify"
        ? record.state !== "verified"
        : !["started", "publication-unconfirmed"].includes(record.state)
    )
      throw new SyncError(
        409,
        mode === "verify"
          ? "Only a recorded completed transfer can be rechecked here. Unfinished or uncertain runs need reconciliation."
          : "Only unfinished or publication-unconfirmed records support this reconciliation action.",
      );
    const name = path.join(source.directory, "model.gguf"),
      before = await fs.lstat(/* turbopackIgnore: true */ name);
    if (!before.isFile() || before.isSymbolicLink())
      throw new SyncError(
        409,
        "The archive file is missing or unsafe. No hash result was accepted.",
      );
    const base = {
      slot,
      runId: record.runId,
      receiptSha256: source.digest,
      checkedAt: new Date().toISOString(),
      recordedBytes: record.recordedBytes,
      observedBytes: before.size,
      recordedSha256: record.recordedSha256,
      observedSha256: null,
      runtimeImported: false as const,
      inferenceReady: false as const,
      notice:
        "Read-only comparison against the local recorded size/hash, not a new Hub source/license verification, model import or inference test. Local receipts can be edited by someone with host file access.",
    };
    if (before.size !== record.recordedBytes)
      return { ...base, state: "mismatch" };
    handle = await fs.open(
      /* turbopackIgnore: true */ name,
      constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
    );
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      !same(before, opened) ||
      opened.size !== before.size ||
      opened.mtimeMs !== before.mtimeMs
    )
      throw Error("File changed");
    const buffer = Buffer.alloc(1024 * 1024),
      hash = createHash("sha256");
    let offset = 0;
    while (offset < before.size) {
      bounded.throwIfAborted();
      const read = await handle.read(
        buffer,
        0,
        Math.min(buffer.length, before.size - offset),
        offset,
      );
      if (!read.bytesRead) throw Error("Short file");
      hash.update(buffer.subarray(0, read.bytesRead));
      offset += read.bytesRead;
    }
    const after = await handle.stat(),
      current = await fs.lstat(/* turbopackIgnore: true */ name);
    if (
      !same(before, after) ||
      !same(before, current) ||
      current.isSymbolicLink() ||
      after.size !== before.size ||
      current.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      current.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      current.ctimeMs !== before.ctimeMs
    )
      throw Error("File changed during hash");
    const again = await readReceipt(slot, bounded);
    if (
      !same(source.identity, again.identity) ||
      source.digest !== again.digest
    )
      throw Error("Receipt changed during hash");
    await source.guard();
    bounded.throwIfAborted();
    const digest = hash.digest("hex");
    if (digest === record.recordedSha256 && onMatch) {
      await onMatch(source, before, bounded, handle);
      const finalFile = await fs.lstat(/* turbopackIgnore: true */ name),
        finalReceipt = await readReceipt(slot, bounded);
      if (
        !same(before, finalFile) ||
        finalFile.isSymbolicLink() ||
        finalFile.size !== before.size ||
        finalFile.mtimeMs !== before.mtimeMs ||
        finalFile.ctimeMs !== before.ctimeMs ||
        !same(source.identity, finalReceipt.identity) ||
        source.digest !== finalReceipt.digest
      )
        throw Error("Archive changed while recording recovery");
      await source.guard();
      bounded.throwIfAborted();
    }
    return {
      ...base,
      checkedAt: new Date().toISOString(),
      state: digest === record.recordedSha256 ? "matches-record" : "mismatch",
      observedSha256: digest,
    };
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError(
      signal.aborted ? 499 : 409,
      signal.aborted
        ? "Archive check cancelled."
        : "Archive file or receipt is unavailable, changed or outside the check limits. No verified result was accepted.",
    );
  } finally {
    await handle?.close().catch(() => {});
    checking = false;
  }
}

export async function verifyHubArchive(
  slot: unknown,
  signal: AbortSignal,
): Promise<HubArchiveVerification> {
  return checkArchiveFile(slot, signal, "verify");
}
export async function reconcileHubArchive(
  slot: unknown,
  receiptSha256: unknown,
  signal: AbortSignal,
): Promise<HubArchiveReconciliation> {
  if (
    typeof receiptSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(receiptSha256)
  )
    throw new SyncError(
      400,
      "A current inspected receipt identity is required for reconciliation.",
    );
  let recovery: HubArchiveRecovery | null = null;
  const verification = await checkArchiveFile(
    slot,
    signal,
    "reconcile",
    receiptSha256,
    async (source, before, bounded) => {
      await source.guard();
      bounded.throwIfAborted();
      const current = await readReceipt(source.record.slot, bounded);
      if (
        !same(source.identity, current.identity) ||
        source.digest !== current.digest
      )
        throw Error("Source receipt changed");
      recovery = await saveArchiveRecovery(
        source.directory,
        {
          slot: source.record.slot,
          runId: source.record.runId,
          receiptSha256: source.digest,
          bytes: source.record.recordedBytes,
          sha256: source.record.recordedSha256,
          sourceState: source.record.state,
        },
        bounded,
      );
    },
  );
  return { verification, recovery };
}

export async function archiveResumeSource(
  slot: unknown,
  receiptSha256: unknown,
  signal: AbortSignal,
) {
  if (
    !slotValid(slot) ||
    typeof receiptSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(receiptSha256)
  )
    throw new SyncError(
      400,
      "Choose an inspected retained partial and its receipt identity.",
    );
  const source = await readReceipt(slot, signal),
    record = source.record;
  if (source.digest !== receiptSha256 || record.state === "verified")
    throw new SyncError(
      409,
      "The source record changed or already records a completed transfer. Inspect it again.",
    );
  const name = path.join(source.directory, "model.partial"),
    final = path.join(source.directory, "model.gguf");
  async function noFinal() {
    try {
      await fs.lstat(/* turbopackIgnore: true */ final);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    throw new SyncError(
      409,
      "A published file already exists in this slot. Inspect or reconcile it instead of resuming.",
    );
  }
  await noFinal();
  const before = await fs.lstat(/* turbopackIgnore: true */ name);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.size <= 0 ||
    before.size > record.recordedBytes
  )
    throw new SyncError(
      409,
      "The retained partial size or file identity is not suitable for resume.",
    );
  const origin = {
    slot,
    runId: record.runId,
    receiptSha256: source.digest,
    prefixBytes: before.size,
  };
  async function validate(signal: AbortSignal) {
    signal.throwIfAborted();
    await source.guard();
    await noFinal();
    const current = await fs.lstat(/* turbopackIgnore: true */ name),
      again = await readReceipt(record.slot, signal);
    if (
      !same(before, current) ||
      current.isSymbolicLink() ||
      current.size !== before.size ||
      current.mtimeMs !== before.mtimeMs ||
      current.ctimeMs !== before.ctimeMs ||
      !same(source.identity, again.identity) ||
      source.digest !== again.digest
    )
      throw new SyncError(
        409,
        "The retained partial or its receipt changed. No resume result was accepted.",
      );
  }
  const prefix: ArchiveResumeSource = {
    origin,
    open: async (signal) => {
      await validate(signal);
      let handle;
      try {
        handle = await fs.open(
          /* turbopackIgnore: true */ name,
          constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
        );
        const opened = await handle.stat();
        if (
          !opened.isFile() ||
          !same(before, opened) ||
          opened.size !== before.size ||
          opened.mtimeMs !== before.mtimeMs ||
          opened.ctimeMs !== before.ctimeMs
        )
          throw Error("Partial changed");
        return { handle, validate };
      } catch (error) {
        await handle?.close().catch(() => {});
        throw error;
      }
    },
  };
  return { record, prefix };
}

// Bounded metadata prefix read; deliberately does not claim whole-file integrity.
export async function inspectHubArchiveMetadata(
  slot: unknown,
  receiptSha256: unknown,
  signal: AbortSignal,
) {
  if (
    !slotValid(slot) ||
    typeof receiptSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(receiptSha256)
  )
    throw new SyncError(
      400,
      "Choose an inspected archive slot and receipt identity.",
    );
  let handle;
  try {
    const source = await readReceipt(slot, signal);
    if (source.digest !== receiptSha256) throw Error("Receipt changed");
    const name = path.join(source.directory, "model.gguf");
    const before = await fs.lstat(/* turbopackIgnore: true */ name);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.size !== source.record.recordedBytes
    )
      throw Error("Unsafe model");
    handle = await fs.open(
      /* turbopackIgnore: true */ name,
      constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
    );
    const opened = await handle.stat();
    if (
      !same(before, opened) ||
      opened.size !== before.size ||
      opened.mtimeMs !== before.mtimeMs ||
      opened.ctimeMs !== before.ctimeMs
    )
      throw Error("Model changed");
    const buffer = Buffer.alloc(Math.min(before.size, GGUF_METADATA_LIMIT));
    let offset = 0;
    while (offset < buffer.length) {
      signal.throwIfAborted();
      const read = await handle.read(
        buffer,
        offset,
        buffer.length - offset,
        offset,
      );
      if (!read.bytesRead) throw Error("Short metadata read");
      offset += read.bytesRead;
    }
    const metadata = parseGgufMetadata(buffer);
    const after = await handle.stat(),
      current = await fs.lstat(/* turbopackIgnore: true */ name);
    const again = await readReceipt(slot, signal);
    for (const item of [after, current])
      if (
        !same(before, item) ||
        !item.isFile() ||
        item.isSymbolicLink() ||
        item.size !== before.size ||
        item.mtimeMs !== before.mtimeMs ||
        item.ctimeMs !== before.ctimeMs
      )
        throw Error("Model changed");
    if (
      again.digest !== source.digest ||
      !same(source.identity, again.identity)
    )
      throw Error("Receipt changed");
    await source.guard();
    signal.throwIfAborted();
    return {
      slot,
      runId: source.record.runId,
      receiptSha256,
      inspectedAt: new Date().toISOString(),
      metadata,
      notice:
        "Declared GGUF metadata from a bounded local prefix only. Tensor layout, full-file integrity, hardware fit and runtime compatibility were not verified. No model was imported or activated.",
    };
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError(
      signal.aborted ? 499 : 409,
      signal.aborted
        ? "Metadata inspection cancelled."
        : "GGUF metadata could not be inspected safely or the file/receipt changed. Inspect the archive again; unsupported or malformed files are not runtime-ready.",
    );
  } finally {
    await handle?.close().catch(() => {});
  }
}

// Keep metadata inspection inside the successful hash check's final identity fence.
export async function reviewVerifiedHubArchive(
  slot: unknown,
  receiptSha256: unknown,
  signal: AbortSignal,
) {
  if (
    typeof receiptSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(receiptSha256)
  )
    throw new SyncError(
      400,
      "Inspect the source receipt before requesting an import review.",
    );
  let reviewed:
    | {
        record: Awaited<ReturnType<typeof readReceipt>>["record"];
        metadata: ReturnType<typeof parseGgufMetadata>;
      }
    | undefined;
  const verification = await checkArchiveFile(
    slot,
    signal,
    "verify",
    receiptSha256,
    async (source, _before, bounded) => {
      const inspected = await inspectHubArchiveMetadata(
        slot,
        receiptSha256,
        bounded,
      );
      reviewed = { record: source.record, metadata: inspected.metadata };
    },
  );
  if (verification.state !== "matches-record" || !reviewed)
    throw new SyncError(
      409,
      "The archive bytes do not match the recorded artifact. No import review was accepted.",
    );
  return { verification, ...reviewed };
}

export async function withVerifiedHubArchive<T>(
  slot: unknown,
  receiptSha256: unknown,
  signal: AbortSignal,
  operation: (
    record: Awaited<ReturnType<typeof readReceipt>>["record"],
    directory: string,
    handle: FileHandle,
    bounded: AbortSignal,
  ) => Promise<T>,
): Promise<T> {
  if (
    typeof receiptSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(receiptSha256)
  )
    throw new SyncError(400, "Choose an inspected source receipt.");
  let result: T | undefined,
    completed = false;
  const verification = await checkArchiveFile(
    slot,
    signal,
    "verify",
    receiptSha256,
    async (source, _before, bounded, handle) => {
      result = await operation(
        source.record,
        source.directory,
        handle,
        bounded,
      );
      completed = true;
    },
  );
  if (verification.state !== "matches-record" || !completed)
    throw new SyncError(
      409,
      "The archived file does not match its inspected receipt.",
    );
  return result as T;
}
