import {
  authorized,
  sameOrigin,
  failure,
  SyncError,
} from "@/lib/server/sync-store";
import { readBrowsedOriginal } from "@/lib/server/folder-browser";
import { fileResourceResponse } from "@/lib/server/file-resource-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    sameOrigin(request);
    const site = request.headers.get("sec-fetch-site");
    if (site && !["same-origin", "none"].includes(site))
      throw new SyncError(403, "Open originals from your paired Nexus page.");
    await authorized(request, true);
    const params = new URL(request.url).searchParams,
      keys = [...params.keys()];
    if (
      keys.some((key) => !["handle", "download"].includes(key)) ||
      new Set(keys).size !== keys.length ||
      (params.has("download") && params.get("download") !== "1")
    )
      throw new SyncError(
        400,
        "Use the folder navigator's original-file controls.",
      );
    const download = params.has("download");
    return fileResourceResponse(
      await readBrowsedOriginal(params.get("handle"), download),
      download,
    );
  } catch (error) {
    return failure(error);
  }
}
