import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { briefFile } from "./brief-store";
import { SyncError } from "./sync-store";
import {
  googleAccounts,
  googleAccessToken,
  googleJson,
  googleLocked,
  DRIVE_SCOPE,
  type GoogleTransport,
} from "./google-accounts";
import { extractKnowledge } from "./knowledge-import";
import { searchDocuments, type KnowledgeDocument } from "../nexus";
import type {
  DriveFile,
  DriveSelection,
  DriveEntry,
  DriveStatus,
} from "../google-drive";
const location = (name: string) => path.join(path.dirname(briefFile()), name);
const supported = new Map([
  [
    "application/vnd.google-apps.document",
    { ext: "txt", export: "text/plain" },
  ],
  [
    "application/vnd.google-apps.spreadsheet",
    {
      ext: "xlsx",
      export:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  ],
  ["application/pdf", { ext: "pdf", export: "" }],
  ["text/plain", { ext: "txt", export: "" }],
  ["text/markdown", { ext: "md", export: "" }],
  [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    { ext: "xlsx", export: "" },
  ],
]);
const validId = (id: unknown): id is string =>
  typeof id === "string" && /^[a-zA-Z0-9_-]{10,160}$/.test(id);
const validAccount = (id: unknown): id is string =>
  typeof id === "string" && /^[a-f0-9]{24}$/.test(id);
const same = (a: DriveSelection, b: DriveSelection) =>
  a.accountId === b.accountId && a.fileId === b.fileId;
async function readJson(name: string, limit: number) {
  const h = await fs.open(location(name), "r");
  try {
    const stat = await h.stat();
    if (stat.size > limit) throw Error();
    const b = Buffer.alloc(Math.min(stat.size + 1, limit + 1));
    const { bytesRead } = await h.read(b, 0, b.length, 0);
    if (bytesRead > limit) throw Error();
    return JSON.parse(b.subarray(0, bytesRead).toString("utf8"));
  } finally {
    await h.close();
  }
}
async function atomic(name: string, value: unknown) {
  const target = location(name),
    temp = target + "." + randomBytes(8).toString("hex") + ".tmp",
    raw = JSON.stringify(value);
  if (Buffer.byteLength(raw) > 12_000_000)
    throw new SyncError(
      413,
      "Drive snapshot exceeds its storage limit. Previous snapshot preserved.",
    );
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  try {
    await fs.writeFile(temp, raw, { flag: "wx", mode: 0o600 });
    await fs.rename(temp, target);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
async function selection(): Promise<{
  version: 1;
  revision: number;
  files: DriveSelection[];
}> {
  try {
    const v = await readJson("google-drive-selected.json", 20000);
    if (
      v.version !== 1 ||
      !Number.isSafeInteger(v.revision) ||
      v.revision < 0 ||
      !Array.isArray(v.files) ||
      v.files.length > 20 ||
      v.files.some(
        (f: DriveSelection) =>
          !f || !validAccount(f.accountId) || !validId(f.fileId),
      ) ||
      new Set(v.files.map((f: DriveSelection) => f.accountId + ":" + f.fileId))
        .size !== v.files.length
    )
      throw Error();
    return v;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      return { version: 1, revision: 0, files: [] };
    throw new SyncError(
      503,
      "Drive selections could not be read. Existing selections were preserved.",
    );
  }
}
async function snapshot(): Promise<{
  version: 1;
  revision: number;
  refreshedAt: string;
  entries: DriveEntry[];
  warnings: string[];
} | null> {
  try {
    const s = await readJson("google-drive-index.json", 12_000_000);
    if (
      s.version !== 1 ||
      !Number.isSafeInteger(s.revision) ||
      !Array.isArray(s.entries) ||
      s.entries.length > 20 ||
      !Array.isArray(s.warnings) ||
      s.warnings.some(
        (w: unknown) => typeof w !== "string" || w.length > 500,
      ) ||
      !Number.isFinite(Date.parse(s.refreshedAt))
    )
      throw Error();
    for (const f of s.entries)
      if (
        !f ||
        !validId(f.fileId) ||
        !validAccount(f.accountId) ||
        !Array.isArray(f.documents) ||
        f.documents.length > 100 ||
        typeof f.name !== "string" ||
        f.name.length > 200 ||
        typeof f.mimeType !== "string" ||
        !supported.has(f.mimeType) ||
        f.documents.some(
          (d: KnowledgeDocument) =>
            !d ||
            ![d.id, d.source, d.location, d.text].every(
              (v) => typeof v === "string",
            ) ||
            d.text.length > 30000,
        )
      )
        throw Error();
    return s;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new SyncError(
      503,
      "Drive snapshot could not be read. Refresh selected files to rebuild it.",
    );
  }
}
export async function driveStatus(): Promise<DriveStatus> {
  const config = await selection(),
    saved = await snapshot(),
    accounts = await googleAccounts(),
    active = new Set(accounts.filter((a) => a.drive).map((a) => a.id));
  const selected = config.files.filter((f) => active.has(f.accountId));
  const entries =
    saved?.revision === config.revision
      ? saved.entries.filter((f) => selected.some((s) => same(s, f)))
      : [];
  return {
    selected,
    entries: entries.map(({ documents: _docs, ...f }) => ({
      ...f,
      url: sourceUrl(f.fileId, f.mimeType),
    })),
    refreshedAt: saved?.refreshedAt || null,
    warnings:
      saved?.revision === config.revision
        ? saved.warnings
        : selected.length
          ? [
              "Selections changed or cached text is missing. Refresh selected Drive files.",
            ]
          : [],
  };
}
const queue = globalThis as typeof globalThis & {
  nexusDriveQueue?: Promise<unknown>;
};
async function locked<T>(fn: () => Promise<T>) {
  const p = (queue.nexusDriveQueue ?? Promise.resolve())
    .catch(() => {})
    .then(fn);
  queue.nexusDriveQueue = p.catch(() => {});
  return p;
}
function sourceUrl(id: string, mime: string) {
  return mime === "application/vnd.google-apps.document"
    ? "https://docs.google.com/document/d/" + id + "/edit"
    : mime === "application/vnd.google-apps.spreadsheet"
      ? "https://docs.google.com/spreadsheets/d/" + id + "/edit"
      : "https://drive.google.com/file/d/" + id + "/view";
}
function metadata(raw: any): DriveFile {
  if (
    !raw ||
    !validId(raw.id) ||
    typeof raw.name !== "string" ||
    !raw.name.trim() ||
    typeof raw.mimeType !== "string" ||
    !supported.has(raw.mimeType) ||
    raw.trashed === true ||
    raw.capabilities?.canDownload === false ||
    !Number.isFinite(Date.parse(raw.modifiedTime))
  )
    throw new SyncError(
      400,
      "Choose a readable Google Doc, Sheet, PDF, text/Markdown or XLSX file. Shortcuts, folders and blocked downloads are unsupported.",
    );
  if (
    raw.size !== undefined &&
    (!Number.isFinite(Number(raw.size)) || Number(raw.size) > 2_000_000)
  )
    throw new SyncError(413, "Use Drive source files below 2 MB.");
  return {
    id: raw.id,
    name: raw.name.slice(0, 180),
    mimeType: raw.mimeType,
    modifiedAt: raw.modifiedTime,
    url: sourceUrl(raw.id, raw.mimeType),
  };
}
async function getMetadata(
  fileId: string,
  token: string,
  transport: GoogleTransport,
) {
  const url = new URL("https://www.googleapis.com/drive/v3/files/" + fileId);
  url.searchParams.set(
    "fields",
    "id,name,mimeType,modifiedTime,size,trashed,capabilities(canDownload)",
  );
  url.searchParams.set("supportsAllDrives", "true");
  const info = metadata(
    await googleJson(
      url.toString(),
      { headers: { Authorization: "Bearer " + token } },
      transport,
    ),
  );
  if (info.id !== fileId)
    throw new SyncError(502, "Google returned a different file identifier.");
  return info;
}
export async function browseDrive(
  accountId: string,
  query: string,
  transport: GoogleTransport = fetch,
) {
  if (
    !validAccount(accountId) ||
    typeof query !== "string" ||
    query.length > 100
  )
    throw new SyncError(
      400,
      "Choose an account and a search of at most 100 characters.",
    );
  const token = await googleAccessToken(accountId, DRIVE_SCOPE, transport),
    url = new URL("https://www.googleapis.com/drive/v3/files");
  const quoted = query.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
  const types = [...supported.keys()]
    .map((m) => "mimeType = '" + m + "'")
    .join(" or ");
  Object.entries({
    q:
      "trashed = false and (" +
      types +
      ")" +
      (query.trim() ? " and name contains '" + quoted + "'" : ""),
    pageSize: "25",
    spaces: "drive",
    fields:
      "files(id,name,mimeType,modifiedTime,size,trashed,capabilities(canDownload)),nextPageToken,incompleteSearch",
    orderBy: "modifiedTime desc",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  const data = await googleJson(
    url.toString(),
    { headers: { Authorization: "Bearer " + token } },
    transport,
  );
  if (!Array.isArray(data.files) || data.files.length > 25)
    throw new SyncError(502, "Google returned an invalid file list.");
  const files: DriveFile[] = [];
  let skipped = 0;
  for (const f of data.files) {
    try {
      files.push(metadata(f));
    } catch {
      skipped++;
    }
  }
  return {
    files,
    partial: !!data.nextPageToken || data.incompleteSearch === true,
    skipped,
  };
}
export async function selectDriveFile(
  accountId: string,
  fileId: string,
  transport: GoogleTransport = fetch,
) {
  if (!validAccount(accountId) || !validId(fileId))
    throw new SyncError(400, "Choose a supported Google file identifier.");
  return locked(async () => {
    const s = await selection();
    const connectedIds = new Set(
      (await googleAccounts()).filter((a) => a.drive).map((a) => a.id),
    );
    s.files = s.files.filter((f) => connectedIds.has(f.accountId));
    if (s.files.some((f) => same(f, { accountId, fileId })))
      return driveStatus();
    if (s.files.length >= 20)
      throw new SyncError(
        409,
        "Select up to 20 Drive files. Remove one first.",
      );
    const token = await googleAccessToken(accountId, DRIVE_SCOPE, transport);
    await getMetadata(fileId, token, transport);
    await googleLocked(async () => {
      if (!(await googleAccounts()).some((a) => a.id === accountId && a.drive))
        throw new SyncError(
          409,
          "This account was disconnected. Refresh status.",
        );
      await atomic("google-drive-selected.json", {
        ...s,
        revision: s.revision + 1,
        files: [...s.files, { accountId, fileId }],
      });
    });
    return driveStatus();
  });
}
export async function removeDriveFile(accountId: string, fileId: string) {
  if (!validAccount(accountId) || !validId(fileId))
    throw new SyncError(400, "Choose a selected Google file.");
  return locked(async () => {
    const s = await selection();
    await atomic("google-drive-selected.json", {
      ...s,
      revision: s.revision + 1,
      files: s.files.filter((f) => !same(f, { accountId, fileId })),
    });
    await fs.rm(location("google-drive-index.json"), { force: true });
    return driveStatus();
  });
}
async function content(
  info: DriveFile,
  token: string,
  transport: GoogleTransport,
) {
  const format = supported.get(info.mimeType)!;
  const url = new URL(
    "https://www.googleapis.com/drive/v3/files/" +
      info.id +
      (format.export ? "/export" : ""),
  );
  if (format.export) url.searchParams.set("mimeType", format.export);
  else {
    url.searchParams.set("alt", "media");
    url.searchParams.set("supportsAllDrives", "true");
  }
  const r = await transport(url.toString(), {
    headers: { Authorization: "Bearer " + token },
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok || !r.body)
    throw new SyncError(
      502,
      "Google file download failed. Check read permissions and Drive API enablement.",
    );
  const reader = r.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2_000_000) {
      await reader.cancel();
      throw new SyncError(
        413,
        "The Google export exceeds the 2 MB local-file limit.",
      );
    }
    chunks.push(value);
  }
  return { data: Buffer.concat(chunks), ext: format.ext };
}
export async function refreshDrive(transport: GoogleTransport = fetch) {
  return locked(async () => {
    const s = await selection(),
      accounts = await googleAccounts(),
      entries: DriveEntry[] = [],
      warnings: string[] = [];
    let chars = 0;
    const started = Date.now();
    for (const selected of s.files) {
      if (Date.now() - started > 60000) {
        warnings.push(
          "Drive refresh time limit reached. Later selected files were withheld; retry with fewer selections.",
        );
        break;
      }
      const account = accounts.find(
        (a) => a.id === selected.accountId && a.drive,
      );
      if (!account) continue;
      try {
        const token = await googleAccessToken(
            account.id,
            DRIVE_SCOPE,
            transport,
          ),
          info = await getMetadata(selected.fileId, token, transport),
          blob = await content(info, token, transport);
        const parsed = await extractKnowledge(
          "google-file." + blob.ext,
          blob.data,
        );
        const after = await getMetadata(selected.fileId, token, transport);
        if (
          after.modifiedAt !== info.modifiedAt ||
          after.mimeType !== info.mimeType
        )
          throw new SyncError(
            409,
            "The Google file changed during export. Refresh again.",
          );
        const size = parsed.documents.reduce((n, d) => n + d.text.length, 0);
        if (chars + size > 2_000_000 || parsed.documents.length > 100)
          throw new SyncError(413, "Combined Drive text limit reached.");
        chars += size;
        const id = createHash("sha256")
            .update(account.id + ":" + info.id)
            .digest("hex")
            .slice(0, 24),
          indexedAt = new Date().toISOString();
        entries.push({
          ...selected,
          ...info,
          indexedAt,
          documents: parsed.documents.map((d, i) => ({
            ...d,
            id: "drive-" + id + "-" + i,
            source: "Google Drive · " + account.email + " / " + info.name,
            location: d.location + " · snapshot " + indexedAt.slice(0, 10),
          })),
        });
        warnings.push(...parsed.warnings);
      } catch {
        warnings.push(
          account.email +
            " · file " +
            selected.fileId +
            ": refresh failed (unavailable, changed, oversized or unsupported). Previous cached text for this file was withheld.",
        );
      }
    }
    await googleLocked(async () => {
      const current = await googleAccounts(),
        alive = new Set(current.filter((a) => a.drive).map((a) => a.id));
      const latest = await selection();
      if (latest.revision !== s.revision)
        throw new SyncError(409, "Drive selection changed. Refresh again.");
      await atomic("google-drive-index.json", {
        version: 1,
        revision: s.revision,
        refreshedAt: new Date().toISOString(),
        entries: entries.filter((e) => alive.has(e.accountId)),
        warnings: [...new Set(warnings)],
      });
    });
    return driveStatus();
  });
}
export async function driveDocuments() {
  const s = await selection(),
    saved = await snapshot(),
    accounts = await googleAccounts(),
    alive = new Set(accounts.filter((a) => a.drive).map((a) => a.id));
  const entries =
    saved?.revision === s.revision
      ? saved.entries.filter(
          (e) => alive.has(e.accountId) && s.files.some((f) => same(f, e)),
        )
      : [];
  return {
    documents: entries.flatMap((e) => e.documents),
    warning: entries.length
      ? "Google Drive sources are saved snapshots from " +
        saved!.refreshedAt +
        ". Refresh selected files for newer text or changed permissions."
      : s.files.some((f) => alive.has(f.accountId))
        ? "Selected Google files have no current snapshot. Refresh them in Connections."
        : undefined,
  };
}
export async function searchDriveIndex(query: string) {
  if (typeof query !== "string" || !query.trim() || query.length > 2000)
    throw new SyncError(400, "Enter a search of up to 2,000 characters.");
  return {
    matches: searchDocuments((await driveDocuments()).documents, query),
  };
}
