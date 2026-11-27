import { analyzeLocalFrame } from "@/lib/server/local-frame-analysis";
import {
  authorized,
  failure,
  response,
  sameOrigin,
  readBody,
} from "@/lib/server/sync-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    return response(
      await analyzeLocalFrame(await readBody(request, 710000), request.signal),
    );
  } catch (error) {
    return failure(error);
  }
}
