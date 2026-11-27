import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { RuntimeStorage } from "../runtime-storage";
import { localDetailModel } from "../local-model-details";
import { inspectLocalModels } from "./local-model-catalog";
import { boundedJSON } from "./agent-router";
import { archiveDirectoryGuard } from "./hub-archive";
import { SyncError } from "./sync-store";
export async function inspectRuntimeStorage(
  artifactBytes: number,
  signal: AbortSignal,
): Promise<RuntimeStorage> {
  if (
    !Number.isSafeInteger(artifactBytes) ||
    artifactBytes <= 0 ||
    artifactBytes > 4 * 1024 ** 3
  )
    throw new SyncError(400, "Choose a supported archived artifact.");
  const configured = process.env.OLLAMA_MODELS;
  const root = path.resolve(
    configured || path.join(os.homedir(), ".ollama", "models"),
  );
  const base: RuntimeStorage = {
    state: "unavailable",
    source: configured ? "server-environment" : "server-user-default",
    reportedModel: null,
    availableBytes: null,
    requiredBytes: artifactBytes * 2 + 1024 ** 3,
    capacity: "unknown",
    checkedAt: new Date().toISOString(),
    notice:
      "The runtime storage location could not be matched safely to this host. No directory scan, creation or runtime write was attempted.",
  };
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
  try {
    const before = await inspectLocalModels(bounded),
      selected = before.models.find(
        (item) => localDetailModel(item.name) && item.digest,
      );
    if (!selected) return base;
    const data = await boundedJSON(
      await fetch("http://127.0.0.1:11434/api/show", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selected.name, verbose: false }),
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: bounded,
      }),
      500000,
    );
    if (
      data?.remote_host ||
      data?.remote_model ||
      typeof data?.modelfile !== "string"
    )
      return base;
    const from = data.modelfile
      .split(/\r?\n/)
      .filter((line: string) => /^FROM\s+/i.test(line));
    if (from.length !== 1) return base;
    const raw = from[0].replace(/^FROM\s+/i, "").trim(),
      file = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    if (!path.isAbsolute(file) || /[\x00-\x1f\x7f]/.test(file)) return base;
    const blob = path.basename(file);
    if (!/^sha256-[a-f0-9]{64}$/.test(blob)) return base;
    const expected = path.join(root, "blobs", blob),
      canonical = (value: string) =>
        process.platform === "win32"
          ? path.resolve(value).toLowerCase()
          : path.resolve(value);
    if (canonical(file) !== canonical(expected)) return base;
    const blobs = path.join(root, "blobs"),
      guard = await archiveDirectoryGuard(blobs),
      stat = await fs.lstat(/* turbopackIgnore: true */ expected);
    if (!stat.isFile() || stat.isSymbolicLink()) return base;
    const volumes = await Promise.all(
      [root, blobs].map(async (dir) => {
        const space = await fs.statfs(/* turbopackIgnore: true */ dir, {
          bigint: true,
        });
        if (space.bavail < BigInt(0) || space.bsize <= BigInt(0))
          throw Error("Unknown capacity");
        const available = space.bavail * space.bsize;
        if (available > BigInt(Number.MAX_SAFE_INTEGER))
          throw Error("Unknown capacity");
        return Number(available);
      }),
    );
    const again = await inspectLocalModels(bounded),
      current = again.models.find((item) => item.name === selected.name),
      after = await fs.lstat(/* turbopackIgnore: true */ expected);
    if (
      !current ||
      current.digest !== selected.digest ||
      current.bytes !== selected.bytes ||
      current.modifiedAt !== selected.modifiedAt ||
      again.configuredModel !== before.configuredModel ||
      process.env.OLLAMA_MODELS !== configured ||
      after.isSymbolicLink() ||
      !after.isFile() ||
      after.ino !== stat.ino ||
      after.dev !== stat.dev ||
      after.birthtimeMs !== stat.birthtimeMs ||
      after.size !== stat.size ||
      after.mtimeMs !== stat.mtimeMs ||
      after.ctimeMs !== stat.ctimeMs
    )
      return base;
    await guard();
    bounded.throwIfAborted();
    const availableBytes = Math.min(...volumes);
    return {
      ...base,
      state: "observed",
      reportedModel: selected.name,
      availableBytes,
      capacity:
        availableBytes >= base.requiredBytes
          ? "enough-at-check"
          : "insufficient",
      checkedAt: new Date().toISOString(),
      notice:
        "Ollama's reported blob path matches the configured/default host model store and an existing regular file. Free space is the minimum observed at the store and blobs directory; it is not reserved. Paths and raw Modelfile text are withheld. Blob contents, runtime process identity and future writes were not verified. No import or generation was attempted.",
    };
  } catch {
    if (signal.aborted)
      throw new SyncError(499, "Runtime storage inspection cancelled.");
    return base;
  }
}
