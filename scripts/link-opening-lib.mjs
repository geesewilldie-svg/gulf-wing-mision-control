import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
export async function configureLinkOpening(
  dir,
  enabled,
  platform = process.platform,
) {
  if (platform !== "win32")
    throw Error("Run this setup on the Windows laptop. No changes made.");
  if (typeof enabled !== "boolean") throw Error("Choose enable or disable.");
  const target = path.join(dir, "link-opening.json");
  let previous = { version: 1, enabled: false };
  try {
    previous = JSON.parse(await fs.readFile(target, "utf8"));
    if (previous.version !== 1 || typeof previous.enabled !== "boolean")
      throw Error(
        "Existing link settings are invalid; preserved without changes.",
      );
  } catch (error) {
    if (error.code !== "ENOENT")
      throw Error(
        "Existing link-opening settings cannot be read; preserved without changes.",
      );
  }
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const temporary = target + "." + randomUUID() + ".tmp";
  try {
    await fs.writeFile(temporary, JSON.stringify({ ...previous, enabled }), {
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
