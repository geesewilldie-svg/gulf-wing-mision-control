import {
  searchCurrentRecords,
  inspectCurrentRecord,
} from "@/lib/server/current-record-search";
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
    const body = (await readBody(request, 3000)) as any;
    if (body?.action === "search-current-records")
      return response(searchCurrentRecords(body, request.signal));
    if (body?.action === "inspect-current-record")
      return response(inspectCurrentRecord(body, request.signal));
    throw new SyncError(
      400,
      "Choose a supported current-record search operation.",
    );
  } catch (e) {
    return failure(e);
  }
}
