import { sourceMap } from "@/lib/source-map";
import { readIndexedFile } from "@/lib/server/read-indexed-file";
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
      hash?: string;
      part?: number;
      offset?: number;
    };
    if (!body || typeof body !== "object")
      throw new SyncError(400, "Choose a supported folder operation.");
    if (body.action === "refresh")
      return response((await refreshFiles()).status);
    if (body.action === "remove" && typeof body.id === "string")
      return response((await removeFileRoot(body.id)).status);
    const snapshot = await fileSnapshot();
    if (body.action === "map") {
      if (
        (body.query !== undefined &&
          (typeof body.query !== "string" || body.query.length > 200)) ||
        !Number.isSafeInteger(body.offset ?? 0) ||
        (body.offset ?? 0) < 0 ||
        (body.offset ?? 0) > 160
      )
        throw new SyncError(400, "Choose a valid indexed-name query and page.");
      return response({
        map: sourceMap(snapshot.status, snapshot.files, {
          query: body.query,
          offset: body.offset,
        }),
        warnings: [
          snapshot.status.warning,
          ...snapshot.status.scans
            .filter((scan) => scan.partial)
            .map(
              (scan) =>
                `${scan.label}: partial index. ${scan.issues.join(" ")}`,
            ),
        ].filter(Boolean),
      });
    }
    if (body.action === "read-indexed") {
      if (
        typeof body.id !== "string" ||
        !/^[a-f0-9]{24}$/i.test(body.id) ||
        typeof body.hash !== "string" ||
        !/^[a-f0-9]{64}$/i.test(body.hash)
      )
        throw new SyncError(400, "Select a current indexed file.");
      return response(
        readIndexedFile(
          {
            kind: "read",
            target: `${body.id}@${body.hash}`,
            part: body.part ?? 1,
          },
          snapshot.files,
          [snapshot.status.warning].filter((value): value is string =>
            Boolean(value),
          ),
        ),
      );
    }
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
