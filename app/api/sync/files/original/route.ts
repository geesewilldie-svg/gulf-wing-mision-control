import {
  authorized,
  sameOrigin,
  failure,
  SyncError,
} from "@/lib/server/sync-store";
import { readIndexedOriginal } from "@/lib/server/local-files";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    sameOrigin(request);
    const site = request.headers.get("sec-fetch-site");
    if (site && !["same-origin", "none"].includes(site))
      throw new SyncError(403, "Open originals from your paired Nexus page.");
    await authorized(request, true);
    const params = new URL(request.url).searchParams;
    const keys = [...params.keys()];
    if (
      keys.some((key) => !["id", "hash", "download"].includes(key)) ||
      new Set(keys).size !== keys.length ||
      (params.has("download") && params.get("download") !== "1")
    )
      throw new SyncError(
        400,
        "Choose a current file using Nexus's original-file controls.",
      );
    const id = params.get("id"),
      hash = params.get("hash");
    if (!id || !hash)
      throw new SyncError(400, "Select a current indexed file.");
    const file = await readIndexedOriginal(id, hash);
    const inline =
      [".pdf", ".md", ".txt"].includes(file.extension) &&
      !params.has("download");
    const types: Record<string, string> = {
      ".pdf": "application/pdf",
      ".md": "text/plain; charset=utf-8",
      ".txt": "text/plain; charset=utf-8",
      ".xlsx":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    const type = types[file.extension];
    if (!type)
      throw new SyncError(
        415,
        "Original viewing is not supported for this format.",
      );
    const filename = encodeURIComponent(file.name).replace(
      /[!'()*]/g,
      (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase(),
    );
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="nexus-original${file.extension}"; filename*=UTF-8''${filename}`,
        "Content-Length": String(file.data.length),
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy":
          "base-uri 'none'; frame-ancestors 'self'; form-action 'none'",
        "Accept-Ranges": "none",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
