import {
  authorized,
  sameOrigin,
  readBody,
  response,
  failure,
} from "@/lib/server/sync-store";
import { browseSelectedFolders } from "@/lib/server/folder-browser";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    return response(await browseSelectedFolders(await readBody(request, 5000)));
  } catch (error) {
    return failure(error);
  }
}
