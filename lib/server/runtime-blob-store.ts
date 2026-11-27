import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { RuntimeBlobReceipt, RuntimeBlobStatus } from "../runtime-blob";
import { archiveDirectoryGuard } from "./hub-archive";
const same = (a: any, b: any) =>
  a.ino === b.ino && a.dev === b.dev && a.birthtimeMs === b.birthtimeMs;
export async function inspectRuntimeBlobReceipt(
  directory: string,
  source: { receiptSha256: string; sha256: string; bytes: number },
): Promise<RuntimeBlobStatus> {
  let handle;
  try {
    const guard = await archiveDirectoryGuard(directory),
      name = path.join(directory, "runtime-blob-stage.json"),
      before = await fs.lstat(/* turbopackIgnore: true */ name);
    if (!before.isFile() || before.isSymbolicLink() || before.size > 8000)
      throw Error("Unsafe stage receipt");
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
        throw Error("Stage receipt changed");
    if (read.bytesRead !== before.size) throw Error("Short receipt");
    await guard();
    const v = JSON.parse(buffer.subarray(0, read.bytesRead).toString("utf8"));
    if (
      v.version !== 1 ||
      v.kind !== "runtime-blob-stage" ||
      v.slot !== path.basename(directory) ||
      !/^([a-f0-9]{8}-){1}[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        v.runId,
      ) ||
      v.receiptSha256 !== source.receiptSha256 ||
      v.sha256 !== source.sha256 ||
      v.bytes !== source.bytes ||
      !["started", "staged", "unconfirmed", "cancelled", "failed"].includes(
        v.state,
      ) ||
      v.runtimeImported !== false ||
      v.inferenceReady !== false ||
      typeof v.startedAt !== "string" ||
      !Number.isFinite(Date.parse(v.startedAt)) ||
      v.startedAt.length > 40 ||
      (v.state !== "started" &&
        (typeof v.finishedAt !== "string" ||
          v.finishedAt.length > 40 ||
          !Number.isFinite(Date.parse(v.finishedAt))))
    )
      throw Error("Unsupported stage receipt");
    return {
      state: "recorded",
      receipt: {
        version: 1,
        kind: "runtime-blob-stage",
        runId: v.runId,
        slot: v.slot,
        receiptSha256: v.receiptSha256,
        sha256: v.sha256,
        bytes: v.bytes,
        state: v.state,
        startedAt: v.startedAt,
        ...(v.finishedAt ? { finishedAt: v.finishedAt } : {}),
        ...(typeof v.reusedExisting === "boolean"
          ? { reusedExisting: v.reusedExisting }
          : {}),
        runtimeImported: false,
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
export async function beginRuntimeBlobReceipt(
  directory: string,
  initial: RuntimeBlobReceipt,
) {
  const guard = await archiveDirectoryGuard(directory),
    name = path.join(directory, "runtime-blob-stage.json"),
    handle = await fs.open(/* turbopackIgnore: true */ name, "wx+", 0o600),
    identity = await handle.stat();
  async function save(value: RuntimeBlobReceipt) {
    await guard();
    const current = await fs.lstat(/* turbopackIgnore: true */ name);
    if (!same(identity, current) || current.isSymbolicLink())
      throw Error("Stage receipt replaced");
    const bytes = Buffer.from(JSON.stringify(value));
    if (bytes.length > 8000) throw Error("Receipt limit");
    let offset = 0;
    while (offset < bytes.length) {
      const w = await handle.write(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (!w.bytesWritten) throw Error("Short receipt write");
      offset += w.bytesWritten;
    }
    await handle.truncate(bytes.length);
    await handle.sync();
    const read = Buffer.alloc(bytes.length);
    const result = await handle.read(read, 0, read.length, 0);
    if (result.bytesRead !== bytes.length || !read.equals(bytes))
      throw Error("Receipt readback failed");
    await guard();
    const final = await fs.lstat(/* turbopackIgnore: true */ name);
    if (!same(identity, final) || final.isSymbolicLink())
      throw Error("Stage receipt replaced");
  }
  try {
    await save(initial);
  } catch (error) {
    await handle.close().catch(() => {});
    throw error;
  }
  return { save, close: () => handle.close() };
}
