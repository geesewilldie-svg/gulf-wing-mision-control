import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
export async function addFolder(
  selected,
  kind,
  label,
  dataDir = process.env.GW_SYNC_DATA_DIR || path.resolve(".gulf-wing"),
) {
  if (
    !selected ||
    !path.isAbsolute(selected) ||
    !["folder", "obsidian"].includes(kind) ||
    typeof label !== "string" ||
    !label.trim() ||
    label.length > 60
  )
    throw Error("Choose a folder type and a short label.");
  const stat = await fs.lstat(selected),
    canonical = await fs.realpath(selected);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw Error("Choose an ordinary local folder, not a shortcut or junction.");
  const relative = path
    .relative(path.parse(canonical).root, canonical)
    .split(path.sep);
  if (
    canonical === path.parse(canonical).root ||
    canonical === (await fs.realpath(os.homedir())) ||
    relative.some(
      (s) =>
        s.startsWith(".") ||
        [
          "windows",
          "appdata",
          "program files",
          "program files (x86)",
          "node_modules",
        ].includes(s.toLowerCase()),
    )
  )
    throw Error(
      "Choose a specific business folder or Obsidian vault, not a drive, user profile, application or private configuration folder.",
    );
  const target = path.resolve(dataDir, "local-folders.json");
  let config;
  try {
    const stat = await fs.stat(target);
    if (stat.size > 20000) throw Error();
    config = JSON.parse(await fs.readFile(target, "utf8"));
    if (
      config.version !== 1 ||
      !Array.isArray(config.roots) ||
      config.roots.length > 4 ||
      new Set(config.roots.map((r) => r?.id)).size !== config.roots.length ||
      config.roots.some(
        (r) =>
          !r ||
          !/^[a-f0-9]{24}$/.test(r.id) ||
          !["folder", "obsidian"].includes(r.kind) ||
          typeof r.label !== "string" ||
          !r.label.trim() ||
          r.label.length > 60 ||
          typeof r.path !== "string" ||
          r.path.length > 1000 ||
          !path.isAbsolute(r.path),
      )
    )
      throw Error();
  } catch (e) {
    if (e.code !== "ENOENT")
      throw Error(
        "Existing folder configuration could not be read; it was preserved.",
      );
    config = { version: 1, roots: [] };
  }
  const equal = (a, b) =>
    process.platform === "win32"
      ? a.toLowerCase() === b.toLowerCase()
      : a === b;
  if (config.roots.some((r) => equal(r.path, canonical)))
    return "This folder is already selected. Refresh its index in Nexus.";
  if (config.roots.length >= 4)
    throw Error(
      "Up to four selected folders are supported. Remove one in Nexus first.",
    );
  config.roots.push({
    id: randomBytes(12).toString("hex"),
    kind,
    label: label.trim(),
    path: canonical,
  });
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temp = target + "." + randomBytes(8).toString("hex") + ".tmp";
  try {
    await fs.writeFile(temp, JSON.stringify(config), {
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temp, target);
  } finally {
    await fs.rm(temp, { force: true });
  }
  return "Folder selected for local read-only indexing. Open Nexus > Connections > Laptop files and Obsidian > Refresh file index. No restart is required.";
}
