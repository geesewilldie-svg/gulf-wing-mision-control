import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const MAX_BYTES = 16 * 1024;
const TYPES = new Set(["job.assigned", "job.submitted", "job.approved", "job.rework"]);
const safeId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(value);
class IntegrationError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
function fail(status: number, message: string): never { throw new IntegrationError(status, message); }
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export type GulfWingEvent = {
  version: 1; companyId: string; eventId: string; eventType: string; jobId: string; occurredAt: string;
};
type Options = { env?: NodeJS.ProcessEnv; now?: () => number; dataDir?: string };
function settings(env: NodeJS.ProcessEnv) {
  if (!env.GULF_WING_COMPANY_ID && !env.GULF_WING_INTEGRATION_KEY) return null;
  if (!safeId(env.GULF_WING_COMPANY_ID) || !/^[a-f0-9]{64}$/.test(env.GULF_WING_INTEGRATION_KEY || "")) fail(503, "Gulf Wing integration configuration is invalid");
  return {companyId: env.GULF_WING_COMPANY_ID, key: Buffer.from(env.GULF_WING_INTEGRATION_KEY!, "hex")};
}
function database(dataDir: string) {
  mkdirSync(dataDir, {recursive: true, mode: 0o700});
  const filename = path.join(dataDir, "gulf-wing-integration.sqlite");
  const db = new DatabaseSync(filename);
  chmodSync(filename, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS gulf_wing_events (
      company_id TEXT NOT NULL, event_id TEXT NOT NULL, digest TEXT NOT NULL,
      payload TEXT NOT NULL, received_at TEXT NOT NULL,
      PRIMARY KEY (company_id,event_id)
    );`);
  return db;
}
async function rawBody(request: Request): Promise<Buffer> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) fail(413, "Integration request is too large");
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader.cancel().catch(() => {}); reject(new IntegrationError(408, "Integration request timed out")); }, 10000); });
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const chunk = await Promise.race([reader.read(), timeout]);
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BYTES) { void reader.cancel().catch(() => {}); fail(413, "Integration request is too large"); }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks);
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
function exact(value: unknown, fields: string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...fields].sort().join(",");
}
export function createGulfWingReceiver({env = process.env, now = Date.now, dataDir}: Options = {}) {
  const directory = dataDir || env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing");
  async function handle(request: Request, action: "handshake" | "events") {
    try {
      const config = settings(env);
      if (!config) fail(503, "Gulf Wing integration is not configured");
      if (request.method !== "POST") fail(405, "POST required");
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) fail(415, "JSON content type required");
      // Browser/Controller credentials never authorize machine delivery.
      if (request.headers.has("origin")) fail(403, "Server-to-server requests required");
      const raw = await rawBody(request);
      const timestamp = request.headers.get("x-gw-timestamp") || "", signature = request.headers.get("x-gw-signature") || "";
      if (!/^\d{1,12}$/.test(timestamp) || Math.abs(now()/1000 - Number(timestamp)) > 300 || !/^[a-f0-9]{64}$/.test(signature)) fail(401, "Invalid integration signature");
      const expected = createHmac("sha256", config.key).update(timestamp + ".").update(raw).digest();
      if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) fail(401, "Invalid integration signature");
      let payload: unknown;
      try { payload = JSON.parse(raw.toString("utf8")); } catch { fail(400, "Invalid integration JSON"); }
      const fields = action === "handshake" ? ["version", "companyId", "nonce"] : ["version", "companyId", "eventId", "eventType", "jobId", "occurredAt"];
      if (!exact(payload, fields) || payload.version !== 1 || payload.companyId !== config.companyId) fail(400, "Invalid integration payload or company");
      let ack: Record<string, unknown>;
      if (action === "handshake") {
        if (typeof payload.nonce !== "string" || !/^[a-f0-9]{32}$/.test(payload.nonce)) fail(400, "Invalid handshake nonce");
        ack = {version: 1, companyId: config.companyId, nonce: payload.nonce, service: "nexus"};
      } else {
        if (!safeId(payload.eventId) || !safeId(payload.jobId) || typeof payload.eventType !== "string" || !TYPES.has(payload.eventType) || typeof payload.occurredAt !== "string" || !Number.isFinite(Date.parse(payload.occurredAt)) || new Date(payload.occurredAt).toISOString() !== payload.occurredAt) fail(400, "Invalid operational event");
        const event: GulfWingEvent = {version: 1, companyId: config.companyId, eventId: payload.eventId, eventType: payload.eventType, jobId: payload.jobId, occurredAt: payload.occurredAt};
        const serialized = JSON.stringify(event), checksum = digest(serialized);
        const db = database(directory);
        let duplicate = false;
        try {
          db.exec("BEGIN IMMEDIATE");
          const found = db.prepare("SELECT digest FROM gulf_wing_events WHERE company_id=? AND event_id=?").get(config.companyId, event.eventId) as {digest: string} | undefined;
          if (found) { if (found.digest !== checksum) fail(409, "Event identifier conflict"); duplicate = true; }
          else db.prepare("INSERT INTO gulf_wing_events VALUES (?,?,?,?,?)").run(config.companyId, event.eventId, checksum, serialized, new Date(now()).toISOString());
          db.exec("COMMIT");
        } catch (error) { db.exec("ROLLBACK"); throw error; } finally { db.close(); }
        ack = {version: 1, companyId: config.companyId, eventId: event.eventId, accepted: true, duplicate};
      }
      const body = JSON.stringify(ack), sentAt = String(Math.floor(now()/1000));
      const signed = createHmac("sha256", config.key).update(sentAt + "." + body).digest("hex");
      return new Response(body, {status: 200, headers: {"Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "x-gw-timestamp": sentAt, "x-gw-signature": signed}});
    } catch (error) {
      const status = error instanceof IntegrationError ? error.status : 503;
      return Response.json({error: error instanceof IntegrationError ? error.message : "Gulf Wing inbox is unavailable"}, {status, headers: {"Cache-Control": "no-store"}});
    }
  }
  return {handle};
}

// Operator-only local inspection. This never accepts a pairing code or changes
// the Controller workspace; incoming events are summaries for human review.
export function readGulfWingInbox({env = process.env, dataDir}: Options = {}) {
  const config = settings(env);
  if (!config) fail(503, "Gulf Wing integration is not configured");
  const filename = path.join(dataDir || env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"), "gulf-wing-integration.sqlite");
  if (!existsSync(filename)) return [];
  const db = new DatabaseSync(filename, {readOnly: true});
  try {
    return db.prepare("SELECT payload,received_at FROM gulf_wing_events WHERE company_id=? ORDER BY received_at DESC,event_id DESC LIMIT 200").all(config.companyId).map(row => ({...JSON.parse(row.payload as string), receivedAt: row.received_at}));
  } finally { db.close(); }
}
