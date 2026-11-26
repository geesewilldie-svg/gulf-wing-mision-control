import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import {
  scope,
  type Scope,
  type MemoryRecord,
  type NexusTask,
} from "@/lib/foundation/contracts";
import {
  fileRoots,
  selectedDirectory,
  selectedFileVersion,
  readSelectedResource,
} from "./local-files";
import {
  listConversationMemory,
  taskForMemoryNote,
  ownerContextRevision,
} from "./foundation/store";
import { workContextStamp } from "./work-memory-context";
import { SyncError } from "./sync-store";
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const privateDir = () =>
  path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
  );
type SavedFile = { rootId: string; name: string };
export type Identity = {
  workspace: Scope;
  kind: "owner-memory" | "work-note";
  taskId?: string;
  sourceVersion: string;
  producer: "reviewed" | "automatic";
};
type Entry = Identity & {
  id: string;
  noteId: string;
  sha256: string;
  file: SavedFile;
  rootIdentity: string;
  savedAt: string;
};
const rootIdentity = (
  stat: { dev: number; ino: number; birthtimeMs: number },
  canonical: string,
) =>
  digest([
    process.platform === "win32" ? canonical.toLowerCase() : canonical,
    stat.dev,
    stat.ino,
    stat.birthtimeMs,
  ]);
const validName = (name: unknown) =>
  typeof name === "string" &&
  /^Nexus Memory Snapshots\/[a-f0-9-]{36}\/nexus-[a-z-]+[a-f0-9-]{36}\.md$/.test(
    name,
  );
