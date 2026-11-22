import {
  authorized,
  sameOrigin,
  readBody,
  response,
  failure,
} from "@/lib/server/sync-store";
import {
  saveAssistantDraft,
  listAssistantDrafts,
  downloadAssistantDraft,
  previewAssistantDraft,
} from "@/lib/server/assistant-drafts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await authorized(request, true);
    const url = new URL(request.url),
      id = url.searchParams.get("id");
    if (id && url.searchParams.get("preview") === "1")
      return response({ draft: previewAssistantDraft(id) });
    if (id)
      return new Response(new Uint8Array(downloadAssistantDraft(id)), {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="nexus-draft-${id}.md"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    return response({
      drafts: listAssistantDrafts(url.searchParams.get("scope") || "Personal"),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    return response({
      draft: saveAssistantDraft(await readBody(request, 250000)),
    });
  } catch (error) {
    return failure(error);
  }
}
