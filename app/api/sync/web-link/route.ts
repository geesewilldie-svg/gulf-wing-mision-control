import {
  authorized,
  sameOrigin,
  readBody,
  response,
  failure,
} from "@/lib/server/sync-store";
import { openReviewedWebLink } from "@/lib/server/web-link";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    return response(
      await openReviewedWebLink(await readBody(request, 5000), request.signal),
    );
  } catch (error) {
    return failure(error);
  }
}
