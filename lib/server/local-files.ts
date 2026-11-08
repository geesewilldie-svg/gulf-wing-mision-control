import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import type { KnowledgeDocument } from "../nexus";
import type {
  FileRoot,
  IndexedFile,
  RootScan,
  FileSearchStatus,
} from "../local-files";
import { extractKnowledge } from "./knowledge-import";
import { SyncError } from "./sync-store";

const privateDir = () =>
  path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
  );
const digest = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
const excluded = new Set([
  "node_modules",
  "windows",
  "program files",
  "program files (x86)",
  "appdata",
  "$recycle.bin",
  "system volume information",
  "business-backups",
]);
const privateNames =
  /^(?:credentials?|secrets?|tokens?|passwords?|client[_-]?secret|google-oauth|sync-config|local-folders|local-file-index)(?:[._-]|$)/i;
const supported = new Set([".md", ".txt", ".pdf", ".xlsx"]);
const inside = (root: string, target: string) => {
  const relative = path.relative(root, target);
  return (
    relative !== ".." &&
    !relative.startsWith(".." + path.sep) &&
    !path.isAbsolute(relative)
  );
};
export function permittedRelative(name: string) {
  return (
    name.length > 0 &&
    name.length <= 220 &&
    !name.includes("\\") &&
    !name.includes(":") &&
    name
      .split("/")
      .every(
        (p) =>
          p &&
          p !== ".." &&
          !p.startsWith(".") &&
          !excluded.has(p.toLowerCase()) &&
          !privateNames.test(p),
      )
  );
}
async function boundedJson(name: string, limit: number) {
  const filename = path.join(privateDir(), name);
  const handle = await fs.open(filename, "r");
  try {
    const stat = await handle.stat();
    if (stat.size > limit) throw Error();
    const buffer = Buffer.alloc(limit + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > limit) throw Error();
    return JSON.parse(buffer.subarray(0, bytesRead).toString("utf8"));
  } finally {
    await handle.close();
  }
}
export async function fileRoots(): Promise<FileRoot[]> {
  try {
    const config = await boundedJson("local-folders.json", 20000);
    if (
      config.version !== 1 ||
      !Array.isArray(config.roots) ||
      config.roots.length > 4
    )
      throw Error();
    const seen = new Set<string>();
    return config.roots.map((r: FileRoot) => {
      if (
        !r ||
        !/^[a-f0-9]{24}$/.test(r.id) ||
        seen.has(r.id) ||
        !["folder", "obsidian"].includes(r.kind) ||
        typeof r.label !== "string" ||
        !r.label.trim() ||
        r.label.length > 60 ||
        typeof r.path !== "string" ||
        r.path.length > 1000 ||
        !path.isAbsolute(r.path)
      )
        throw Error();
      seen.add(r.id);
      return { id: r.id, label: r.label, kind: r.kind, path: r.path };
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new SyncError(
      503,
      "Local folder configuration could not be read. Existing files were preserved.",
    );
  }
}
async function atomic(name: string, value: unknown) {
  await fs.mkdir(privateDir(), { recursive: true, mode: 0o700 });
  const target = path.join(privateDir(), name),
    temp = target + "." + randomBytes(8).toString("hex") + ".tmp";
  try {
    const encoded = JSON.stringify(value);
    if (Buffer.byteLength(encoded) > 12_000_000)
      throw new SyncError(
        413,
        "The file snapshot exceeded its storage limit. Previous index preserved.",
      );
    await fs.writeFile(temp, encoded, {
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temp, target);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
async function canonicalRoot(root: FileRoot) {
  const stat = await fs.lstat(root.path);
  const real = await fs.realpath(root.path);
  // Reject a root replaced by a junction/symlink or any newly redirected parent.
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (process.platform === "win32"
      ? real.toLowerCase() !== root.path.toLowerCase()
      : real !== root.path)
  )
    throw Error();
  return real;
}
async function fileIdentity(root: FileRoot, name: string) {
  if (
    !permittedRelative(name) ||
    !supported.has(path.extname(name).toLowerCase()) ||
    (root.kind === "obsidian" && path.extname(name).toLowerCase() !== ".md")
  )
    throw Error();
  const base = await canonicalRoot(root);
  const target = path.join(base, ...name.split("/"));
  // Check every component: do not follow directory junctions or symbolic links.
  let parent = base;
  for (const component of name.split("/")) {
    parent = path.join(parent, component);
    if ((await fs.lstat(parent)).isSymbolicLink()) throw Error();
  }
  const stat = await fs.lstat(target),
    real = await fs.realpath(target);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    !inside(base, real) ||
    stat.size > 2_000_000
  )
    throw Error();
  return { target, stat, real };
}
async function readSource(root: FileRoot, name: string) {
  const before = await fileIdentity(root, name),
    handle = await fs.open(before.target, "r");
  try {
    const opened = await handle.stat();
    if (
      opened.ino !== before.stat.ino ||
      opened.dev !== before.stat.dev ||
      opened.size !== before.stat.size ||
      opened.mtimeMs !== before.stat.mtimeMs
    )
      throw Error();
    const buffer = Buffer.alloc(Math.min(opened.size + 1, 2_000_001));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const after = await fileIdentity(root, name),
      done = await handle.stat();
    if (
      bytesRead !== opened.size ||
      after.stat.ino !== opened.ino ||
      after.stat.dev !== opened.dev ||
      done.size !== opened.size ||
      done.mtimeMs !== opened.mtimeMs ||
      after.stat.mtimeMs !== opened.mtimeMs
    )
      throw Error();
    return { data: buffer.subarray(0, bytesRead), stat: done };
  } finally {
    await handle.close();
  }
}
type Index = {
  version: 1;
  configHash: string;
  scannedAt: string;
  scans: RootScan[];
  files: IndexedFile[];
};
async function index(): Promise<Index | null> {
  try {
    const value = await boundedJson("local-file-index.json", 12_000_000);
    if (
      value.version !== 1 ||
      typeof value.configHash !== "string" ||
      !Array.isArray(value.files) ||
      value.files.length > 200 ||
      !Array.isArray(value.scans) ||
      value.scans.length > 4 ||
      !Number.isFinite(Date.parse(value.scannedAt))
    )
      throw Error();
    for (const f of value.files) {
      if (
        !/^[a-f0-9]{24}$/.test(f.id) ||
        !/^[a-f0-9]{24}$/.test(f.rootId) ||
        typeof f.name !== "string" ||
        !permittedRelative(f.name) ||
        !/^[a-f0-9]{64}$/.test(f.hash) ||
        !Number.isFinite(Date.parse(f.modifiedAt)) ||
        !Number.isFinite(f.size) ||
        !Array.isArray(f.documents) ||
        f.documents.length > 100 ||
        f.documents.some(
          (d: KnowledgeDocument) =>
            !d ||
            ![d.id, d.source, d.location, d.text].every(
              (s) => typeof s === "string",
            ) ||
            d.text.length > 30000,
        )
      )
        throw Error();
    }
    return value;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new SyncError(
      503,
      "Local file index could not be read. Refresh the index to rebuild it; source files are unchanged.",
    );
  }
}
const configHash = (roots: FileRoot[]) => digest(JSON.stringify(roots));
let updating = false;
export async function refreshFiles() {
  if (updating)
    throw new SyncError(429, "A folder refresh is already running.");
  updating = true;
  try {
    const roots = await fileRoots(),
      files: IndexedFile[] = [],
      scans: RootScan[] = [];
    let bytes = 0,
      characters = 0,
      entries = 0;
    const started = Date.now();
    for (const root of roots) {
      const scan: RootScan = {
        rootId: root.id,
        label: root.label,
        kind: root.kind,
        indexed: 0,
        skipped: 0,
        issues: [],
        partial: false,
      };
      scans.push(scan);
      const issue = (message: string) => {
        scan.partial = true;
        if (scan.issues.length < 12) scan.issues.push(message);
      };
      async function walk(folder: string, depth: number) {
        if (
          depth > 8 ||
          entries >= 4000 ||
          files.length >= 200 ||
          bytes >= 8_000_000 ||
          characters >= 2_000_000 ||
          Date.now() - started > 45000
        ) {
          issue("Scan limit reached; results are partial.");
          return;
        }
        const dir = await fs.opendir(folder);
        for await (const entry of dir) {
          if (
            ++entries > 4000 ||
            files.length >= 200 ||
            Date.now() - started > 45000
          ) {
            issue("Scan limit reached; results are partial.");
            break;
          }
          const target = path.join(folder, entry.name),
            name = path.relative(root.path, target).split(path.sep).join("/");
          if (!permittedRelative(name) || entry.isSymbolicLink()) {
            scan.skipped++;
            continue;
          }
          try {
            if (entry.isDirectory()) {
              const stat = await fs.lstat(target),
                real = await fs.realpath(target);
              if (stat.isSymbolicLink() || !inside(root.path, real)) {
                scan.skipped++;
                continue;
              }
              await walk(target, depth + 1);
              continue;
            }
            const ext = path.extname(name).toLowerCase();
            if (
              !entry.isFile() ||
              !supported.has(ext) ||
              (root.kind === "obsidian" && ext !== ".md")
            ) {
              scan.skipped++;
              continue;
            }
            const identity = await fileIdentity(root, name);
            if (bytes + identity.stat.size > 8_000_000) {
              scan.skipped++;
              issue("Read budget reached; some files were omitted.");
              continue;
            }
            const read = await readSource(root, name);
            bytes += read.data.length;
            // One existing parser handles imports and connected files; JSON configs are never indexed.
            const extracted = await extractKnowledge(
              path.basename(name),
              read.data,
            );
            const textSize = extracted.documents.reduce(
              (n, d) => n + d.text.length,
              0,
            );
            if (
              extracted.documents.length > 100 ||
              characters + textSize > 2_000_000
            ) {
              scan.skipped++;
              issue("Text budget reached; some files were omitted.");
              continue;
            }
            characters += textSize;
            const id = digest(root.id + ":" + name).slice(0, 24);
            files.push({
              id,
              rootId: root.id,
              name,
              size: read.stat.size,
              modifiedAt: read.stat.mtime.toISOString(),
              hash: digest(read.data),
              documents: extracted.documents.map((d, i) => ({
                ...d,
                id: "file-" + id + "-" + i,
                source:
                  (root.kind === "obsidian" ? "Obsidian" : "Laptop") +
                  " · " +
                  root.label +
                  " / " +
                  name,
              })),
            });
            scan.indexed++;
            extracted.warnings.forEach((w) => issue(w));
          } catch {
            scan.skipped++;
            issue(
              "A file or subfolder was unreadable, changed, oversized or had no supported text (scanned PDFs need OCR).",
            );
          }
        }
      }
      try {
        await canonicalRoot(root);
        await walk(root.path, 0);
      } catch {
        issue(
          "This folder is unavailable. Its previous indexed text was removed from the refreshed index.",
        );
      }
    }
    if (configHash(await fileRoots()) !== configHash(roots))
      throw new SyncError(
        409,
        "Folder selection changed during refresh. Refresh again.",
      );
    await atomic("local-file-index.json", {
      version: 1,
      configHash: configHash(roots),
      scannedAt: new Date().toISOString(),
      scans,
      files,
    });
  } finally {
    updating = false;
  }
  return fileSnapshot();
}
export async function fileSnapshot(): Promise<{
  status: FileSearchStatus;
  files: IndexedFile[];
}> {
  const roots = await fileRoots(),
    saved = await index();
  const status: FileSearchStatus = {
    roots: roots.map(({ path: _path, ...r }) => r),
    scannedAt: saved?.scannedAt || null,
    scans: [],
    files: 0,
    stale: 0,
  };
  if (!saved) return { status, files: [] };
  if (saved.configHash !== configHash(roots)) {
    status.warning =
      "Folder selection changed. Refresh the index before searching connected files.";
    return { status, files: [] };
  }
  status.scans = saved.scans;
  const files: IndexedFile[] = [];
  for (const f of saved.files) {
    const root = roots.find((r) => r.id === f.rootId);
    try {
      if (!root) throw Error();
      const current = await readSource(root, f.name);
      if (
        current.stat.size !== f.size ||
        current.stat.mtime.toISOString() !== f.modifiedAt ||
        digest(current.data) !== f.hash
      )
        throw Error();
      files.push(f);
    } catch {
      status.stale++;
    }
  }
  if (configHash(await fileRoots()) !== configHash(roots))
    throw new SyncError(409, "Folder selection changed. Retry the search.");
  status.files = files.length;
  if (status.stale)
    status.warning =
      "Changed or unavailable files were withheld. Refresh to update the index.";
  return { status, files };
}
export async function connectedFileDocuments() {
  const snapshot = await fileSnapshot();
  const warnings = [
    snapshot.status.warning,
    ...snapshot.status.scans
      .filter((s) => s.partial)
      .map((s) => s.label + ": partial index. " + s.issues.join(" ")),
  ].filter(Boolean);
  return {
    documents: snapshot.files.flatMap((f) => f.documents),
    warning: warnings.join(" ") || undefined,
  };
}
export async function removeFileRoot(id: string) {
  if (updating)
    throw new SyncError(429, "Wait for the folder refresh to finish.");
  updating = true;
  try {
    const roots = await fileRoots();
    if (!roots.some((r) => r.id === id))
      throw new SyncError(404, "Folder not found.");
    await atomic("local-folders.json", {
      version: 1,
      roots: roots.filter((r) => r.id !== id),
    });
    // Discard the whole snapshot so removed content is not left in the connected-file index.
    await fs.rm(path.join(privateDir(), "local-file-index.json"), {
      force: true,
    });
  } finally {
    updating = false;
  }
  return fileSnapshot();
}
