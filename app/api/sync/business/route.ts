import { applyBusinessWorkflow } from "@/lib/business-workflow";
import { validBusiness } from "@/lib/business";
import {
  authorized,
  failure,
  readBody,
  response,
  sameOrigin,
  SyncError,
} from "@/lib/server/sync-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { loadBusiness, persistBusiness } from "@/lib/server/business-store";
let queue: Promise<unknown> = Promise.resolve();
export async function GET(request: Request) {
  try {
    await authorized(request, true);
    return response(await loadBusiness());
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    let incoming;
    let restoring = false;
    try {
      const raw = (await readBody(request)) as any;
      restoring = raw?.restoreUnverified === true;
      incoming = validBusiness(raw);
    } catch (error) {
      if (error instanceof SyncError) throw error;
      throw new SyncError(400, (error as Error).message);
    }
    const update = queue
      .catch(() => {})
      .then(async () => {
        const current = await loadBusiness();
        if (current.revision !== incoming.revision)
          return response(
            {
              error:
                "Business data changed on another device. Reload before editing again.",
            },
            409,
          );
        let clean;
        try {
          clean = applyBusinessWorkflow(
            current,
            incoming,
            new Date().toISOString(),
            restoring,
          );
        } catch (e) {
          throw new SyncError(400, (e as Error).message);
        }
        const next = {
          ...clean,
          revision: current.revision + 1,
          audit: [
            `${new Date().toISOString()} · ${restoring ? "Controller restored business data as unverified history" : "Controller saved operating records, exact-version acceptances or human review decisions"}. No messages, invoices or payments executed.`,
            ...current.audit,
          ].slice(0, 100),
        };
        await persistBusiness(next, restoring);
        return response(next);
      });
    queue = update.catch(() => {});
    return await update;
  } catch (error) {
    return failure(error);
  }
}
