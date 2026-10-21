import {
  authorized,
  failure,
  readBody,
  readSnapshot,
  response,
  sameOrigin,
  SyncError,
  updateSnapshot,
} from "@/lib/server/sync-store";
import { parseWorkspace } from "@/lib/workspace";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await authorized(request);
    return response(await readSnapshot());
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    const body = (await readBody(request)) as {
      revision?: unknown;
      workspace?: unknown;
    };
    if (
      !body ||
      !Number.isSafeInteger(body.revision) ||
      (body.revision as number) < 0
    )
      throw new SyncError(400, "A valid workspace revision is required.");
    let workspace;
    try {
      workspace = parseWorkspace(JSON.stringify(body.workspace));
    } catch {
      throw new SyncError(400, "The workspace data is invalid.");
    }
    const result = await updateSnapshot(body.revision as number, workspace);
    return response(result.snapshot, result.conflict ? 409 : 200);
  } catch (error) {
    return failure(error);
  }
}
