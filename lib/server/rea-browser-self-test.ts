import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { reaRuntimeCompatible, reaTarget } from "../rea-readiness";
import { SyncError } from "./sync-store";
import {
  withOwnedReaBrowser,
  OwnedBrowserCleanupError,
} from "./owned-rea-browser";
import { inspectReaProtocol } from "./rea-protocol";
let active = false;
export async function writeReaSelfTestReceipt(summary: unknown) {
  let handle;
  try {
    const dir = path.resolve(
      process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
      "rea-self-test-receipts",
    );
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return "pending";
    const bytes = Buffer.from(JSON.stringify(summary));
    if (bytes.length > 8000) return "pending";
    for (let i = 0; i < 100; i++) {
      try {
        handle = await fs.open(
          path.join(dir, String(i) + ".json"),
          "wx+",
          0o600,
        );
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    if (!handle) return "pending";
    await handle.writeFile(bytes);
    const read = Buffer.alloc(bytes.length + 1),
      actual = await handle.read(read, 0, read.length, 0);
    return actual.bytesRead === bytes.length &&
      createHash("sha256")
        .update(read.subarray(0, actual.bytesRead))
        .digest("hex") === createHash("sha256").update(bytes).digest("hex")
      ? "saved"
      : "pending";
  } catch {
    return "pending";
  } finally {
    await handle?.close().catch(() => {});
  }
}
export async function reaBrowserSelfTest(signal: AbortSignal) {
  if (active)
    throw new SyncError(429, "An owned browser self-test is already active.");
  if (!reaRuntimeCompatible(process.version))
    throw new SyncError(
      409,
      "The Nexus server Node runtime does not meet the pinned REA range. No browser was launched.",
    );
  active = true;
  let hold = false;
  const runId = randomUUID(),
    startedAt = new Date().toISOString();
  try {
    const result = await withOwnedReaBrowser(signal, (fixture, ownedSignal) =>
      inspectReaProtocol(ownedSignal, fixture),
    );
    signal.throwIfAborted();
    if (!result.inspection)
      throw new SyncError(503, "Owned fixture evidence was not verified.");
    const summary = {
      version: 1,
      kind: "owned-browser-fixture-self-test",
      runId,
      state: "verified",
      startedAt,
      finishedAt: new Date().toISOString(),
      reaVersion: reaTarget.version,
      nodeVersion: process.version,
      ...result.inspection,
      toolsCalled: 1,
      generalSiteInspectionReady: false,
    };
    const receiptState = await writeReaSelfTestReceipt(summary);
    return {
      ...summary,
      receiptState,
      notice:
        "REA inspected a fresh owned loopback test page. The expected title, URL/origin and target matched; the REA process and owned browser closed. No personal profile/account, external site or model was used. General site inspection remains unconnected.",
    };
  } catch (error) {
    if (
      error instanceof OwnedBrowserCleanupError &&
      error.ownedProcess &&
      error.ownedProcess.exitCode === null &&
      error.ownedProcess.signalCode === null
    ) {
      hold = true;
      error.ownedProcess.once("close", () => {
        active = false;
      });
    }
    await writeReaSelfTestReceipt({
      version: 1,
      kind: "owned-browser-fixture-self-test",
      runId,
      state: signal.aborted ? "cancelled" : "failed-or-unconfirmed",
      startedAt,
      finishedAt: new Date().toISOString(),
      reaVersion: reaTarget.version,
    });
    if (error instanceof SyncError) throw error;
    throw new SyncError(
      signal.aborted ? 499 : 503,
      signal.aborted
        ? "Owned browser self-test cancelled."
        : "Owned browser self-test could not be verified.",
    );
  } finally {
    if (!hold) active = false;
  }
}
