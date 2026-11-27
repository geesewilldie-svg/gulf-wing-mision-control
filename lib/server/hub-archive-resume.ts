import { acquireHubArtifact } from "./hub-archive";
import { archiveResumeSource } from "./hub-archive-history";
import { SyncError } from "./sync-store";
export async function resumeHubArtifact(value: any, signal: AbortSignal) {
  if (
    !value ||
    Array.isArray(value) ||
    Object.keys(value).length !== 6 ||
    Object.keys(value).some(
      (key) =>
        ![
          "action",
          "slot",
          "receiptSha256",
          "expectedLicense",
          "licenseReviewed",
          "archiveOnly",
        ].includes(key),
    ) ||
    value.action !== "resume" ||
    value.licenseReviewed !== true ||
    value.archiveOnly !== true ||
    typeof value.expectedLicense !== "string" ||
    !/^[A-Za-z0-9._-]{1,120}$/.test(value.expectedLicense)
  )
    throw new SyncError(
      400,
      "Select an inspected retained partial, review its license and choose archive-only resume. Paths, source URLs and transfer options are not accepted.",
    );
  try {
    const { record, prefix } = await archiveResumeSource(
      value.slot,
      value.receiptSha256,
      signal,
    );
    if (record.reportedLicense !== value.expectedLicense)
      throw new SyncError(
        409,
        "The recorded license changed. Inspect the source again.",
      );
    return await acquireHubArtifact(
      {
        repository: record.repository,
        revision: record.revision,
        filename: record.sourceFilename,
        expectedBytes: record.recordedBytes,
        expectedSha256: record.recordedSha256,
        expectedLicense: value.expectedLicense,
        licenseReviewed: true,
        archiveOnly: true,
      },
      signal,
      prefix,
    );
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError(
      signal.aborted ? 499 : 409,
      signal.aborted
        ? "Archive resume cancelled; the original retained partial was not changed."
        : "The retained partial or receipt could not be inspected safely. No resume result was accepted.",
    );
  }
}
