import { inspectHubModel } from "@/lib/server/hub-model";
import {
  authorized,
  sameOrigin,
  readBody,
  response,
  failure,
  SyncError,
} from "@/lib/server/sync-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    const body = (await readBody(request, 1000)) as any;
    if (
      !body ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => !["repository", "revision"].includes(key))
    )
      throw new SyncError(
        400,
        "Only a public repository ID and optional commit revision are accepted.",
      );
    return response(
      await inspectHubModel(body.repository, body.revision, request.signal),
    );
  } catch (error) {
    return failure(error);
  }
}
