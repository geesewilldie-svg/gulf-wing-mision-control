import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

const filename = "storage-browse.json";
export const directoryIdentity = (stat) =>
  `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
/** @returns {Promise<Array<{id:string,label:string,path:string,type:"drive"|"folder",identity:string}>>} */
export async function readBrowseGrants(dir) {
  const file = path.join(dir, filename);
  let handle;
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 30000)
      throw Error("Invalid browse settings.");
    handle = await fs.open(file, "r");
    const opened = await handle.stat();
    if (
      opened.size > 30000 ||
      directoryIdentity(opened) !== directoryIdentity(stat)
    )
      throw Error("Browse settings changed.");
    const buffer = Buffer.alloc(30001);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 30000) throw Error("Invalid browse settings.");
    const value = JSON.parse(buffer.subarray(0, bytesRead).toString("utf8"));
    if (
      value.version !== 1 ||
      !Array.isArray(value.grants) ||
      value.grants.length > 12
    )
      throw Error("Invalid browse settings.");
    const seen = new Set();
    return value.grants.map((g) => {
      if (
        !g ||
        !/^[a-f0-9]{24}$/.test(g.id) ||
        seen.has(g.id) ||
        typeof g.label !== "string" ||
        !g.label.trim() ||
        g.label.length > 60 ||
        /[\x00-\x1f\x7f]/.test(g.label) ||
        typeof g.path !== "string" ||
        g.path.length > 1000 ||
        !path.isAbsolute(g.path) ||
        /[\x00-\x1f\x7f]/.test(g.path) ||
        !["drive", "folder"].includes(g.type) ||
        typeof g.identity !== "string" ||
        !/^\d+:\d+:-?\d+(?:\.\d+)?$/.test(g.identity)
      )
        throw Error("Invalid browse settings.");
      seen.add(g.id);
      return {
        id: g.id,
        label: g.label,
        path: g.path,
        type: g.type,
        identity: g.identity,
      };
    });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  } finally {
    await handle?.close();
  }
}
async function update(dir, change) {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const lockPath = path.join(dir, "storage-browse.lock");
  const lock = await fs.open(lockPath, "wx", 0o600);
  const temp = path.join(
    dir,
    filename + "." + randomBytes(8).toString("hex") + ".tmp",
  );
  try {
    const grants = await change(await readBrowseGrants(dir));
    await fs.writeFile(temp, JSON.stringify({ version: 1, grants }), {
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temp, path.join(dir, filename));
    return grants;
  } finally {
    await fs.rm(temp, { force: true });
    await lock.close();
    await fs.rm(lockPath, { force: true });
  }
}
export async function addBrowseGrant(dir, candidate) {
  if (
    !candidate ||
    typeof candidate.path !== "string" ||
    !path.isAbsolute(candidate.path) ||
    candidate.path.length > 1000 ||
    /[\x00-\x1f\x7f]/.test(candidate.path) ||
    typeof candidate.label !== "string" ||
    !candidate.label.trim() ||
    candidate.label.length > 60 ||
    /[\x00-\x1f\x7f]/.test(candidate.label) ||
    !["drive", "folder"].includes(candidate.type)
  )
    throw Error("Invalid storage choice.");
  const target = path.resolve(candidate.path);
  const stat = await fs.lstat(target),
    real = await fs.realpath(target);
  const equal = (a, b) =>
    process.platform === "win32"
      ? a.toLowerCase() === b.toLowerCase()
      : a === b;
  if (!stat.isDirectory() || stat.isSymbolicLink() || !equal(real, target))
    throw Error(
      "Choose an available ordinary directory, not a redirected link.",
    );
  return update(dir, async (grants) => {
    if (grants.some((g) => equal(g.path, real)))
      throw Error("This location is already selected for browsing.");
    if (grants.length >= 12)
      throw Error("Remove a browse location before adding another (limit 12).");
    const current = await fs.lstat(target);
    if (
      directoryIdentity(current) !== directoryIdentity(stat) ||
      current.isSymbolicLink() ||
      !equal(await fs.realpath(target), real)
    )
      throw Error("Storage location changed.");
    return [
      ...grants,
      {
        id: randomBytes(12).toString("hex"),
        label: candidate.label,
        path: real,
        type: candidate.type,
        identity: directoryIdentity(stat),
      },
    ];
  });
}
export async function removeBrowseGrant(dir, id) {
  if (typeof id !== "string" || !/^[a-f0-9]{24}$/.test(id))
    throw Error("Choose an existing browse location.");
  return update(dir, async (grants) => {
    if (!grants.some((g) => g.id === id))
      throw Error("Browse location no longer exists.");
    return grants.filter((g) => g.id !== id);
  });
}
