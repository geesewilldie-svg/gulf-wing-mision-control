import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createWorkspace, parseWorkspace, type Workspace } from "../workspace";

export const COOKIE = "gw_sync_session";
type Role = "controller" | "display";
type Config = { version: 1; pairingHash: string; signingSecret: string };
export type Snapshot = { revision: number; workspace: Workspace };
export class SyncError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const root = () =>
  path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
  );
export async function config(): Promise<Config | null> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(root(), "sync-config.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new SyncError(
      503,
      "The laptop sync configuration could not be read.",
    );
  }
  const value = JSON.parse(raw);
  if (
    value.version !== 1 ||
    typeof value.pairingHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.pairingHash) ||
    typeof value.signingSecret !== "string" ||
    value.signingSecret.length < 40
  )
    throw new SyncError(503, "The laptop sync configuration is invalid.");
  return value;
}
function equal(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function checkCode(code: string, settings: Config) {
  return equal(
    createHash("sha256").update(code).digest("hex"),
    settings.pairingHash,
  );
}
export function token(settings: Config, role: Role) {
  const payload = Buffer.from(
    JSON.stringify({
      role,
      expires: Date.now() + 24 * 60 * 60 * 1000,
      nonce: randomBytes(12).toString("hex"),
    }),
  ).toString("base64url");
  return (
    payload +
    "." +
    createHmac("sha256", settings.signingSecret)
      .update(payload)
      .digest("base64url")
  );
}
export function session(
  request: Request,
  settings: Config,
): { role: Role; expires: number } | null {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  if (!cookie || cookie.length > 1000) return null;
  try {
    const [payload, sig, ...rest] = cookie.split(".");
    if (
      rest.length ||
      !sig ||
      !equal(
        sig,
        createHmac("sha256", settings.signingSecret)
          .update(payload)
          .digest("base64url"),
      )
    )
      return null;
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (
      !["controller", "display"].includes(decoded.role) ||
      !Number.isFinite(decoded.expires) ||
      decoded.expires < Date.now()
    )
      return null;
    return decoded;
  } catch {
    return null;
  }
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new SyncError(403, "Open the app directly on your laptop’s address.");
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.get("host"))
        throw new Error();
    } catch {
      throw new SyncError(403, "Cross-site sync requests are not allowed.");
    }
  }
}
export async function authorized(request: Request, write = false) {
  const settings = await config();
  if (!settings)
    throw new SyncError(
      503,
      "Sync is not configured on this laptop. Run npm run sync:setup on the host.",
    );
  const identity = session(request, settings);
  if (!identity) throw new SyncError(401, "Pair this device to continue.");
  if (write && identity.role !== "controller")
    throw new SyncError(403, "This device is paired for display only.");
  return identity;
}
export async function readBody(
  request: Request,
  limit = 2_000_000,
): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new SyncError(400, "Missing request body.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new SyncError(413, "The workspace is too large.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new SyncError(400, "Invalid JSON request.");
  }
}
const globalStore = globalThis as typeof globalThis & {
  gwSyncQueue?: Promise<unknown>;
  gwPairAttempts?: { start: number; count: number };
};
export function limitPairing() {
  const now = Date.now();
  let attempts = globalStore.gwPairAttempts;
  if (!attempts || now - attempts.start > 60_000)
    attempts = globalStore.gwPairAttempts = { start: now, count: 0 };
  if (++attempts.count > 30)
    throw new SyncError(
      429,
      "Too many pairing attempts. Wait a minute and try again.",
    );
}
async function locked<T>(action: () => Promise<T>): Promise<T> {
  const next = (globalStore.gwSyncQueue ?? Promise.resolve())
    .catch(() => {})
    .then(action);
  globalStore.gwSyncQueue = next.catch(() => {});
  return next;
}
async function load(): Promise<Snapshot> {
  try {
    const stored = JSON.parse(
      await fs.readFile(path.join(root(), "workspace.json"), "utf8"),
    );
    if (!Number.isSafeInteger(stored.revision) || stored.revision < 0)
      throw new Error();
    return {
      revision: stored.revision,
      workspace: parseWorkspace(JSON.stringify(stored.workspace)),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { revision: 0, workspace: createWorkspace() };
    throw new SyncError(
      503,
      "Shared storage could not be read. Existing data has been preserved.",
    );
  }
}
export const readSnapshot = () => locked(load);
export function updateSnapshot(revision: number, workspace: Workspace) {
  return locked(async () => {
    const current = await load();
    if (current.revision !== revision)
      return { conflict: true as const, snapshot: current };
    const next = { revision: current.revision + 1, workspace };
    await fs.mkdir(root(), { recursive: true, mode: 0o700 });
    const file = path.join(
      root(),
      `workspace.${randomBytes(8).toString("hex")}.tmp`,
    );
    try {
      await fs.writeFile(file, JSON.stringify(next), {
        mode: 0o600,
        flag: "wx",
      });
      await fs.rename(file, path.join(root(), "workspace.json"));
    } catch {
      await fs.rm(file, { force: true }).catch(() => {});
      throw new SyncError(
        503,
        "The laptop could not save the shared workspace.",
      );
    }
    return { conflict: false as const, snapshot: next };
  });
}
export function response(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
export function failure(error: unknown) {
  return response(
    {
      error:
        error instanceof SyncError
          ? error.message
          : "The sync service is temporarily unavailable.",
    },
    error instanceof SyncError ? error.status : 503,
  );
}
