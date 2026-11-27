import fs from "node:fs/promises";
import { constants, type Stats } from "node:fs";
import path from "node:path";
import { localDetailModel } from "../local-model-details";
import type { LocalModelCheck } from "../local-model-check";
import type {
  LocalModelCheckHistory,
  LocalModelCheckRecord,
} from "../local-model-check-history";

const isoTime = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length !== 24) return false;
  const time = new Date(value);
  return Number.isFinite(time.getTime()) && time.toISOString() === value;
};
export function projectLocalModelCheckRecord(
  value: any,
): LocalModelCheckRecord | null {
  if (
    !value ||
    value.version !== 1 ||
    value.kind !== "fixed-local-model-check" ||
    typeof value.runId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value.runId,
    ) ||
    !localDetailModel(value.model) ||
    !localDetailModel(value.reportedModel) ||
    (value.model.includes(":") ? value.model : value.model + ":latest") !==
      (value.reportedModel.includes(":")
        ? value.reportedModel
        : value.reportedModel + ":latest") ||
    typeof value.digest !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.digest) ||
    !isoTime(value.checkedAt) ||
    !["passed", "unexpected-response"].includes(value.state) ||
    !Number.isSafeInteger(value.elapsedMs) ||
    value.elapsedMs < 0 ||
    value.elapsedMs > 45000 ||
    !(
      value.reportedOutputTokens === null ||
      (Number.isSafeInteger(value.reportedOutputTokens) &&
        value.reportedOutputTokens >= 0)
    ) ||
    (value.state === "passed" &&
      value.reportedOutputTokens !== null &&
      value.reportedOutputTokens > 8)
  )
    return null;
  return {
    runId: value.runId,
    model: value.model,
    digest: value.digest,
    reportedModel: value.reportedModel,
    checkedAt: value.checkedAt,
    elapsedMs: value.elapsedMs,
    state: value.state,
    reportedOutputTokens: value.reportedOutputTokens,
  };
}
const sameIdentity = (a: Stats, b: Stats) =>
  a.ino === b.ino && a.dev === b.dev && a.birthtimeMs === b.birthtimeMs;
// Fixed numbered slots only; never enumerate caller paths or return raw file text.
export async function readLocalModelCheckHistory(
  signal: AbortSignal,
): Promise<LocalModelCheckHistory> {
  const base: LocalModelCheckHistory = {
    state: "unavailable",
    readAt: new Date().toISOString(),
    records: [],
    validRecords: 0,
    withheldRecords: 0,
    occupiedSlots: 0,
    capacity: 100,
    pageLimit: 20,
    notice:
      "Completed fixed local diagnostics only, newest twenty of at most one hundred retained receipts. Historical success is not current model identity, hardware fit or future readiness. Reading history does not contact a runtime or run a model. Failed, cancelled and uncertain requests are not recorded here.",
  };
  const root = path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
  );
  const directory = path.join(root, "local-model-check-receipts");
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
  const records: LocalModelCheckRecord[] = [],
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
        after.ctimeMs !== before.ctimeMs ||
        current.ctimeMs !== before.ctimeMs ||
        current.size !== before.size ||
        after.size !== before.size
      )
        throw Error();
      const record = projectLocalModelCheckRecord(
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
      b.checkedAt.localeCompare(a.checkedAt) || a.runId.localeCompare(b.runId),
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

// A completed diagnostic is kept even when its separate metadata save is unavailable.
// Fixed exclusive slots prevent replacement; incomplete/uncertain files occupy their slot.
export async function saveLocalModelCheck(
  result: LocalModelCheck,
): Promise<"saved" | "pending"> {
  let handle;
  try {
    const value = { version: 1, kind: "fixed-local-model-check", ...result };
    const record = projectLocalModelCheckRecord(value);
    if (!record) return "pending";
    const root = path.resolve(
      process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
    );
    const directory = path.join(root, "local-model-check-receipts");
    const rootBefore = await fs.lstat(/* turbopackIgnore: true */ root);
    if (!rootBefore.isDirectory() || rootBefore.isSymbolicLink())
      return "pending";
    await fs
      .mkdir(/* turbopackIgnore: true */ directory, { mode: 0o700 })
      .catch((e) => {
        if (e.code !== "EEXIST") throw e;
      });
    const dirBefore = await fs.lstat(/* turbopackIgnore: true */ directory);
    if (!dirBefore.isDirectory() || dirBefore.isSymbolicLink())
      return "pending";
    const guard = async () => {
      for (const [name, before] of [
        [root, rootBefore],
        [directory, dirBefore],
      ] as const) {
        const now = await fs.lstat(/* turbopackIgnore: true */ name);
        if (
          !now.isDirectory() ||
          now.isSymbolicLink() ||
          !sameIdentity(before, now)
        )
          throw Error("History store changed");
      }
    };
    let name = "";
    for (let slot = 0; slot < 100; slot++) {
      await guard();
      name = path.join(directory, slot + ".json");
      try {
        handle = await fs.open(
          /* turbopackIgnore: true */ name,
          constants.O_CREAT |
            constants.O_EXCL |
            constants.O_RDWR |
            (constants.O_NOFOLLOW || 0),
          0o600,
        );
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      }
    }
    if (!handle) return "pending";
    const opened = await handle.stat();
    await guard();
    const bytes = Buffer.from(
      JSON.stringify({
        version: 1,
        kind: "fixed-local-model-check",
        ...record,
      }),
    );
    if (bytes.length > 8000) return "pending";
    await handle.writeFile(bytes);
    await handle.sync();
    const buffer = Buffer.alloc(bytes.length + 1),
      read = await handle.read(buffer, 0, buffer.length, 0);
    const current = await fs.lstat(/* turbopackIgnore: true */ name),
      after = await handle.stat();
    await guard();
    if (
      !current.isFile() ||
      current.isSymbolicLink() ||
      !sameIdentity(opened, current) ||
      !sameIdentity(opened, after) ||
      current.size !== bytes.length ||
      after.size !== bytes.length ||
      current.mtimeMs !== after.mtimeMs ||
      current.ctimeMs !== after.ctimeMs ||
      read.bytesRead !== bytes.length ||
      !buffer.subarray(0, read.bytesRead).equals(bytes)
    )
      return "pending";
    return "saved";
  } catch {
    return "pending";
  } finally {
    await handle?.close().catch(() => {});
  }
}
