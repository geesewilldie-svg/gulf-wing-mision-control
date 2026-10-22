import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
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
import { loadBusiness } from "@/lib/server/business-store";
const file = () =>
  path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
    "business.json",
  );
let queue: Promise<unknown> = Promise.resolve();
export async function GET(request: Request) {
  try {
    await authorized(request);
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
    try {
      incoming = validBusiness(await readBody(request));
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
        const next = {
          ...incoming,
          revision: current.revision + 1,
          audit: [
            `${new Date().toISOString()} · Controller saved operating records / draft estimates / proposed marketing allocations. No external action.`,
            ...current.audit,
          ].slice(0, 100),
        };
        const target = file(),
          tmp = `${target}.${randomBytes(8).toString("hex")}.tmp`;
        await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        try {
          await fs.writeFile(tmp, JSON.stringify(next), {
            mode: 0o600,
            flag: "wx",
          });
          await fs.rename(tmp, target);
        } finally {
          await fs.rm(tmp, { force: true });
        }
        return response(next);
      });
    queue = update.catch(() => {});
    return await update;
  } catch (error) {
    return failure(error);
  }
}
