import fs from "node:fs/promises";
import { constants, type Stats } from "node:fs";
import path from "node:path";
import type {
  ReaSelfTestHistory,
  ReaSelfTestRecord,
} from "../rea-self-test-history";

const isoTime = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length !== 24) return false;
  const time = new Date(value);
  return Number.isFinite(time.getTime()) && time.toISOString() === value;
};
export function projectReaSelfTestRecord(value: any): ReaSelfTestRecord | null {
  if (
    !value ||
    value.version !== 1 ||
    value.kind !== "owned-browser-fixture-self-test" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value.runId || "",
    ) ||
    !["verified", "cancelled", "failed-or-unconfirmed"].includes(value.state) ||
    !isoTime(value.startedAt) ||
    !isoTime(value.finishedAt) ||
    value.finishedAt < value.startedAt ||
    typeof value.reaVersion !== "string" ||
    !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value.reaVersion)
  )
    return null;
  const record: ReaSelfTestRecord = {
    runId: value.runId,
    state: value.state,
    startedAt: value.startedAt,
    finishedAt: value.finishedAt,
    reaVersion: value.reaVersion,
  };
  if (value.state === "verified") {
    if (
      value.toolsCalled !== 1 ||
      value.generalSiteInspectionReady !== false ||
      !/^ev_[a-f0-9]{64}$/.test(value.evidenceId || "") ||
      !/^[a-f0-9]{64}$/.test(value.evidenceSha256 || "") ||
      typeof value.nodeVersion !== "string" ||
      !/^v\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value.nodeVersion) ||
      typeof value.completeness !== "string" ||
      !/^[a-z_-]{1,80}$/.test(value.completeness)
    )
      return null;
    Object.assign(record, {
      nodeVersion: value.nodeVersion,
      evidenceId: value.evidenceId,
      evidenceSha256: value.evidenceSha256,
      completeness: value.completeness,
    });
  }
  return record;
}
const sameIdentity = (a: Stats, b: Stats) =>
  a.ino === b.ino && a.dev === b.dev && a.birthtimeMs === b.birthtimeMs;
// Fixed numbered slots only; never enumerate caller paths or return raw file text.
export async function readReaSelfTestHistory(
  signal: AbortSignal,
): Promise<ReaSelfTestHistory> {
  const base: ReaSelfTestHistory = {
    state: "unavailable",
    readAt: new Date().toISOString(),
    records: [],
    validRecords: 0,
    withheldRecords: 0,
    occupiedSlots: 0,
    capacity: 100,
    pageLimit: 20,
    generalSiteInspectionReady: false,
    notice:
      "Historical local test receipts only. They are not a fresh readiness check, an independent integrity proof or a general-site inspection report. No process or browser was started.",
  };
  const root = path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
  );
  const directory = path.join(root, "rea-self-test-receipts");
  const identities: { name: string; stat: Stats }[] = [];
  try {
    for (const name of [root, directory]) {
      signal.throwIfAborted();
      const stat = await fs.lstat(/* turbopackIgnore: true */ name);
      if (!stat.isDirectory() || stat.isSymbolicLink()) return base;
      identities.push({ name, stat });
    }
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
  const records: ReaSelfTestRecord[] = [],
    seen = new Set<string>();
  let occupiedSlots = 0,
    withheldRecords = 0;
  for (let slot = 0; slot < 100; slot++) {
    signal.throwIfAborted();
    let handle;
    let exists = false;
    try {
      const name = path.join(directory, slot + ".json");
      const before = await fs.lstat(/* turbopackIgnore: true */ name);
      exists = true;
      if (!before.isFile() || before.isSymbolicLink() || before.size > 8000)
        throw Error();
      handle = await fs.open(
        /* turbopackIgnore: true */ name,
        constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
      );
      const opened = await handle.stat();
      if (
        !opened.isFile() ||
        !sameIdentity(before, opened) ||
        opened.size !== before.size
      )
        throw Error();
      const buffer = Buffer.alloc(8001),
        read = await handle.read(buffer, 0, buffer.length, 0);
      const after = await handle.stat(),
        current = await fs.lstat(/* turbopackIgnore: true */ name);
      if (
        read.bytesRead !== before.size ||
        read.bytesRead > 8000 ||
        !sameIdentity(before, after) ||
        !sameIdentity(before, current) ||
        current.isSymbolicLink() ||
        after.mtimeMs !== before.mtimeMs ||
        current.mtimeMs !== before.mtimeMs ||
        current.size !== before.size ||
        after.size !== before.size
      )
        throw Error();
      const record = projectReaSelfTestRecord(
        JSON.parse(buffer.subarray(0, read.bytesRead).toString("utf8")),
      );
      if (!record || seen.has(record.runId)) throw Error();
      seen.add(record.runId);
      records.push(record);
    } catch (error) {
      if (exists || (error as NodeJS.ErrnoException).code !== "ENOENT") {
        withheldRecords++;
        exists = true;
      }
    } finally {
      if (exists) occupiedSlots++;
      await handle?.close().catch(() => {});
    }
  }
  signal.throwIfAborted();
  for (const identity of identities) {
    try {
      const after = await fs.lstat(/* turbopackIgnore: true */ identity.name);
      if (
        !after.isDirectory() ||
        after.isSymbolicLink() ||
        !sameIdentity(identity.stat, after)
      )
        return base;
    } catch {
      return base;
    }
  }
  records.sort(
    (a, b) =>
      b.finishedAt.localeCompare(a.finishedAt) ||
      a.runId.localeCompare(b.runId),
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
