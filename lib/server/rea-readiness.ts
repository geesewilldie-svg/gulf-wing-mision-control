import fs from "node:fs/promises";
import path from "node:path";
import {
  reaTarget,
  reaRuntimeCompatible,
  type ReaReadiness,
} from "../rea-readiness";
// Inspect only our fixed isolated tool location; never search global clients or
// execute a package, CLI, MCP server, browser or generation request.
export async function inspectReaReadiness(): Promise<ReaReadiness> {
  const root = path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
  );
  let packageState: ReaReadiness["packageState"] = "unavailable";
  let handle;
  try {
    let directory = root;
    const checked: {
      filename: string;
      ino: number;
      dev: number;
      birthtimeMs: number;
    }[] = [];
    for (const segment of ["", "tools", "rea", "node_modules", "rea-agents"]) {
      if (segment) directory = path.join(directory, segment);
      const stat = await fs.lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw Error("Unsafe tool directory");
      checked.push({
        filename: directory,
        ino: stat.ino,
        dev: stat.dev,
        birthtimeMs: stat.birthtimeMs,
      });
    }
    const filename = path.join(directory, "package.json"),
      before = await fs.lstat(filename);
    if (!before.isFile() || before.isSymbolicLink() || before.size > 64000)
      throw Error("Unsupported package metadata");
    handle = await fs.open(filename, "r");
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      opened.ino !== before.ino ||
      opened.dev !== before.dev ||
      opened.size > 64000
    )
      throw Error("Metadata changed");
    const bytes = Buffer.alloc(64001),
      read = await handle.read(bytes, 0, bytes.length, 0);
    if (read.bytesRead > 64000) throw Error("Metadata too large");
    const data = JSON.parse(bytes.subarray(0, read.bytesRead).toString("utf8"));
    for (const before of checked) {
      const after = await fs.lstat(before.filename);
      if (
        !after.isDirectory() ||
        after.isSymbolicLink() ||
        after.ino !== before.ino ||
        after.dev !== before.dev ||
        after.birthtimeMs !== before.birthtimeMs
      )
        throw Error("Tool directory changed");
    }
    packageState =
      data.name === reaTarget.package &&
      data.version === reaTarget.version &&
      data.engines?.node === reaTarget.engines
        ? "pinned-metadata"
        : "different-metadata";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      packageState = "missing";
  } finally {
    await handle?.close();
  }
  return {
    checkedAt: new Date().toISOString(),
    nodeVersion: process.version,
    runtimeCompatible: reaRuntimeCompatible(process.version),
    packageState,
    expected: reaTarget,
    adapterReady: false,
    notice:
      "Read-only prerequisite metadata. Package metadata is not integrity or execution verification. REA is not connected; target-scoped adapter execution remains unimplemented. No installation, CLI/MCP process, browser attachment, file scan or model request was started.",
  };
}
