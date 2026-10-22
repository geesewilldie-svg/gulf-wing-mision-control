import {
  authorized,
  failure,
  response,
  sameOrigin,
  SyncError,
} from "@/lib/server/sync-store";
import { readKnowledge, mergeKnowledge } from "@/lib/server/nexus-store";
import { extractKnowledge } from "@/lib/server/knowledge-import";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let importing = false;
export async function GET(request: Request) {
  try {
    await authorized(request, true);
    return response(await readKnowledge());
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  let ownsSlot = false;
  try {
    sameOrigin(request);
    await authorized(request, true);
    if (importing)
      throw new SyncError(
        429,
        "Another knowledge import is running. Try again when it finishes.",
      );
    importing = ownsSlot = true;
    const reader = request.body?.getReader();
    if (!reader) throw new SyncError(400, "Choose files to import.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8_100_000) {
        await reader.cancel();
        throw new SyncError(413, "Keep an import below 8 MB total.");
      }
      chunks.push(value);
    }
    const type = request.headers.get("content-type") || "";
    if (!type.startsWith("multipart/form-data;"))
      throw new SyncError(400, "Upload files using the knowledge importer.");
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": type },
    }).formData();
    const files = form.getAll("files");
    if (
      !files.length ||
      files.length > 10 ||
      files.some((f) => typeof f === "string")
    )
      throw new SyncError(400, "Choose 1–10 files.");
    const docs = [];
    const prefixes: string[] = [];
    const warnings: string[] = [];
    const names = new Set<string>();
    for (const entry of files) {
      const file = entry as File;
      if (names.has(file.name))
        throw new SyncError(
          400,
          "Each file in an import must have a different name.",
        );
      names.add(file.name);
      try {
        const extracted = await extractKnowledge(
          file.name,
          Buffer.from(await file.arrayBuffer()),
        );
        docs.push(...extracted.documents);
        prefixes.push(extracted.prefix);
        warnings.push(...extracted.warnings);
      } catch (error) {
        throw new SyncError(400, file.name + ": " + (error as Error).message);
      }
    }
    const result = await mergeKnowledge(docs, prefixes);
    return response({ ...result, warnings: [...new Set(warnings)] });
  } catch (error) {
    if (error instanceof SyncError) return failure(error);
    return response(
      {
        error:
          "Import failed. Existing knowledge was preserved. Check the file format and try a smaller file.",
      },
      400,
    );
  } finally {
    if (ownsSlot) importing = false;
  }
}
