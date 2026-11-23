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
async function grantDetails(dir, allowDisabled = false) {
  const grant = await json(path.join(dir, "memory-vault.json"));
  if (
    grant.version !== 1 ||
    (grant.enabled !== undefined && typeof grant.enabled !== "boolean") ||
    typeof grant.canonical !== "string" ||
    typeof grant.target !== "string"
  )
    throw Error("Invalid vault settings.");
  const root = (await selectedVaults(dir)).find((r) => r.id === grant.rootId);
  if (
    !root ||
    (await ordinary(root.path)) !== grant.canonical ||
    grant.target !== path.join(grant.canonical, "Nexus Memory Snapshots") ||
    (await ordinary(grant.target)) !== grant.target
  )
    throw Error("Vault setup changed or is unavailable.");
  if (!allowDisabled && grant.enabled === false)
    throw Error("Vault saves are disabled.");
  return { grant, root };
}
function journalSince(grant) {
  const journal = grant.workJournal;
  return journal?.enabled === true &&
    typeof journal.since === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(journal.since) &&
    Number.isFinite(Date.parse(journal.since))
    ? journal.since
    : null;
}
export async function workJournalGrant(dir) {
  const { grant } = await grantDetails(dir);
  return journalSince(grant);
}
export async function enableWorkJournal(dir) {
  const { grant } = await grantDetails(dir);
  const since = journalSince(grant) || new Date().toISOString();
  await replaceGrant(dir, { ...grant, workJournal: { enabled: true, since } });
  return since;
}
export async function disableWorkJournal(dir) {
  const grant = await json(path.join(dir, "memory-vault.json"));
  if (grant.version !== 1) throw Error("Invalid vault settings.");
  await replaceGrant(dir, {
    ...grant,
    workJournal: { ...grant.workJournal, enabled: false },
  });
  return { state: "disabled" };
}
async function replaceGrant(dir, grant) {
  const temporary = path.join(dir, `memory-vault-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, JSON.stringify(grant), {
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temporary, path.join(dir, "memory-vault.json"));
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
export async function memoryVaultStatus(dir) {
  try {
    // Distinguish missing setup from an unavailable configured vault.
    await fs.lstat(path.join(dir, "memory-vault.json"));
  } catch (error) {
    return {
      state: error.code === "ENOENT" ? "not-configured" : "unavailable",
    };
  }
  try {
    const saved = await json(path.join(dir, "memory-vault.json"));
    if (saved.version === 1 && saved.enabled === false)
      return { state: "disabled" };
    const { grant, root } = await grantDetails(dir, true);
    const label =
      typeof root.label === "string" && root.label.length <= 60
        ? root.label
        : "Selected Obsidian vault";
    return {
      state: grant.enabled === false ? "disabled" : "ready",
      label,
      folder: "Nexus Memory Snapshots",
      workJournal: journalSince(grant) ? "enabled" : "disabled",
    };
  } catch {
    return { state: "unavailable" };
  }
}
export async function disableMemoryVault(dir) {
  // Disabling must work even when the selected drive has gone offline.
  const grant = await json(path.join(dir, "memory-vault.json"));
  if (grant.version !== 1) throw Error("Invalid vault settings.");
  await replaceGrant(dir, {
    ...grant,
    enabled: false,
    workJournal: { ...grant.workJournal, enabled: false },
  });
  return { state: "disabled" };
}
export async function prepareMemoryVault(dir, id) {
  const root = (await selectedVaults(dir)).find((r) => r.id === id);
  if (!root) throw Error("Select a configured Obsidian vault.");
  let exists = false;
  try {
    await fs.lstat(path.join(dir, "memory-vault.json"));
    exists = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (exists) {
    const { grant } = await grantDetails(dir, true);
    if (grant.rootId !== id)
      throw Error(
        "A different vault is already configured. Existing settings were preserved.",
      );
    if (grant.enabled === false)
      await replaceGrant(dir, { ...grant, enabled: true });
    return grant.target;
  }
  const canonical = await ordinary(root.path);
  const target = path.join(canonical, "Nexus Memory Snapshots");
  // An existing directory is never adopted as Nexus-owned.
  await fs.mkdir(target, { mode: 0o700 });
  const grant = { version: 1, rootId: id, canonical, target, enabled: true };
  await fs.writeFile(
    path.join(dir, "memory-vault.json"),
    JSON.stringify(grant),
    { flag: "wx", mode: 0o600 },
  );
  return target;
}
/** @param {string | null} automaticSince */
export async function writeMemorySnapshot(
  dir,
  markdown,
  workspace,
  automaticSince = null,
) {
  const { grant } = await grantDetails(dir);
  if (automaticSince !== null && journalSince(grant) !== automaticSince)
    throw Error("Automatic journal is disabled or changed.");
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
  const current = await grantDetails(dir);
  if (automaticSince !== null && journalSince(current.grant) !== automaticSince)
    throw Error("Automatic journal is disabled or changed.");
  if (
    current.grant.target !== grant.target ||
    current.grant.rootId !== grant.rootId
  )
    throw Error("Vault configuration changed during save.");
  await fs.rename(temporary, path.join(batch, name));
  return { filename: name, sha256: hash, bytes: actual.length };
}
