import { authorized, response, failure } from "@/lib/server/sync-store";
import { codexWorkerStatus } from "@/lib/server/foundation/codex-worker";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await authorized(request, true);
    return response(await codexWorkerStatus(request.signal));
  } catch (e) {
    return failure(e);
  }
}
