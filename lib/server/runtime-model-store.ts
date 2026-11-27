import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { RuntimeModelStatus } from "../runtime-model";
import { archiveDirectoryGuard } from "./hub-archive";
const uuid = (value: unknown) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    value,
  );
const iso = (v: unknown) =>
  typeof v === "string" &&
  v.length === 24 &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
const same = (a: any, b: any) =>
  a.ino === b.ino && a.dev === b.dev && a.birthtimeMs === b.birthtimeMs;
export async function inspectRuntimeModelReceipt(
  directory: string,
  source: { receiptSha256: string; sha256: string; bytes: number },
): Promise<RuntimeModelStatus> {
  let handle;
  try {
    const guard = await archiveDirectoryGuard(directory),
      name = path.join(directory, "runtime-model-create.json"),
      before = await fs.lstat(/* turbopackIgnore: true */ name);
    if (!before.isFile() || before.isSymbolicLink() || before.size > 8000)
      throw Error("Unsafe model receipt");
    handle = await fs.open(
      /* turbopackIgnore: true */ name,
      constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
    );
    const opened = await handle.stat(),
      buffer = Buffer.alloc(8001),
      read = await handle.read(buffer, 0, buffer.length, 0),
      after = await handle.stat(),
      current = await fs.lstat(/* turbopackIgnore: true */ name);
    for (const s of [opened, after, current])
      if (
        !same(before, s) ||
        !s.isFile() ||
        s.isSymbolicLink() ||
        s.size !== before.size ||
        s.mtimeMs !== before.mtimeMs ||
        s.ctimeMs !== before.ctimeMs
      )
        throw Error("Model receipt changed");
    if (read.bytesRead !== before.size) throw Error("Short receipt");
    await guard();
    const v = JSON.parse(buffer.subarray(0, read.bytesRead).toString("utf8"));
    if (
      v.version !== 1 ||
      v.kind !== "runtime-model-create" ||
      v.slot !== path.basename(directory) ||
      !uuid(v.runId) ||
      !uuid(v.stageRunId) ||
      v.alias !== `nexus-archive-${v.runId}:latest` ||
      v.receiptSha256 !== source.receiptSha256 ||
      v.sha256 !== source.sha256 ||
      v.bytes !== source.bytes ||
      !["started", "created", "unconfirmed", "cancelled", "failed"].includes(
        v.state,
      ) ||
      !iso(v.startedAt) ||
      v.inferenceReady !== false ||
      (v.state !== "started" &&
        (!iso(v.finishedAt) || v.finishedAt < v.startedAt)) ||
      (v.state === "created"
        ? v.runtimeImported !== true ||
          typeof v.manifestDigest !== "string" ||
          !/^[a-f0-9]{64}$/.test(v.manifestDigest) ||
          typeof v.architecture !== "string" ||
          !/^[a-zA-Z0-9_.-]{1,100}$/.test(v.architecture)
        : v.runtimeImported !== false)
    )
      throw Error("Unsupported model receipt");
    return {
      state: "recorded",
      receipt: {
        version: 1,
        kind: "runtime-model-create",
        runId: v.runId,
        slot: v.slot,
        receiptSha256: v.receiptSha256,
        stageRunId: v.stageRunId,
        sha256: v.sha256,
        bytes: v.bytes,
        alias: v.alias,
        state: v.state,
        startedAt: v.startedAt,
        ...(v.finishedAt ? { finishedAt: v.finishedAt } : {}),
        ...(v.state === "created"
          ? { manifestDigest: v.manifestDigest, architecture: v.architecture }
          : {}),
        runtimeImported: v.state === "created",
        inferenceReady: false,
      },
    };
  } catch (error) {
    return {
      state:
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "not-recorded"
          : "unavailable",
    };
  } finally {
    await handle?.close().catch(() => {});
  }
}
