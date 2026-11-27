import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { archiveDirectoryGuard } from "./hub-archive";
import type { HubArchiveRecovery } from "../hub-archive";
import { SyncError } from "./sync-store";
type Binding = {
  slot: string;
  runId: string;
  receiptSha256: string;
  bytes: number;
  sha256: string;
  sourceState: string;
};
type RecoveryRecord = {
  version: 1;
  kind: "hub-archive-recovery";
  state: "matching-published-file";
  recoveryId: string;
  recordedAt: string;
  slot: string;
  sourceRunId: string;
  sourceReceiptSha256: string;
  sourceState: string;
  observedBytes: number;
  observedSha256: string;
  runtimeImported: false;
  inferenceReady: false;
};
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    v,
  );
const same = (a: any, b: any) =>
  a.ino === b.ino && a.dev === b.dev && a.birthtimeMs === b.birthtimeMs;
const shape = (d: any): d is RecoveryRecord =>
  !!d &&
  d.version === 1 &&
  d.kind === "hub-archive-recovery" &&
  d.state === "matching-published-file" &&
  uuid(d.recoveryId) &&
  uuid(d.sourceRunId) &&
  /^asset-0\d{2}$/.test(d.slot) &&
  typeof d.recordedAt === "string" &&
  d.recordedAt.length === 24 &&
  Number.isFinite(Date.parse(d.recordedAt)) &&
  new Date(d.recordedAt).toISOString() === d.recordedAt &&
  typeof d.sourceReceiptSha256 === "string" &&
  /^[a-f0-9]{64}$/.test(d.sourceReceiptSha256) &&
  ["started", "publication-unconfirmed"].includes(d.sourceState) &&
  Number.isSafeInteger(d.observedBytes) &&
  d.observedBytes > 0 &&
  d.observedBytes <= 4 * 1024 ** 3 &&
  typeof d.observedSha256 === "string" &&
  /^[a-f0-9]{64}$/.test(d.observedSha256) &&
  d.runtimeImported === false &&
  d.inferenceReady === false;
async function read(directory: string): Promise<RecoveryRecord> {
  const guard = await archiveDirectoryGuard(directory),
    name = path.join(directory, "recovery.json");
  let handle;
  try {
    const before = await fs.lstat(/* turbopackIgnore: true */ name);
    if (!before.isFile() || before.isSymbolicLink() || before.size > 8000)
      throw Error("Unsafe recovery metadata");
    handle = await fs.open(
      /* turbopackIgnore: true */ name,
      constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
    );
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      !same(before, opened) ||
      opened.size !== before.size
    )
      throw Error("Recovery metadata changed");
    const bytes = Buffer.alloc(8001),
      r = await handle.read(bytes, 0, bytes.length, 0),
      after = await handle.stat(),
      current = await fs.lstat(/* turbopackIgnore: true */ name);
    if (
      r.bytesRead !== before.size ||
      r.bytesRead > 8000 ||
      !same(before, after) ||
      !same(before, current) ||
      current.isSymbolicLink() ||
      after.size !== before.size ||
      current.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      current.mtimeMs !== before.mtimeMs
    )
      throw Error("Recovery metadata changed");
    await guard();
    const d = JSON.parse(bytes.subarray(0, r.bytesRead).toString("utf8"));
    if (!shape(d)) throw Error("Invalid recovery metadata");
    return d;
  } finally {
    await handle?.close().catch(() => {});
  }
}
const matches = (d: RecoveryRecord, b: Binding) =>
  d.slot === b.slot &&
  d.sourceRunId === b.runId &&
  d.sourceReceiptSha256 === b.receiptSha256 &&
  d.sourceState === b.sourceState &&
  d.observedBytes === b.bytes &&
  d.observedSha256 === b.sha256;
export async function inspectArchiveRecovery(
  directory: string,
  binding: Binding,
): Promise<{
  state: "recorded" | "not-recorded" | "source-changed" | "unavailable";
  recordedAt?: string;
}> {
  try {
    const d = await read(directory);
    return {
      state: matches(d, binding) ? "recorded" : "source-changed",
      recordedAt: d.recordedAt,
    };
  } catch (error) {
    return {
      state:
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "not-recorded"
          : "unavailable",
    };
  }
}
export async function saveArchiveRecovery(
  directory: string,
  binding: Binding,
  signal: AbortSignal,
): Promise<HubArchiveRecovery> {
  signal.throwIfAborted();
  const guard = await archiveDirectoryGuard(directory),
    name = path.join(directory, "recovery.json");
  let handle;
  try {
    try {
      handle = await fs.open(/* turbopackIgnore: true */ name, "wx+", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let prior;
      try {
        prior = await read(directory);
      } catch {
        throw new SyncError(
          409,
          "Existing recovery metadata could not be verified and was retained.",
        );
      }
      if (!matches(prior, binding))
        throw new SyncError(
          409,
          "Existing recovery metadata belongs to a different source record and was retained.",
        );
      return {
        recoveryId: prior.recoveryId,
        recordedAt: prior.recordedAt,
        state: "already-recorded",
      };
    }
    const d: RecoveryRecord = {
      version: 1,
      kind: "hub-archive-recovery",
      state: "matching-published-file",
      recoveryId: randomUUID(),
      recordedAt: new Date().toISOString(),
      slot: binding.slot,
      sourceRunId: binding.runId,
      sourceReceiptSha256: binding.receiptSha256,
      sourceState: binding.sourceState,
      observedBytes: binding.bytes,
      observedSha256: binding.sha256,
      runtimeImported: false,
      inferenceReady: false,
    };
    const before = await handle.stat(),
      bytes = Buffer.from(JSON.stringify(d));
    if (bytes.length > 8000) throw Error("Recovery limit");
    signal.throwIfAborted();
    await guard();
    let offset = 0;
    while (offset < bytes.length) {
      const r = await handle.write(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (!r.bytesWritten) throw Error("No metadata write progress");
      offset += r.bytesWritten;
    }
    await handle.sync();
    const buffer = Buffer.alloc(bytes.length + 1),
      r = await handle.read(buffer, 0, buffer.length, 0),
      current = await fs.lstat(/* turbopackIgnore: true */ name);
    if (
      r.bytesRead !== bytes.length ||
      !buffer.subarray(0, r.bytesRead).equals(bytes) ||
      !same(before, current) ||
      current.isSymbolicLink() ||
      current.size !== bytes.length
    )
      throw Error("Recovery metadata readback failed");
    await guard();
    return {
      recoveryId: d.recoveryId,
      recordedAt: d.recordedAt,
      state: "saved",
    };
  } finally {
    await handle?.close().catch(() => {});
  }
}
