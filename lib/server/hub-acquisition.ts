import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { inspectHubModel } from "./hub-model";
import { hubRepository, type HubModelMetadata } from "../hub-model";
import {
  HUB_ARCHIVE_FILE_LIMIT,
  HUB_ARCHIVE_RESERVE,
  type HubAcquisitionPreview,
} from "../hub-acquisition";
import { SyncError } from "./sync-store";

// Resolve capacity on the future archive volume without creating directories or
// enumerating their contents. Unknown/unsafe paths stay unknown, never "enough".
export async function archiveAvailableBytes(
  signal: AbortSignal,
): Promise<number | null> {
  const target = path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
    "model-assets",
  );
  const parsed = path.parse(target),
    segments = target.slice(parsed.root.length).split(path.sep).filter(Boolean);
  if (segments.length > 64) return null;
  let current = parsed.root;
  const checked: {
    name: string;
    ino: number;
    dev: number;
    birthtimeMs: number;
  }[] = [];
  try {
    for (const segment of ["", ...segments]) {
      signal.throwIfAborted();
      const next = segment ? path.join(current, segment) : current;
      try {
        const stat = await fs.lstat(/* turbopackIgnore: true */ next);
        if (!stat.isDirectory() || stat.isSymbolicLink()) return null;
        current = next;
        checked.push({
          name: current,
          ino: stat.ino,
          dev: stat.dev,
          birthtimeMs: stat.birthtimeMs,
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
        throw error;
      }
    }
    if (!checked.length) return null;
    const stats = await fs.statfs(/* turbopackIgnore: true */ current, {
      bigint: true,
    });
    if (stats.bavail < BigInt(0) || stats.bsize <= BigInt(0)) return null;
    const available = stats.bavail * stats.bsize;
    for (const before of checked) {
      const after = await fs.lstat(/* turbopackIgnore: true */ before.name);
      if (
        !after.isDirectory() ||
        after.isSymbolicLink() ||
        after.ino !== before.ino ||
        after.dev !== before.dev ||
        after.birthtimeMs !== before.birthtimeMs
      )
        return null;
    }
    signal.throwIfAborted();
    return available >= BigInt(0) &&
      available <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(available)
      : null;
  } catch {
    signal.throwIfAborted();
    return null;
  }
}
export type AcquisitionSelection = {
  repository: string;
  revision: string;
  filename: string;
  expectedBytes: number | null;
  expectedSha256: string | null;
};
function validSelection(value: any): value is AcquisitionSelection {
  return (
    !!value &&
    !Array.isArray(value) &&
    Object.keys(value).length === 5 &&
    Object.keys(value).every((key) =>
      [
        "repository",
        "revision",
        "filename",
        "expectedBytes",
        "expectedSha256",
      ].includes(key),
    ) &&
    !!hubRepository(value.repository) &&
    typeof value.revision === "string" &&
    /^[a-f0-9]{40}$/.test(value.revision) &&
    typeof value.filename === "string" &&
    value.filename.length > 0 &&
    value.filename.length <= 240 &&
    !/[\\\x00-\x1f\x7f]/.test(value.filename) &&
    !value.filename
      .split("/")
      .some((p: string) => !p || p === "." || p === "..") &&
    (value.expectedBytes === null ||
      (Number.isSafeInteger(value.expectedBytes) &&
        value.expectedBytes >= 0)) &&
    (value.expectedSha256 === null ||
      (typeof value.expectedSha256 === "string" &&
        /^[a-f0-9]{64}$/.test(value.expectedSha256)))
  );
}
export function acquisitionChecks(
  metadata: HubModelMetadata,
  filename: string,
  availableBytes: number | null,
): HubAcquisitionPreview {
  const artifact = metadata.artifacts.find((a) => a.filename === filename);
  if (!artifact)
    throw new SyncError(
      409,
      "The selected artifact is not in the current bounded model metadata. Look up the model again.",
    );
  const requiredBytes =
    artifact.bytes !== null &&
    Number.isSafeInteger(artifact.bytes * 2 + HUB_ARCHIVE_RESERVE)
      ? artifact.bytes * 2 + HUB_ARCHIVE_RESERVE
      : null;
  const checks: HubAcquisitionPreview["checks"] = [
    {
      id: "access",
      label: "Anonymous public access",
      state: metadata.access === "public" ? "passed" : "blocked",
      detail:
        metadata.access === "public"
          ? "Hub reports an ungated public repository."
          : "Gated or unknown access needs a separate supported access workflow.",
    },
    {
      id: "format",
      label: "Single GGUF artifact",
      state:
        /\.gguf$/i.test(filename) && !/-\d{5}-of-\d{5}\.gguf$/i.test(filename)
          ? "passed"
          : "blocked",
      detail:
        "The first archive transfer profile is limited to one GGUF file. Split sets and other formats need separate acquisition support; this does not establish runtime compatibility.",
    },
    {
      id: "size",
      label: "Known bounded size",
      state:
        artifact.bytes !== null &&
        artifact.bytes > 0 &&
        artifact.bytes <= HUB_ARCHIVE_FILE_LIMIT
          ? "passed"
          : "blocked",
      detail:
        "The planned per-file archive limit is 4 GiB. Unknown, empty or larger files are not eligible for this profile.",
    },
    {
      id: "digest",
      label: "Reported SHA-256",
      state: artifact.sha256 ? "passed" : "blocked",
      detail:
        "A reported 64-character SHA-256 is required for later downloaded-byte verification. A Git blob ID does not satisfy this check.",
    },
    {
      id: "capacity",
      label: "Archive volume capacity",
      state:
        requiredBytes !== null &&
        availableBytes !== null &&
        availableBytes >= requiredBytes
          ? "passed"
          : "blocked",
      detail:
        "Requires twice the artifact bytes plus a 1 GiB reserve. This is a momentary volume check, not a space reservation or a write-permission test.",
    },
    {
      id: "license-metadata",
      label: "License metadata present",
      state: metadata.license ? "passed" : "blocked",
      detail: metadata.license
        ? `Hub reports ${metadata.license}. Terms still need review before acquisition.`
        : "No usable license identifier was reported.",
    },
    {
      id: "license-review",
      label: "License terms review",
      state: "review",
      detail:
        "Review this repository's actual license and any model-specific terms before downloading.",
    },
    {
      id: "runtime",
      label: "Runtime and hardware review",
      state: "review",
      detail:
        "The owner's 8 GB laptop has not been assessed for this artifact. Disk space and GGUF format do not prove Ollama import or inference readiness.",
    },
  ];
  return {
    version: 1,
    previewId: randomUUID(),
    checkedAt: new Date().toISOString(),
    repository: metadata.repository,
    revision: metadata.revision,
    artifact,
    license: metadata.license,
    sourceUrl: metadata.sourceUrl,
    destination: "Nexus private model archive",
    availableBytes,
    requiredBytes,
    fileLimitBytes: HUB_ARCHIVE_FILE_LIMIT,
    reserveBytes: HUB_ARCHIVE_RESERVE,
    checks,
    metadataAndCapacityReady: checks
      .filter((c) => c.state !== "review")
      .every((c) => c.state === "passed"),
    downloadImplemented: false,
    downloaded: false,
    inferenceReady: false,
    notice:
      "Acquisition preview only. Source metadata was re-read at the selected commit. No directory, reservation, model file, download job, runtime import or model selection was created. Capacity and source metadata must be checked again before a future transfer.",
  };
}
export async function previewHubAcquisition(
  selection: unknown,
  signal: AbortSignal,
): Promise<HubAcquisitionPreview> {
  if (!validSelection(selection))
    throw new SyncError(
      400,
      "Choose a displayed artifact with its exact repository, commit, filename, expected size and reported SHA-256. Custom paths and transfer options are not accepted.",
    );
  const metadata = await inspectHubModel(
    selection.repository,
    selection.revision,
    signal,
  );
  const artifact = metadata.artifacts.find(
    (a) => a.filename === selection.filename,
  );
  if (
    !artifact ||
    artifact.bytes !== selection.expectedBytes ||
    artifact.sha256 !== selection.expectedSha256
  )
    throw new SyncError(
      409,
      "The selected artifact metadata changed or is no longer available. Look up the repository and review it again.",
    );
  const capacity = await archiveAvailableBytes(signal);
  signal.throwIfAborted();
  return acquisitionChecks(metadata, selection.filename, capacity);
}
