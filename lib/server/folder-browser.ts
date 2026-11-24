import fs from "node:fs/promises";
import path from "node:path";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { config, SyncError } from "./sync-store";
import {
  fileRoots,
  selectedDirectory,
  cachedFileReferences,
  permittedRelative,
} from "./local-files";
import type { BrowserRoots, FolderPage } from "@/lib/folder-browser";
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const idFor = (root: string, name: string) =>
  createHash("sha256")
    .update(root + ":" + name)
    .digest("hex")
    .slice(0, 24);
const identity = (stat: { dev: number; ino: number; birthtimeMs: number }) =>
  digest([stat.dev, stat.ino, stat.birthtimeMs]);
function seal(secret: string, value: object) {
  const payload = Buffer.from(
    JSON.stringify({ ...value, expires: Date.now() + 30 * 60 * 1000 }),
  ).toString("base64url");
  return (
    payload +
    "." +
    createHmac("sha256", secret)
      .update("nexus-folder-v1." + payload)
      .digest("base64url")
  );
}
function unseal(secret: string, token: unknown, kind: string) {
  if (typeof token !== "string" || token.length > 2000)
    throw new SyncError(400, "Choose a folder from the browser.");
  const parts = token.split(".");
  if (
    parts.length !== 2 ||
    !/^[a-zA-Z0-9_-]+$/.test(parts[0]) ||
    !/^[a-zA-Z0-9_-]{43}$/.test(parts[1])
  )
    throw new SyncError(400, "Invalid folder reference.");
  const signature = Buffer.from(parts[1], "base64url");
  const expected = createHmac("sha256", secret)
    .update("nexus-folder-v1." + parts[0])
    .digest();
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(signature, expected)
  )
    throw new SyncError(
      403,
      "Folder reference is invalid. Start from selected folders again.",
    );
  let value;
  try {
    value = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    throw new SyncError(400, "Invalid folder reference.");
  }
  if (
    value.kind !== kind ||
    !Number.isSafeInteger(value.expires) ||
    value.expires < Date.now()
  )
    throw new SyncError(
      410,
      "Folder reference expired. Start from selected folders again.",
    );
  return value;
}
export async function browseSelectedFolders(
  body: any,
): Promise<BrowserRoots | FolderPage> {
  if (
    !body ||
    typeof body !== "object" ||
    Object.keys(body).some(
      (key) => !["action", "handle", "cursor"].includes(key),
    )
  )
    throw new SyncError(
      400,
      "Use selected-folder browser controls; paths are not accepted.",
    );
  const settings = await config();
  if (!settings) throw new SyncError(503, "Laptop pairing is not configured.");
  const roots = await fileRoots(),
    selection = digest(roots);
  if (body.action === "roots") {
    const result: BrowserRoots = {
      host: {
        id: digest([settings.signingSecret, "folder-host"]).slice(0, 24),
        label: "This Nexus host",
      },
      roots: [],
    };
    for (const root of roots) {
      try {
        const current = await selectedDirectory(root);
        result.roots.push({
          id: idFor(root.id, ""),
          rootId: root.id,
          name: root.label,
          kind: root.kind,
          available: true,
          handle: seal(settings.signingSecret, {
            kind: "folder",
            rootId: root.id,
            path: "",
            selection,
            identity: identity(current.stat),
          }),
        });
      } catch {
        result.roots.push({
          id: idFor(root.id, ""),
          rootId: root.id,
          name: root.label,
          kind: root.kind,
          available: false,
        });
      }
    }
    return result;
  }
  if (body.action !== "list")
    throw new SyncError(400, "Choose a supported folder browsing operation.");
  const reference = unseal(settings.signingSecret, body.handle, "folder");
  if (
    !/^[a-f0-9]{24}$/.test(reference.rootId) ||
    typeof reference.path !== "string" ||
    (reference.path && !permittedRelative(reference.path)) ||
    reference.selection !== selection
  )
    throw new SyncError(
      409,
      "Selected folders changed. Start from selected folders again.",
    );
  const root = roots.find((root) => root.id === reference.rootId);
  if (!root) throw new SyncError(404, "Selected folder is unavailable.");
  let directory;
  try {
    directory = await selectedDirectory(root, reference.path);
  } catch {
    throw new SyncError(
      409,
      "Folder is unavailable or was replaced. Start from selected folders again.",
    );
  }
  if (identity(directory.stat) !== reference.identity)
    throw new SyncError(
      409,
      "Folder identity changed. Start from selected folders again.",
    );
  const indexed = await cachedFileReferences(roots).catch(() => []);
  const entries: FolderPage["entries"] = [];
  let inspected = 0,
    omitted = 0,
    limited = false;
  const started = Date.now();
  try {
    const stream = await fs.opendir(directory.target);
    for await (const entry of stream) {
      if (inspected >= 1000 || Date.now() - started > 5000) {
        limited = true;
        break;
      }
      inspected++;
      const relative = reference.path
        ? reference.path + "/" + entry.name
        : entry.name;
      if (
        !permittedRelative(relative) ||
        relative.split("/").length > 16 ||
        entry.isSymbolicLink() ||
        (!entry.isDirectory() && !entry.isFile())
      ) {
        omitted++;
        continue;
      }
      try {
        const stat = await fs.lstat(path.join(directory.target, entry.name));
        if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
          omitted++;
          continue;
        }
        const folder = stat.isDirectory();
        const known = folder
          ? undefined
          : indexed.find(
              (file) =>
                file.rootId === root.id &&
                file.name === relative &&
                file.size === stat.size &&
                file.modifiedAt === stat.mtime.toISOString(),
            );
        entries.push({
          id: idFor(root.id, relative),
          name: entry.name,
          relativeName: relative,
          kind: folder ? "folder" : "file",
          size: folder ? null : stat.size,
          modifiedAt: stat.mtime.toISOString(),
          ...(folder
            ? {
                handle: seal(settings.signingSecret, {
                  kind: "folder",
                  rootId: root.id,
                  path: relative,
                  selection,
                  identity: identity(stat),
                }),
              }
            : {}),
          ...(known
            ? {
                indexed: {
                  id: known.id,
                  hash: known.hash,
                  sections: known.sections,
                },
              }
            : {}),
        });
      } catch {
        omitted++;
      }
    }
    const after = await selectedDirectory(root, reference.path);
    if (
      identity(after.stat) !== reference.identity ||
      after.stat.mtimeMs !== directory.stat.mtimeMs ||
      digest(await fileRoots()) !== selection
    )
      throw Error("Changed folder");
  } catch {
    throw new SyncError(
      409,
      "Folder changed, is unavailable or cannot be listed. Reload this folder or return to selected folders.",
    );
  }
  entries.sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "folder" ? -1 : 1) ||
      a.name.localeCompare(b.name),
  );
  const folderId = idFor(root.id, reference.path),
    listing = digest(
      entries.map((entry) => [
        entry.id,
        entry.kind,
        entry.size,
        entry.modifiedAt,
      ]),
    );
  let offset = 0;
  if (body.cursor !== undefined && body.cursor !== null) {
    const page = unseal(settings.signingSecret, body.cursor, "page");
    if (
      page.folderId !== folderId ||
      page.listing !== listing ||
      page.selection !== selection ||
      !Number.isSafeInteger(page.offset) ||
      page.offset < 50 ||
      page.offset > 1000 ||
      page.offset % 50 !== 0 ||
      page.offset >= entries.length
    )
      throw new SyncError(
        409,
        "Folder listing changed. Reload the first page.",
      );
    offset = page.offset;
  }
  return {
    location: {
      id: folderId,
      parentId: reference.path
        ? idFor(
            root.id,
            path.posix.dirname(reference.path) === "."
              ? ""
              : path.posix.dirname(reference.path),
          )
        : null,
      rootId: root.id,
      rootLabel: root.label,
      name: reference.path ? path.posix.basename(reference.path) : root.label,
      relativeName: reference.path,
    },
    entries: entries.slice(offset, offset + 50),
    inspected,
    omitted,
    visible: entries.length,
    limited,
    nextCursor:
      offset + 50 < entries.length
        ? seal(settings.signingSecret, {
            kind: "page",
            folderId,
            listing,
            selection,
            offset: offset + 50,
          })
        : null,
  };
}
