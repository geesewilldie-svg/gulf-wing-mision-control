import {
  authorized,
  failure,
  response,
  readBody,
  sameOrigin,
  SyncError,
} from "@/lib/server/sync-store";
import {
  fileSnapshot,
  refreshFiles,
  removeFileRoot,
} from "@/lib/server/local-files";
import { searchDocuments } from "@/lib/nexus";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await authorized(request, true);
    const { status } = await fileSnapshot();
    return response(status);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    const body = (await readBody(request, 4000)) as {
      action?: string;
      query?: string;
      id?: string;
    };
    if (!body || typeof body !== "object")
      throw new SyncError(400, "Choose a supported folder operation.");
    if (body.action === "refresh")
      return response((await refreshFiles()).status);
    if (body.action === "remove" && typeof body.id === "string")
      return response((await removeFileRoot(body.id)).status);
    const snapshot = await fileSnapshot();
    if (
      body.action === "search" &&
      typeof body.query === "string" &&
      body.query.trim() &&
      body.query.length <= 2000
    ) {
      const matches = searchDocuments(
        snapshot.files.flatMap((f) => f.documents),
        body.query,
      );
      return response({
        status: snapshot.status,
        matches: matches.map((d) => ({
          ...d,
          fileId: snapshot.files.find((f) =>
            f.documents.some((s) => s.id === d.id),
          )!.id,
        })),
      });
    }
    if (body.action === "preview" && typeof body.id === "string") {
      const file = snapshot.files.find((f) => f.id === body.id);
      if (!file)
        throw new SyncError(
          404,
          "File is unavailable or changed. Refresh the index.",
        );
      return response({
        id: file.id,
        name: file.name,
        modifiedAt: file.modifiedAt,
        scannedAt: snapshot.status.scannedAt,
        sections: file.documents.slice(0, 8),
        partial: file.documents.length > 8,
      });
    }
    throw new SyncError(
      400,
      "Choose a supported folder operation. Add folders only through Setup-Nexus-Folders.cmd on the laptop.",
    );
  } catch (e) {
    return failure(e);
  }
}
