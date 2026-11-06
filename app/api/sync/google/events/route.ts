import { authorized, response, failure } from "@/lib/server/sync-store";
import { googleEvents } from "@/lib/server/google-calendar";
import { loadBriefSettings } from "@/lib/server/brief-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await authorized(request, true);
    return response(await googleEvents(await loadBriefSettings(), new Date()));
  } catch (e) {
    return failure(e);
  }
}
