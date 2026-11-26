import { inspectReaProtocol } from "@/lib/server/rea-protocol";
import { inspectReaReadiness } from "@/lib/server/rea-readiness";
import { inspectLocalModels } from "@/lib/server/local-model-catalog";
import {
  authorized,
  failure,
  response,
  sameOrigin,
  readBody,
  SyncError,
} from "@/lib/server/sync-store";
import { providerStatus, events } from "@/lib/server/agent-router";
import { workerActivity } from "@/lib/server/foundation/store";
import { codexWorkerEnabled } from "@/lib/server/foundation/codex-worker";
import { fileRoots } from "@/lib/server/local-files";
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
      obsidian: (await fileRoots()).some((root) => root.kind === "obsidian"),
    });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    const body = (await readBody(request, 1000)) as any;
    if (
      !body ||
      !["local-model-catalog", "rea-preflight", "rea-protocol-check"].includes(
        body.action,
      ) ||
      Object.keys(body).some((key) => key !== "action")
    )
      throw new SyncError(400, "Choose a supported metadata inspection.");
    if (body.action === "rea-protocol-check")
      return response(await inspectReaProtocol(request.signal));
    return response(
      body.action === "rea-preflight"
        ? await inspectReaReadiness()
        : await inspectLocalModels(request.signal),
    );
  } catch (error) {
    return failure(error);
  }
}
