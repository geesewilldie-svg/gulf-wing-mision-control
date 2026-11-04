import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { KnowledgeDocument } from "../nexus";
// Host-only path. Read Markdown, skip hidden entries and all symbolic links.
export async function obsidianDocuments(): Promise<{
  documents: KnowledgeDocument[];
  warning?: string;
}> {
  const configured = process.env.GW_NEXUS_OBSIDIAN_VAULT?.trim();
  if (!configured) return { documents: [] };
  const root = path.resolve(configured),
    documents: KnowledgeDocument[] = [];
  let canonicalRoot = root;
  let files = 0,
    bytes = 0,
    entries = 0,
    truncated = false;
  async function walk(folder: string, depth: number) {
    if (depth > 8) {
      truncated = true;
      return;
    }
    const dir = await fs.opendir(folder);
    for await (const e of dir) {
      if (++entries > 2000) {
        truncated = true;
        break;
      }
      if (e.name.startsWith(".") || e.isSymbolicLink()) continue;
      const target = path.join(folder, e.name);
      if (e.isDirectory()) {
        await walk(target, depth + 1);
        continue;
      }
      if (!e.isFile() || !e.name.toLowerCase().endsWith(".md")) continue;
      if (files >= 100 || bytes >= 2_000_000) {
        truncated = true;
        break;
      }
      // Refuse a swapped symlink and cap reads even if a note grows while opened.
      const expected = await fs.lstat(target),
        real = await fs.realpath(target);
      if (
        expected.isSymbolicLink() ||
        !expected.isFile() ||
        path.isAbsolute(path.relative(canonicalRoot, real)) ||
        path.relative(canonicalRoot, real) === ".." ||
        path.relative(canonicalRoot, real).startsWith(".." + path.sep)
      )
        continue;
      const file = await fs.open(target, "r");
      try {
        const stat = await file.stat(),
          again = await fs.lstat(target);
        if (
          !again.isFile() ||
          again.isSymbolicLink() ||
          stat.ino !== again.ino ||
          stat.dev !== again.dev ||
          stat.ino !== expected.ino ||
          stat.dev !== expected.dev
        )
          continue;
        if (stat.size > 100000 || bytes + stat.size > 2_000_000) {
          truncated = true;
          continue;
        }
        const buffer = Buffer.alloc(Math.min(stat.size, 100000));
        const read = await file.read(buffer, 0, buffer.length, 0);
        bytes += read.bytesRead;
        files++;
        const name = path.relative(root, target).replaceAll(path.sep, "/");
        if (name.length > 220) continue;
        const text = buffer.subarray(0, read.bytesRead).toString("utf8");
        const id = createHash("sha256").update(name).digest("hex").slice(0, 20);
        for (let offset = 0; offset < text.length; offset += 12000)
          if (text.slice(offset, offset + 12000).trim())
            documents.push({
              id: "obsidian-" + id + "-" + offset,
              source: "Obsidian · " + name,
              location:
                "Characters " +
                (offset + 1) +
                "–" +
                Math.min(offset + 12000, text.length),
              text: text.slice(offset, offset + 12000),
            });
      } finally {
        await file.close();
      }
    }
  }
  try {
    const stat = await fs.lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error();
    canonicalRoot = await fs.realpath(root);
    await walk(root, 0);
    return {
      documents,
      warning: truncated
        ? "Obsidian scan reached a safety limit (100 notes, 2 MB, depth 8 or 2,000 entries); results are partial."
        : undefined,
    };
  } catch {
    return {
      documents: [],
      warning:
        "Configured Obsidian vault could not be read. Imported snapshots and operating records remain available.",
    };
  }
}
