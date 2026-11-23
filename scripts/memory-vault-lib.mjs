import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";

async function json(filename) {
  const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 20000)
    throw Error("Invalid local settings.");
  return JSON.parse(await fs.readFile(filename, "utf8"));
}
export async function selectedVaults(dir) {
  const config = await json(path.join(dir, "local-folders.json"));
  if (
    config.version !== 1 ||
    !Array.isArray(config.roots) ||
    config.roots.length > 4
  )
    throw Error("Invalid folder settings.");
  return config.roots.filter(
    (r) =>
      r.kind === "obsidian" &&
      /^[a-f0-9]{24}$/.test(r.id) &&
      typeof r.path === "string" &&
      path.isAbsolute(r.path),
  );
}
async function ordinary(folder) {
  const stat = await fs.lstat(folder);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw Error("Choose an ordinary folder, not a link or junction.");
  return fs.realpath(folder);
}
export async function prepareMemoryVault(dir, id) {
  const root = (await selectedVaults(dir)).find((r) => r.id === id);
  if (!root) throw Error("Select a configured Obsidian vault.");
  try {
    await fs.lstat(path.join(dir, "memory-vault.json"));
    throw Error(
      "Vault saving is already configured. Existing settings were preserved.",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const canonical = await ordinary(root.path);
  const target = path.join(canonical, "Nexus Memory Snapshots");
  // An existing directory is never adopted as Nexus-owned.
  await fs.mkdir(target, { mode: 0o700 });
  const grant = { version: 1, rootId: id, canonical, target };
  await fs.writeFile(
    path.join(dir, "memory-vault.json"),
    JSON.stringify(grant),
    { flag: "wx", mode: 0o600 },
  );
  return target;
}
export async function writeMemorySnapshot(dir, markdown, workspace) {
  const grant = await json(path.join(dir, "memory-vault.json"));
  const root = (await selectedVaults(dir)).find((r) => r.id === grant.rootId);
  if (
    grant.version !== 1 ||
    !root ||
    (await ordinary(root.path)) !== grant.canonical ||
    grant.target !== path.join(grant.canonical, "Nexus Memory Snapshots") ||
    (await ordinary(grant.target)) !== grant.target
  )
    throw Error("Vault setup changed or is unavailable. No note was saved.");
  if (
    typeof markdown !== "string" ||
    Buffer.byteLength(markdown, "utf8") > 1500000 ||
    !/^[a-z-]+$/.test(workspace)
  )
    throw Error("Invalid memory snapshot.");
  const name = `nexus-${workspace}-${randomUUID()}.md`;
  // Each save owns a fresh directory, so a partial write is never indexed as Markdown.
  const batch = path.join(grant.target, randomUUID());
  await fs.mkdir(batch, { mode: 0o700 });
  const temporary = path.join(batch, "snapshot.tmp");
  await fs.writeFile(temporary, markdown, { flag: "wx", mode: 0o600 });
  const actual = await fs.readFile(temporary);
  const hash = createHash("sha256").update(actual).digest("hex");
  if (hash !== createHash("sha256").update(markdown).digest("hex"))
    throw Error("Snapshot read-back failed.");
  await fs.rename(temporary, path.join(batch, name));
  return { filename: name, sha256: hash, bytes: actual.length };
}
