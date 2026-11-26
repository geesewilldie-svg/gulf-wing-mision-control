import {
  hubRepository,
  type HubArtifact,
  type HubModelMetadata,
} from "../hub-model";
import { boundedJSON } from "./agent-router";
import { SyncError } from "./sync-store";
let running = 0;
const sha = (value: unknown, length: number) =>
  typeof value === "string" &&
  new RegExp(`^[a-f0-9]{${length}}$`, "i").test(value)
    ? value.toLowerCase()
    : null;
const bytes = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
export async function inspectHubModel(
  repository: unknown,
  revision: unknown,
  signal: AbortSignal,
): Promise<HubModelMetadata> {
  const repo = hubRepository(repository);
  const requested =
    revision === undefined || revision === "" ? "main" : sha(revision, 40);
  if (!repo || !requested)
    throw new SyncError(
      400,
      "Enter a public owner/model repository ID and an optional full 40-character commit revision.",
    );
  if (running >= 2)
    throw new SyncError(
      429,
      "Two Hub metadata lookups are already active. Try again after they finish.",
    );
  running++;
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
  async function read(at: string) {
    timeout.throwIfAborted();
    const url = `https://huggingface.co/api/models/${repo!.split("/").map(encodeURIComponent).join("/")}/revision/${at}?blobs=true`;
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" },
      signal: timeout,
    });
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404
    )
      throw new SyncError(
        503,
        "Public model metadata is unavailable or requires access. No account token was used.",
      );
    const data = await boundedJSON(response, 2000000);
    if (
      !data ||
      typeof data.id !== "string" ||
      data.id.toLowerCase() !== repo!.toLowerCase() ||
      data.private === true ||
      !sha(data.sha, 40)
    )
      throw new SyncError(
        503,
        "Hub returned unsupported repository or revision metadata.",
      );
    return data;
  }
  try {
    let data = await read(requested);
    const commit = sha(data.sha, 40)!;
    if (requested === "main") data = await read(commit);
    if (
      sha(data.sha, 40) !== commit ||
      (requested !== "main" && commit !== requested)
    )
      throw new SyncError(
        503,
        "The returned model revision did not match the requested commit.",
      );
    timeout.throwIfAborted();
    if (!Array.isArray(data.siblings) || data.siblings.length > 2000)
      throw new SyncError(
        503,
        "Model artifact metadata exceeds the supported 2,000-file manifest limit or is incomplete.",
      );
    const artifacts: HubArtifact[] = [],
      seen = new Set<string>();
    let withheld = 0,
      knownBytes = 0,
      unknownSizes = 0,
      reportedHashes = 0;
    for (const file of data.siblings) {
      const name = file?.rfilename;
      if (
        typeof name !== "string" ||
        !name.length ||
        name.length > 240 ||
        /[\\\x00-\x1f\x7f]/.test(name) ||
        name.split("/").some((p) => !p || p === "." || p === "..") ||
        seen.has(name)
      ) {
        withheld++;
        continue;
      }
      seen.add(name);
      const size = bytes(file.size),
        lfsSize = bytes(file.lfs?.size);
      if (size !== null && lfsSize !== null && size !== lfsSize) {
        withheld++;
        continue;
      }
      const length = size ?? lfsSize,
        digest = sha(file.lfs?.sha256, 64);
      if (length === null) unknownSizes++;
      else {
        if (!Number.isSafeInteger(knownBytes + length))
          throw new SyncError(
            503,
            "Artifact size totals exceed the supported range.",
          );
        knownBytes += length;
      }
      if (digest) reportedHashes++;
      artifacts.push({
        filename: name,
        bytes: length,
        sha256: digest,
        gitBlobId: sha(file.blobId, 40),
      });
    }
    artifacts.sort((a, b) =>
      a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0,
    );
    const license =
      typeof data.cardData?.license === "string" &&
      /^[A-Za-z0-9._-]{1,120}$/.test(data.cardData.license)
        ? data.cardData.license
        : null;
    return {
      repository: repo,
      revision: commit,
      requestedRevision: requested,
      checkedAt: new Date().toISOString(),
      sourceUrl: `https://huggingface.co/${repo.split("/").map(encodeURIComponent).join("/")}/tree/${commit}`,
      license,
      access:
        data.gated === false
          ? "public"
          : data.gated === "auto"
            ? "gated-auto"
            : data.gated === "manual"
              ? "gated-manual"
              : "unknown",
      reportedArtifacts: data.siblings.length,
      validArtifacts: artifacts.length,
      withheldArtifacts: withheld,
      omittedArtifacts: Math.max(0, artifacts.length - 50),
      knownBytes,
      unknownSizeArtifacts: unknownSizes,
      totalBytes: unknownSizes || withheld ? null : knownBytes,
      sha256ReportedArtifacts: reportedHashes,
      artifacts: artifacts.slice(0, 50),
      downloaded: false,
      inferenceReady: false,
      notice:
        "Anonymous Hub metadata at the recorded commit. License, sizes and digests are reported, not independently verified. No model files were downloaded or executed, no account token was used, and no inference or hardware-fit check was performed.",
    };
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError(
      signal.aborted ? 499 : 503,
      signal.aborted
        ? "Hub metadata lookup cancelled."
        : "Hub metadata could not be read within its limits. No model download, credential use or inference was attempted.",
    );
  } finally {
    running--;
  }
}
