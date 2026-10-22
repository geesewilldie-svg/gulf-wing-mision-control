import {
  readFile,
  writeFile,
  mkdir,
  rename,
  rm,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
const source = process.argv[2];
if (!source) {
  console.error(
    'Usage: npm run knowledge:import -- "path-to-pack.json-or-vault-folder"',
  );
  process.exit(1);
}
const docs = [];
async function walk(file) {
  let entries;
  try {
    entries = await readdir(file, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOTDIR") throw error;
  }
  if (entries) {
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      if (entry.isDirectory() || (entry.isFile() && entry.name.endsWith(".md")))
        await walk(path.join(file, entry.name));
    }
    return;
  }
  const raw = await readFile(file, "utf8");
  if (file.endsWith(".json")) docs.push(...JSON.parse(raw));
  else if (file.endsWith(".md") || file.endsWith(".txt")) {
    const name =
      path.relative(path.resolve(source), file) || path.basename(file);
    for (let offset = 0; offset < raw.length; offset += 12000)
      docs.push({
        id: `${name}:${offset}`,
        source: name,
        location: `Characters ${offset + 1}–${Math.min(offset + 12000, raw.length)}`,
        text: raw.slice(offset, offset + 12000),
      });
  } else
    throw new Error(
      "Use a JSON knowledge pack, Markdown/text file, or Obsidian vault folder.",
    );
}
await walk(path.resolve(source));
if (!docs.length || docs.length > 1000)
  throw new Error("Import must contain 1–1,000 sections.");
const ids = new Set();
for (const d of docs) {
  if (
    !d ||
    !["id", "source", "location", "text"].every(
      (k) => typeof d[k] === "string" && d[k].trim(),
    ) ||
    d.id.length > 200 ||
    d.source.length > 240 ||
    d.location.length > 240 ||
    d.text.length > 30000 ||
    ids.has(d.id)
  )
    throw new Error("Invalid or duplicate knowledge section.");
  ids.add(d.id);
}
const serialized = JSON.stringify(docs);
if (Buffer.byteLength(serialized) > 2000000)
  throw new Error("Pack exceeds 2 MB; split or curate the vault.");
const root = path.resolve(process.env.GW_SYNC_DATA_DIR || ".gulf-wing");
await mkdir(root, { recursive: true, mode: 0o700 });
const temporary = path.join(
  root,
  `knowledge.${randomBytes(8).toString("hex")}.tmp`,
);
try {
  await writeFile(temporary, serialized, { flag: "wx", mode: 0o600 });
  await rename(temporary, path.join(root, "knowledge.json"));
} finally {
  await rm(temporary, { force: true });
}
console.log(
  `Imported ${docs.length} private sections. Existing knowledge index was replaced. Source files were not changed.`,
);