export function ownerNoteVersion(records: MemoryRecord[]) {
  return digest(
    records
      .map((r) => ({
        id: r.id,
        revision: r.revision,
        kind: r.kind,
        content: r.content,
        updatedAt: r.updatedAt,
      }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  );
}
export function taskNoteVersion(task: NexusTask) {
  return digest({
    id: task.id,
    workspace: task.scope,
    revision: task.revision,
    mode: task.mode,
    state: task.state,
    request: task.request,
    reason: task.reason,
    output: task.output,
    updatedAt: task.updatedAt,
  });
}
export function noteSource(
  workspace: Scope,
  kind: Identity["kind"],
  taskId?: string,
): string | null {
  if (kind === "owner-memory")
    return ownerNoteVersion(listConversationMemory(workspace));
  if (!taskId) return null;
  const task = taskForMemoryNote(taskId, workspace);
  return task ? taskNoteVersion(task) : null;
}
async function catalog(): Promise<Entry[]> {
  const filename = path.join(privateDir(), "note-versions.json");
  let handle;
  try {
    const stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 750000)
      throw Error();
    handle = await fs.open(filename, "r");
    const opened = await handle.stat();
    if (
      opened.ino !== stat.ino ||
      opened.dev !== stat.dev ||
      opened.size > 750000
    )
      throw Error();
    const data = Buffer.alloc(750001);
    const { bytesRead } = await handle.read(data, 0, data.length, 0);
    if (bytesRead > 750000) throw Error();
    const value = JSON.parse(data.subarray(0, bytesRead).toString("utf8"));
    if (
      value.version !== 1 ||
      !Array.isArray(value.entries) ||
      value.entries.length > 500
    )
      throw Error();
    const seen = new Set();
    return value.entries.map((entry: Entry) => {
      if (
        !entry ||
        ![
          entry.id,
          entry.noteId,
          entry.sha256,
          entry.sourceVersion,
          entry.rootIdentity,
        ].every((v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v)) ||
        seen.has(entry.id) ||
        !["owner-memory", "work-note"].includes(entry.kind) ||
        !["reviewed", "automatic"].includes(entry.producer) ||
        !entry.file ||
        !/^[a-f0-9]{24}$/.test(entry.file.rootId) ||
        !validName(entry.file.name) ||
        typeof entry.savedAt !== "string" ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(entry.savedAt) ||
        !Number.isFinite(Date.parse(entry.savedAt)) ||
        (entry.kind === "work-note" &&
          (typeof entry.taskId !== "string" ||
            !/^[a-f0-9-]{36}$/i.test(entry.taskId)))
      )
        throw Error();
      scope(entry.workspace);
      if (
        entry.id !==
          digest([entry.file.rootId, entry.file.name, entry.sha256]) ||
        entry.noteId !==
          digest([
            entry.file.rootId,
            entry.kind,
            entry.workspace,
            entry.taskId || "",
          ]) ||
        (entry.kind === "owner-memory" && entry.taskId !== undefined)
      )
        throw Error();
      seen.add(entry.id);
      return entry;
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new SyncError(
      503,
      "Saved-note version catalog is unavailable. Existing notes were preserved.",
    );
  } finally {
    await handle?.close();
  }
}
// Capture a recovery binding only after verifying the confirmed file's bytes.
export async function savedNoteRoot(saved: {
  file: SavedFile;
  sha256: string;
}): Promise<string | null> {
  try {
    if (!validName(saved.file?.name) || !/^[a-f0-9]{64}$/.test(saved.sha256))
      return null;
    const root = (await fileRoots()).find(
      (r) => r.id === saved.file.rootId && r.kind === "obsidian",
    );
    if (!root) return null;
    const base = await selectedDirectory(root);
    const stat = await fs.lstat(
      path.join(base.target, ...saved.file.name.split("/")),
    );
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1500000)
      return null;
    const actual = await readSelectedResource(
      root,
      saved.file.name,
      selectedFileVersion(stat),
    );
    const again = await selectedDirectory(root);
    const binding = rootIdentity(base.stat, base.target);
    return actual.hash === saved.sha256 &&
      binding === rootIdentity(again.stat, again.target)
      ? binding
      : null;
  } catch {
    return null;
  }
}
export type TrackingProof = { rootIdentity: string; savedAt: string };
// Registration follows a confirmed create-only save. Its failure never causes
// another source write or downgrades an already confirmed file-save receipt.
export async function trackSavedNote(
  saved: { file: SavedFile; sha256: string },
  identity: Identity,
  proof?: TrackingProof,
): Promise<"tracked" | "pending"> {
  let lock;
  const dir = privateDir(),
    lockPath = path.join(dir, "note-versions.lock"),
    temporary = path.join(
      dir,
      "note-versions." + randomBytes(8).toString("hex") + ".tmp",
    );
  try {
    if (
      !validName(saved.file?.name) ||
      !/^[a-f0-9]{24}$/.test(saved.file.rootId) ||
      !/^[a-f0-9]{64}$/.test(saved.sha256) ||
      !/^[a-f0-9]{64}$/.test(identity.sourceVersion)
    )
      return "pending";
    if (
      !["owner-memory", "work-note"].includes(identity.kind) ||
      !["reviewed", "automatic"].includes(identity.producer) ||
      (identity.kind === "work-note" &&
        (typeof identity.taskId !== "string" ||
          !/^[a-f0-9-]{36}$/i.test(identity.taskId))) ||
      (identity.kind === "owner-memory" && identity.taskId !== undefined)
    )
      return "pending";
    scope(identity.workspace);
    if (
      proof &&
      (!/^[a-f0-9]{64}$/.test(proof.rootIdentity) ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(proof.savedAt) ||
        !Number.isFinite(Date.parse(proof.savedAt)))
    )
      return "pending";
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    lock = await fs.open(lockPath, "wx", 0o600);
    const entries = await catalog(),
      id = digest([saved.file.rootId, saved.file.name, saved.sha256]);
    const existing = entries.find((entry) => entry.id === id);
    if (existing)
      return existing.workspace === identity.workspace &&
        existing.kind === identity.kind &&
        existing.sourceVersion === identity.sourceVersion &&
        existing.producer === identity.producer &&
        existing.taskId === identity.taskId &&
        (!proof || existing.rootIdentity === proof.rootIdentity)
        ? "tracked"
        : "pending";
    if (entries.length >= 500) return "pending";
    const root = (await fileRoots()).find(
      (r) => r.id === saved.file.rootId && r.kind === "obsidian",
    );
    if (!root) return "pending";
    const base = await selectedDirectory(root),
      target = path.join(base.target, ...saved.file.name.split("/"));
    if (proof && rootIdentity(base.stat, base.target) !== proof.rootIdentity)
      return "pending";
    const stat = await fs.lstat(target);
    if (stat.size > 1500000 || stat.isSymbolicLink() || !stat.isFile())
      return "pending";
    const actual = await readSelectedResource(
      root,
      saved.file.name,
      selectedFileVersion(stat),
    );
    if (actual.hash !== saved.sha256) return "pending";
    const again = await selectedDirectory(root);
    if (
      rootIdentity(again.stat, again.target) !==
      rootIdentity(base.stat, base.target)
    )
      return "pending";
    const entry: Entry = {
      ...identity,
      id,
      noteId: digest([
        root.id,
        identity.kind,
        identity.workspace,
        identity.taskId || "",
      ]),
      sha256: saved.sha256,
      file: saved.file,
      rootIdentity: rootIdentity(base.stat, base.target),
      savedAt: proof?.savedAt || new Date().toISOString(),
    };
    const encoded = JSON.stringify({
      version: 1,
      entries: [...entries, entry],
    });
    if (Buffer.byteLength(encoded) > 750000) return "pending";
    await fs.writeFile(temporary, encoded, { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, path.join(dir, "note-versions.json"));
    return "tracked";
  } catch {
    return "pending";
  } finally {
    if (lock) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      await lock.close().catch(() => {});
      await fs.rm(lockPath, { force: true }).catch(() => {});
    }
  }
}
export async function inspectNoteVersions(body: any) {
  if (
    Object.keys(body).some((key) => !["op", "scope", "offset"].includes(key)) ||
    !Number.isSafeInteger(body.offset ?? 0) ||
    (body.offset ?? 0) < 0 ||
    (body.offset ?? 0) > 490
  )
    throw new SyncError(400, "Choose a valid saved-note page.");
  const workspace = scope(body.scope),
    entries = (await catalog())
      .filter((e) => e.workspace === workspace)
      .sort(
        (a, b) =>
          b.savedAt.localeCompare(a.savedAt) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
  const ownerRevision = ownerContextRevision(),
    taskStamp = workContextStamp(workspace);
  const roots = await fileRoots(),
    offset = body.offset ?? 0,
    rows = [];
  for (const entry of entries.slice(offset, offset + 10)) {
    const root = roots.find(
      (r) => r.id === entry.file.rootId && r.kind === "obsidian",
    );
    let fileState:
      | "unchanged"
      | "externally-changed"
      | "missing"
      | "unavailable" = "unavailable";
    let visibleSource = false;
    if (root)
      try {
        const base = await selectedDirectory(root);
        if (rootIdentity(base.stat, base.target) !== entry.rootIdentity)
          throw Error();
        visibleSource = true;
        const target = path.join(base.target, ...entry.file.name.split("/"));
        const stat = await fs.lstat(target);
        if (stat.size > 1500000 || stat.isSymbolicLink() || !stat.isFile())
          throw Error();
        const current = await readSelectedResource(
          root,
          entry.file.name,
          selectedFileVersion(stat),
        );
        const finalBase = await selectedDirectory(root);
        if (
          rootIdentity(finalBase.stat, finalBase.target) !== entry.rootIdentity
        ) {
          visibleSource = false;
          throw Error();
        }
        fileState =
          current.hash === entry.sha256 ? "unchanged" : "externally-changed";
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          fileState = "missing";
      }
    const currentSource = noteSource(workspace, entry.kind, entry.taskId);
    const superseded =
      currentSource !== null &&
      currentSource !== entry.sourceVersion &&
      entries.some(
        (other) =>
          other.noteId === entry.noteId &&
          other.sourceVersion === currentSource,
      );
    const reviewable =
      visibleSource &&
      fileState !== "unavailable" &&
      currentSource !== null &&
      !superseded &&
      (currentSource !== entry.sourceVersion || fileState !== "unchanged");
    rows.push({
      id: entry.id,
      noteId: entry.noteId,
      workspace,
      kind: entry.kind,
      producer: entry.producer,
      savedAt: entry.savedAt,
      name: visibleSource ? path.posix.basename(entry.file.name) : null,
      fileState,
      sourceState:
        currentSource === null
          ? "source-missing"
          : currentSource === entry.sourceVersion
            ? "matches-current-record"
            : "historical-version",
      superseded,
      reviewTarget: reviewable
        ? {
            kind: entry.kind,
            ...(entry.kind === "work-note" ? { taskId: entry.taskId } : {}),
          }
        : null,
    });
  }
  if (
    ownerContextRevision() !== ownerRevision ||
    workContextStamp(workspace) !== taskStamp ||
    digest(await fileRoots()) !== digest(roots)
  )
    throw new SyncError(
      409,
      "Source records or selected folders changed during inspection. Refresh the saved-note page.",
    );
  return {
    workspace,
    rows,
    total: entries.length,
    offset,
    nextOffset: offset + 10 < entries.length ? offset + 10 : null,
    checkedAt: new Date().toISOString(),
    notice:
      "Read-only inspection of tracked snapshots. Matching saved state is not independent factual verification. External edits and historical copies are preserved; no note was overwritten, deleted or imported.",
  };
}
