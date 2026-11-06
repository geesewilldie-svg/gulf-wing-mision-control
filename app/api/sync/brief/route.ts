import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { validBriefSettings } from "@/lib/daily-brief";
import { loadBriefSettings, briefFile } from "@/lib/server/brief-store";
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
let queue: Promise<unknown> = Promise.resolve();
export async function GET(request: Request) {
  try {
    await authorized(request, true);
    return response(await loadBriefSettings());
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    let incoming;
    try {
      incoming = validBriefSettings(await readBody(request));
    } catch (e) {
      if (e instanceof SyncError) throw e;
      throw new SyncError(400, (e as Error).message);
    }
    const update = queue
      .catch(() => {})
      .then(async () => {
        const current = await loadBriefSettings();
        if (incoming.revision !== current.revision)
          throw new SyncError(
            409,
            "Daily brief settings changed on another device. Reload records before saving again.",
          );
        const next = { ...incoming, revision: current.revision + 1 };
        const target = briefFile(),
          temp = target + "." + randomBytes(8).toString("hex") + ".tmp";
        await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        try {
          await fs.writeFile(temp, JSON.stringify(next), {
            mode: 0o600,
            flag: "wx",
          });
          await fs.rename(temp, target);
        } finally {
          await fs.rm(temp, { force: true });
        }
        return response(next);
      });
    queue = update.catch(() => {});
    return await update;
  } catch (e) {
    return failure(e);
  }
}
