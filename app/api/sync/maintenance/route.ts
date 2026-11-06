import {
  authorized,
  sameOrigin,
  readBody,
  response,
  failure,
} from "@/lib/server/sync-store";
import {
  maintenanceEnabled,
  parseMaintenanceAction,
  runMaintenance,
} from "@/lib/server/maintenance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await authorized(request, true);
    return response({
      enabled: await maintenanceEnabled(),
      supported: process.platform === "win32",
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    return response(
      await runMaintenance(parseMaintenanceAction(await readBody(request))),
    );
  } catch (e) {
    return failure(e);
  }
}
