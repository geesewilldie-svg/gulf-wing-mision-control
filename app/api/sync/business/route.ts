import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  emptyBusiness,
  validBusiness,
  type BusinessState,
} from "@/lib/business";
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
const file = () =>
  path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
    "business.json",
  );
let queue: Promise<unknown> = Promise.resolve();
async function load(): Promise<BusinessState> {
  try {
    const raw = JSON.parse(await fs.readFile(file(), "utf8"));
    const clean = validBusiness(raw);
    return {
      ...clean,
      audit: Array.isArray(raw.audit)
        ? raw.audit.filter((s: unknown) => typeof s === "string").slice(0, 100)
        : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return emptyBusiness();
    throw new SyncError(
      503,
      "Business storage could not be read. Existing data is preserved.",
    );
  }
}
export async function GET(request: Request) {
  try {
    await authorized(request);
    return response(await load());
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
        const current = await load();
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
