import { authorized, failure, response } from "@/lib/server/sync-store";
import { providerStatus, events } from "@/lib/server/agent-router";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await authorized(request, true);
    return response({
      providers: await providerStatus(),
      events: events(),
      obsidian: Boolean(process.env.GW_NEXUS_OBSIDIAN_VAULT?.trim()),
    });
  } catch (e) {
    return failure(e);
  }
}
