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
export const GOOGLE_REDIRECT = "http://localhost:3000/api/sync/google/callback";
export const GOOGLE_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export type GoogleFeatures = "calendar" | "drive" | "both";
export type GoogleTransport = typeof fetch;
type Tokens = {
  id: string;
  access: string;
  refresh: string;
  expires: number;
  email: string;
  scopes: string[];
};
type Book = { version: 2; accounts: Tokens[] };
const file = (name: string) => path.join(path.dirname(briefFile()), name);
const accountId = (email: string) =>
  createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 24);
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
async function oauthConfig() {
  try {
    const c = JSON.parse(await fs.readFile(file("google-oauth.json"), "utf8"));
    if (
      typeof c.clientId !== "string" ||
      !c.clientId.endsWith(".apps.googleusercontent.com") ||
      typeof c.clientSecret !== "string" ||
      !c.clientSecret
    )
      throw Error();
    return c as { clientId: string; clientSecret: string };
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
async function book(): Promise<Book> {
  try {
    const raw = await fs.readFile(file("google-tokens.json"), "utf8");
    if (raw.length > 500000) throw Error();
    const v = JSON.parse(raw),
      decipher = createDecipheriv(
        "aes-256-gcm",
        await key(),
        Buffer.from(v.iv, "base64"),
      );
    decipher.setAuthTag(Buffer.from(v.tag, "base64"));
    let b = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(v.data, "base64")),
        decipher.final(),
      ]).toString(),
    );
    // Read the verified single-account format without changing it. The first mutation backs it up encrypted.
    if (b.version === undefined && typeof b.email === "string")
      b = {
        version: 2,
        accounts: [{ ...b, id: accountId(b.email), scopes: [GOOGLE_SCOPE] }],
      };
    if (b.version !== 2 || !Array.isArray(b.accounts) || b.accounts.length > 4)
      throw Error();
    const ids = new Set<string>();
    for (const t of b.accounts) {
      if (
        !t ||
        typeof t.email !== "string" ||
        !t.email ||
        t.email.length > 254 ||
        /[\r\n]/.test(t.email) ||
        t.id !== accountId(t.email) ||
        ids.has(t.id) ||
        typeof t.access !== "string" ||
        !t.access ||
        typeof t.refresh !== "string" ||
        !t.refresh ||
        !Number.isFinite(t.expires) ||
        !Array.isArray(t.scopes) ||
        !t.scopes.every((s: unknown) => typeof s === "string") ||
        !t.scopes.some((s: string) => [GOOGLE_SCOPE, DRIVE_SCOPE].includes(s))
      )
        throw Error();
      ids.add(t.id);
    }
    return b;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      return { version: 2, accounts: [] };
    throw new SyncError(
      503,
      "Google credentials cannot be read. Existing credentials are preserved; reconnect Google locally.",
    );
  }
}
async function saveBook(b: Book) {
  // Retain an encrypted pre-migration backup, never a plaintext copy of tokens.
  try {
    const original = await fs.readFile(file("google-tokens.json"));
    const v = JSON.parse(original.toString()),
      d = createDecipheriv(
        "aes-256-gcm",
        await key(),
        Buffer.from(v.iv, "base64"),
      );
    d.setAuthTag(Buffer.from(v.tag, "base64"));
    const old = JSON.parse(
      Buffer.concat([
        d.update(Buffer.from(v.data, "base64")),
        d.final(),
      ]).toString(),
    );
    if (old.version === undefined) {
      try {
        await fs.writeFile(file("google-tokens-v1.backup.json"), original, {
          flag: "wx",
          mode: 0o600,
        });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", await key(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(b), "utf8"),
    cipher.final(),
  ]);
  await atomic("google-tokens.json", {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
}
const shared = globalThis as typeof globalThis & {
  nexusGoogleQueue?: Promise<unknown>;
};
export async function googleLocked<T>(fn: () => Promise<T>) {
  const p = (shared.nexusGoogleQueue ?? Promise.resolve())
    .catch(() => {})
    .then(fn);
  shared.nexusGoogleQueue = p.catch(() => {});
  return p;
}
export async function googleJson(
  url: string,
  init: RequestInit,
  transport: GoogleTransport,
) {
  const r = await transport(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok)
    throw new SyncError(
      502,
      "Google request failed. Check API enablement, permissions or reconnect. No Google files or calendar items were changed.",
    );
  const reader = r.body?.getReader();
  if (!reader) throw new SyncError(502, "Google returned an empty response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2_000_000) {
      await reader.cancel();
      throw new SyncError(502, "Google response exceeded the local limit.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new SyncError(502, "Google returned an invalid response.");
  }
}
export async function googleAccounts() {
  return (await book()).accounts.map((t) => ({
    id: t.id,
    email: t.email,
    calendar: t.scopes.includes(GOOGLE_SCOPE),
    drive: t.scopes.includes(DRIVE_SCOPE),
  }));
}
export async function googleStatus() {
  const c = await oauthConfig(),
    accounts = await googleAccounts(),
    calendar = accounts.filter((a) => a.calendar);
  return {
    configured: !!c,
    connected: calendar.length > 0,
    email: calendar[0]?.email || null,
    accounts,
    scope:
      "Read-only Google Calendar and separately authorized Drive files; no email sending or edits",
    redirect: GOOGLE_REDIRECT,
  };
}
export async function beginGoogle(
  features: GoogleFeatures = "calendar",
  id?: string,
) {
  return googleLocked(async () => {
    const c = await oauthConfig();
    if (!c)
      throw new SyncError(
        409,
        "Set up a Google OAuth web client on the laptop first. See docs/google-calendar.md.",
      );
    if (!["calendar", "drive", "both"].includes(features))
      throw new SyncError(400, "Choose Calendar or Drive read access.");
    const b = await book(),
      existing = id ? b.accounts.find((a) => a.id === id) : undefined;
    if (id && !existing)
      throw new SyncError(404, "Google account not found. Refresh status.");
    const required = [
      ...new Set([
        ...(existing?.scopes || []).filter((s) =>
          [GOOGLE_SCOPE, DRIVE_SCOPE].includes(s),
        ),
        ...(features !== "drive" ? [GOOGLE_SCOPE] : []),
        ...(features !== "calendar" ? [DRIVE_SCOPE] : []),
      ]),
    ];
    const state = randomBytes(32).toString("hex"),
      verifier = randomBytes(48).toString("base64url");
    await atomic("google-state.json", {
      state,
      verifier,
      expires: Date.now() + 600000,
      required,
      expectedEmail: existing?.email || null,
    });
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    Object.entries({
      client_id: c.clientId,
      redirect_uri: GOOGLE_REDIRECT,
      response_type: "code",
      scope: "openid email " + required.join(" "),
      access_type: "offline",
      prompt: "consent select_account",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      ...(existing ? { login_hint: existing.email } : {}),
    }).forEach(([k, v]) => u.searchParams.set(k, v));
    return { url: u.toString(), state };
  });
}
export async function finishGoogle(
  state: string,
  cookie: string,
  code: string,
  transport: GoogleTransport = fetch,
) {
  return googleLocked(async () => {
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
      Buffer.byteLength(a) === Buffer.byteLength(b) &&
      timingSafeEqual(Buffer.from(a), Buffer.from(b));
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
    const required = pending.required ?? [GOOGLE_SCOPE];
    if (
      !Array.isArray(required) ||
      !required.length ||
      !required.every((s: string) => [GOOGLE_SCOPE, DRIVE_SCOPE].includes(s))
    )
      throw new SyncError(
        400,
        "Google connection request is invalid. Start again.",
      );
    const c = await oauthConfig();
    if (!c) throw new SyncError(409, "Google OAuth configuration is missing.");
    const t = await googleJson(
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
    const granted = typeof t.scope === "string" ? t.scope.split(" ") : [];
    if (
      typeof t.access_token !== "string" ||
      !t.access_token ||
      t.access_token.length > 16384 ||
      typeof t.refresh_token !== "string" ||
      !t.refresh_token ||
      t.refresh_token.length > 16384 ||
      !required.every((s: string) => granted.includes(s)) ||
      !Number.isFinite(t.expires_in) ||
      t.expires_in <= 0
    )
      throw new SyncError(
        400,
        "Google did not grant persistent access to the requested scopes. Existing connections were preserved.",
      );
    const profile = await googleJson(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { Authorization: "Bearer " + t.access_token } },
      transport,
    );
    if (
      profile.email_verified !== true ||
      typeof profile.email !== "string" ||
      !profile.email ||
      profile.email.length > 254 ||
      /[\r\n]/.test(profile.email)
    )
      throw new SyncError(400, "Google account email could not be verified.");
    if (
      pending.expectedEmail &&
      profile.email.toLowerCase() !== pending.expectedEmail.toLowerCase()
    )
      throw new SyncError(
        400,
        "A different Google account was selected. Existing connections were preserved; reconnect using the intended account.",
      );
    const b = await book(),
      id = accountId(profile.email),
      old = b.accounts.find((a) => a.id === id);
    if (
      old?.scopes.some(
        (s) => [GOOGLE_SCOPE, DRIVE_SCOPE].includes(s) && !granted.includes(s),
      )
    )
      throw new SyncError(
        400,
        "This grant would remove an existing permission. Use the account's reconnect control to retain its scopes.",
      );
    if (!old && b.accounts.length >= 4)
      throw new SyncError(
        409,
        "Up to four Google accounts are supported. Disconnect one first.",
      );
    const next = {
      id,
      access: t.access_token,
      refresh: t.refresh_token,
      expires: Date.now() + t.expires_in * 1000,
      email: profile.email,
      scopes: granted,
    };
    b.accounts = old
      ? b.accounts.map((a) => (a.id === id ? next : a))
      : [...b.accounts, next];
    await saveBook(b);
    await fs.rm(file("morning-brief.json"), { force: true });
  });
}
export async function googleAccessToken(
  id: string,
  scope: string,
  transport: GoogleTransport = fetch,
) {
  return googleLocked(async () => {
    const b = await book(),
      t = b.accounts.find((a) => a.id === id);
    if (!t || !t.scopes.includes(scope))
      throw new SyncError(
        409,
        "This Google account is not connected with the required read permission.",
      );
    if (t.expires > Date.now() + 60000) return t.access;
    const c = await oauthConfig();
    if (!c) throw new SyncError(409, "Google OAuth configuration is missing.");
    const v = await googleJson(
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
      !v.access_token ||
      v.access_token.length > 16384 ||
      !Number.isFinite(v.expires_in) ||
      v.expires_in <= 0
    )
      throw new SyncError(
        502,
        "Google session could not be refreshed. Reconnect this Google account.",
      );
    if (
      v.scope !== undefined &&
      (typeof v.scope !== "string" ||
        t.scopes
          .filter((s) => [GOOGLE_SCOPE, DRIVE_SCOPE].includes(s))
          .some((s) => !v.scope.split(" ").includes(s)))
    )
      throw new SyncError(
        409,
        "Google permissions changed. Reconnect this account; existing credentials were preserved.",
      );
    b.accounts = b.accounts.map((a) =>
      a.id === id
        ? {
            ...a,
            access: v.access_token,
            expires: Date.now() + v.expires_in * 1000,
          }
        : a,
    );
    await saveBook(b);
    return v.access_token as string;
  });
}
export async function disconnectGoogle(id?: string) {
  return googleLocked(async () => {
    const b = await book();
    if (id && !b.accounts.some((a) => a.id === id))
      throw new SyncError(404, "Google account not found.");
    await saveBook({
      version: 2,
      accounts: id ? b.accounts.filter((a) => a.id !== id) : [],
    });
    for (const name of [
      "google-state.json",
      "morning-brief.json",
      "google-drive-index.json",
      "google-tokens-v1.backup.json",
    ])
      await fs.rm(file(name), { force: true });
  });
}
