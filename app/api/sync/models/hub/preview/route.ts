import { previewHubAcquisition } from "@/lib/server/hub-acquisition";
import {
  authorized,
  sameOrigin,
  readBody,
  response,
  failure,
} from "@/lib/server/sync-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    return response(
      await previewHubAcquisition(
        await readBody(request, 2000),
        request.signal,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
