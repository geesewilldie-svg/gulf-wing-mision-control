import {
  readHubArchive,
  verifyHubArchive,
} from "@/lib/server/hub-archive-history";
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
    if (body?.action === "list" && Object.keys(body).length === 1)
      return response(await readHubArchive(request.signal));
    if (
      body?.action === "verify" &&
      Object.keys(body).length === 2 &&
      Object.keys(body).every((key) => ["action", "slot"].includes(key))
    )
      return response(await verifyHubArchive(body.slot, request.signal));
    throw new SyncError(
      400,
      "Choose archive list or an explicit recorded-slot verification. Paths and transfer options are not accepted.",
    );
  } catch (error) {
    return failure(error);
  }
}
