import {
  authorized,
  sameOrigin,
  readBody,
  response,
  failure,
  SyncError,
} from "@/lib/server/sync-store";
import {
  driveStatus,
  browseDrive,
  selectDriveFile,
  removeDriveFile,
  refreshDrive,
  searchDriveIndex,
} from "@/lib/server/google-drive";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await authorized(request, true);
    return response(await driveStatus());
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    const b = (await readBody(request, 4000)) as {
      action?: unknown;
      accountId?: unknown;
      fileId?: unknown;
      query?: unknown;
    };
    if (!b || typeof b !== "object")
      throw new SyncError(400, "Choose a supported Drive operation.");
    if (b.action === "refresh") return response(await refreshDrive());
    if (
      b.action === "browse" &&
      typeof b.accountId === "string" &&
      typeof b.query === "string"
    )
      return response(await browseDrive(b.accountId, b.query));
    if (
      b.action === "select" &&
      typeof b.accountId === "string" &&
      typeof b.fileId === "string"
    )
      return response(await selectDriveFile(b.accountId, b.fileId));
    if (
      b.action === "remove" &&
      typeof b.accountId === "string" &&
      typeof b.fileId === "string"
    )
      return response(await removeDriveFile(b.accountId, b.fileId));
    if (b.action === "search" && typeof b.query === "string")
      return response(await searchDriveIndex(b.query));
    throw new SyncError(
      400,
      "Choose a supported Drive operation. This connection cannot write, send or delete Google files.",
    );
  } catch (e) {
    return failure(e);
  }
}
