import {
  authorized,
  sameOrigin,
  readBody,
  response,
  failure,
} from "@/lib/server/sync-store";
import {
  publicGeminiStatus,
  askPublicGemini,
  disablePublicGemini,
} from "@/lib/server/gemini-public";
import { trackAgent } from "@/lib/server/agent-router";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await authorized(request, true);
    return response(await publicGeminiStatus());
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    const body = await readBody(request, 10000);
    return response(
      await trackAgent(
        "gemini",
        () => askPublicGemini(body, request.signal),
        request.signal,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    return response(await disablePublicGemini());
  } catch (e) {
    return failure(e);
  }
}
