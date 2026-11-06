import {
  authorized,
  sameOrigin,
  response,
  failure,
} from "@/lib/server/sync-store";
import { buildMorning, readMorning } from "@/lib/server/morning-brief";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await authorized(request, true);
    return response({ brief: await readMorning() });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    return response({ brief: await buildMorning() });
  } catch (e) {
    return failure(e);
  }
}
