import { authorized, failure, response } from "@/lib/server/sync-store";
import { providerStatus, events } from "@/lib/server/agent-router";
import { workerActivity } from "@/lib/server/foundation/store";
import { codexWorkerEnabled } from "@/lib/server/foundation/codex-worker";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await authorized(request, true);
    return response({
      providers: await providerStatus(),
      events: [...events(), ...workerActivity()]
        .sort((a, b) => b.started - a.started)
        .slice(0, 40),
      workers: [
        {
          id: "codex-worker",
          name: "Codex workshop",
          configured: await codexWorkerEnabled(),
        },
      ],
      obsidian: Boolean(process.env.GW_NEXUS_OBSIDIAN_VAULT?.trim()),
    });
  } catch (e) {
    return failure(e);
  }
}
