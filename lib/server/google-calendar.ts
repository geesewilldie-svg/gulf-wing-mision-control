import { promises as fs } from "node:fs";
import path from "node:path";
import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
import { briefFile } from "./brief-store";
import { config, SyncError } from "./sync-store";
import {
  addDays,
  localParts,
  zonedInstant,
  type BriefSettings,
  type CalendarItem,
} from "../daily-brief";
const file = (name: string) => path.join(path.dirname(briefFile()), name);
export const GOOGLE_REDIRECT = "http://localhost:3000/api/sync/google/callback";
export const GOOGLE_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly";
const SCOPES = "openid email " + GOOGLE_SCOPE;
type OAuthConfig = { clientId: string; clientSecret: string };
type Tokens = {
  access: string;
  refresh: string;
  expires: number;
  email: string;
};
type Transport = typeof fetch;
async function atomic(name: string, value: unknown) {
  const target = file(name),
    temp = target + "." + randomBytes(8).toString("hex") + ".tmp";
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  try {
    await fs.writeFile(temp, JSON.stringify(value), {
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temp, target);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
async function oauthConfig(): Promise<OAuthConfig | null> {
  try {
    const c = JSON.parse(await fs.readFile(file("google-oauth.json"), "utf8"));
    if (
      typeof c.clientId !== "string" ||
      !c.clientId.endsWith(".apps.googleusercontent.com") ||
      typeof c.clientSecret !== "string" ||
      !c.clientSecret
    )
      throw Error();
    return c;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new SyncError(503, "Google OAuth setup cannot be read.");
  }
}
async function key() {
  const c = await config();
  if (!c) throw new SyncError(503, "Configure private pairing first.");
  return createHash("sha256")
    .update("nexus-google-v1:" + c.signingSecret)
    .digest();
}
async function saveTokens(t: Tokens) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", await key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(t), "utf8"),
    cipher.final(),
  ]);
  await atomic("google-tokens.json", {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  });
}
async function tokens(): Promise<Tokens | null> {
  try {
    const v = JSON.parse(await fs.readFile(file("google-tokens.json"), "utf8"));
    const decipher = createDecipheriv(
      "aes-256-gcm",
      await key(),
      Buffer.from(v.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(v.tag, "base64"));
    const t = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(v.data, "base64")),
        decipher.final(),
      ]).toString(),
    );
    if (
      typeof t.access !== "string" ||
      typeof t.refresh !== "string" ||
      typeof t.email !== "string" ||
      !Number.isFinite(t.expires)
    )
      throw Error();
    return t;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new SyncError(
      503,
      "Google credentials cannot be read. Reconnect Google locally.",
    );
  }
}
async function json(url: string, init: RequestInit, transport: Transport) {
  const r = await transport(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok)
    throw new SyncError(
      502,
      "Google request failed. Check permissions or reconnect; no calendar changes were made.",
    );
  const raw = await r.text();
  if (raw.length > 2_000_000)
    throw new SyncError(502, "Google response exceeded the local limit.");
  return JSON.parse(raw);
}
export async function googleStatus() {
  const c = await oauthConfig(),
    t = await tokens();
  return {
    configured: !!c,
    connected: !!t,
    email: t?.email || null,
    scope: "Read-only Google Calendar; no email sending or calendar edits",
    redirect: GOOGLE_REDIRECT,
  };
}
export async function beginGoogle() {
  const c = await oauthConfig();
  if (!c)
    throw new SyncError(
      409,
      "Set up a Google OAuth web client on the laptop first. See docs/google-calendar.md.",
    );
  const state = randomBytes(32).toString("hex"),
    verifier = randomBytes(48).toString("base64url");
  await atomic("google-state.json", {
    state,
    verifier,
    expires: Date.now() + 600000,
  });
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  Object.entries({
    client_id: c.clientId,
    redirect_uri: GOOGLE_REDIRECT,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).forEach(([k, v]) => u.searchParams.set(k, v));
  return { url: u.toString(), state };
}
const shared = globalThis as typeof globalThis & {
  nexusGoogleQueue?: Promise<unknown>;
};
async function locked<T>(fn: () => Promise<T>) {
  const p = (shared.nexusGoogleQueue ?? Promise.resolve())
    .catch(() => {})
    .then(fn);
  shared.nexusGoogleQueue = p.catch(() => {});
  return p;
}
export async function finishGoogle(
  state: string,
  cookie: string,
  code: string,
  transport: Transport = fetch,
) {
  return locked(async () => {
    let pending;
    try {
      pending = JSON.parse(
        await fs.readFile(file("google-state.json"), "utf8"),
      );
    } catch {
      throw new SyncError(
        400,
        "Google connection expired. Start again from Nexus.",
      );
    }
    const equal = (a: string, b: string) =>
      a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
    if (
      !/^[a-f0-9]{64}$/.test(state) ||
      !equal(state, cookie) ||
      typeof pending.state !== "string" ||
      !equal(state, pending.state) ||
      pending.expires < Date.now() ||
      !code ||
      code.length > 4096
    )
      throw new SyncError(
        400,
        "Google connection could not be verified. Start again from Nexus.",
      );
    await fs.rm(file("google-state.json"), { force: true });
    const c = await oauthConfig();
    if (!c) throw new SyncError(409, "Google OAuth configuration is missing.");
    const t = await json(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: c.clientId,
          client_secret: c.clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: GOOGLE_REDIRECT,
          code_verifier: pending.verifier,
        }),
      },
      transport,
    );
    if (
      typeof t.access_token !== "string" ||
      typeof t.refresh_token !== "string" ||
      !String(t.scope).split(" ").includes(GOOGLE_SCOPE) ||
      !Number.isFinite(t.expires_in) ||
      t.expires_in <= 0
    )
      throw new SyncError(
        400,
        "Google did not grant persistent read-only calendar access. Reconnect and grant the requested scope.",
      );
    const profile = await json(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { Authorization: "Bearer " + t.access_token } },
      transport,
    );
    if (
      profile.email_verified !== true ||
      typeof profile.email !== "string" ||
      profile.email.length > 254 ||
      /[\r\n]/.test(profile.email)
    )
      throw new SyncError(400, "Google account email could not be verified.");
    await saveTokens({
      access: t.access_token,
      refresh: t.refresh_token,
      expires: Date.now() + t.expires_in * 1000,
      email: profile.email,
    });
    await fs.rm(file("morning-brief.json"), { force: true });
  });
}
async function accessToken(transport: Transport) {
  return locked(async () => {
    const t = await tokens();
    if (!t) throw new SyncError(409, "Google Calendar is not connected.");
    if (t.expires > Date.now() + 60000) return t.access;
    const c = await oauthConfig();
    if (!c) throw new SyncError(409, "Google OAuth configuration is missing.");
    const v = await json(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: c.clientId,
          client_secret: c.clientSecret,
          grant_type: "refresh_token",
          refresh_token: t.refresh,
        }),
      },
      transport,
    );
    if (
      typeof v.access_token !== "string" ||
      !Number.isFinite(v.expires_in) ||
      v.expires_in <= 0
    )
      throw new SyncError(
        502,
        "Google session could not be refreshed. Reconnect Google.",
      );
    await saveTokens({
      ...t,
      access: v.access_token,
      expires: Date.now() + v.expires_in * 1000,
    });
    return v.access_token as string;
  });
}
export async function disconnectGoogle() {
  return locked(async () => {
    await fs.rm(file("google-tokens.json"), { force: true });
    await fs.rm(file("google-state.json"), { force: true });
    await fs.rm(file("morning-brief.json"), { force: true });
  });
}
export function parseGoogleEvent(
  raw: any,
  calendar: string,
  zone: string,
): CalendarItem | null {
  if (
    !raw ||
    raw.status === "cancelled" ||
    raw.attendees?.some((a: any) => a.self && a.responseStatus === "declined")
  )
    return null;
  const allDay = !!raw.start?.date;
  const instant = (v: any) =>
    v?.dateTime || (v?.date ? zonedInstant(v.date, "00:00", zone) : "");
  let start, end;
  try {
    start = instant(raw.start);
    end = instant(raw.end);
  } catch {
    return null;
  }
  if (
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    Date.parse(end) <= Date.parse(start)
  )
    return null;
  const clean = (v: unknown, n: number) =>
    typeof v === "string"
      ? v
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, n)
      : "";
  return {
    id: clean(raw.iCalUID || raw.id, 500) + ":" + start,
    title: clean(raw.summary, 200) || "Untitled calendar item",
    start,
    end,
    allDay,
    people: (Array.isArray(raw.attendees) ? raw.attendees : [])
      .filter((a: any) => !a.self && a.responseStatus !== "declined")
      .slice(0, 10)
      .map((a: any) => clean(a.displayName || a.email, 100)),
    prep: clean(raw.description, 300),
    calendar,
    transparent: raw.transparency === "transparent",
  };
}
export async function googleEvents(
  settings: BriefSettings,
  now: Date,
  transport: Transport = fetch,
) {
  const token = await accessToken(transport),
    day = localParts(now, settings.timezone).date;
  const events: CalendarItem[] = [],
    warnings: string[] = [];
  for (const calendar of settings.calendars) {
    let next = "";
    let pages = 0;
    do {
      const url = new URL(
        "https://www.googleapis.com/calendar/v3/calendars/" +
          encodeURIComponent(calendar) +
          "/events",
      );
      Object.entries({
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
        timeMin: zonedInstant(day, "00:00", settings.timezone),
        timeMax: zonedInstant(addDays(day, 7), "00:00", settings.timezone),
        timeZone: settings.timezone,
        ...(next ? { pageToken: next } : {}),
      }).forEach(([k, v]) => url.searchParams.set(k, v));
      const data = await json(
        url.toString(),
        { headers: { Authorization: "Bearer " + token } },
        transport,
      );
      if (!Array.isArray(data.items))
        throw new SyncError(
          502,
          "Google Calendar returned an invalid event list.",
        );
      for (const raw of data.items) {
        const item = parseGoogleEvent(raw, calendar, settings.timezone);
        if (item) events.push(item);
      }
      next = typeof data.nextPageToken === "string" ? data.nextPageToken : "";
      pages++;
    } while (next && pages < 4);
    if (next)
      warnings.push(
        "Calendar result limit reached; review the full calendar in Google.",
      );
  }
  return { events, warnings };
}
