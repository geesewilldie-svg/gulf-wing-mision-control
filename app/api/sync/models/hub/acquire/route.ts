import { acquireHubArtifact } from "@/lib/server/hub-archive";
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
      await acquireHubArtifact(await readBody(request, 2000), request.signal),
    );
  } catch (error) {
    return failure(error);
  }
}
