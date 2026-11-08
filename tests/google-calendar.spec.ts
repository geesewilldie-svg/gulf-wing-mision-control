import {
  fixtureRole,
  fixtureCookieHeader,
  fixtureCookie,
} from "./helpers/access";
import { test, expect } from "@playwright/test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  beginGoogle,
  finishGoogle,
  googleStatus,
  googleEvents,
  disconnectGoogle,
  parseGoogleEvent,
  GOOGLE_SCOPE,
  GOOGLE_REDIRECT,
} from "../lib/server/google-calendar";
import { defaultBriefSettings } from "../lib/daily-brief";
test("OAuth uses PKCE, one-use state and encrypted tokens; refresh and calendar requests use fixed Google origins", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nexus-google-")),
    previous = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    await writeFile(
      path.join(dir, "sync-config.json"),
      JSON.stringify({
        version: 1,
        pairingHash: "a".repeat(64),
        signingSecret: "b".repeat(64),
      }),
    );
    await writeFile(
      path.join(dir, "google-oauth.json"),
      JSON.stringify({
        clientId: "synthetic.apps.googleusercontent.com",
        clientSecret: "synthetic-client-secret",
      }),
    );
    const start = await beginGoogle();
    const auth = new URL(start.url);
    expect(auth.origin).toBe("https://accounts.google.com");
    expect(auth.searchParams.get("scope")).toBe("openid email " + GOOGLE_SCOPE);
    expect(auth.searchParams.get("redirect_uri")).toBe(GOOGLE_REDIRECT);
    expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
    expect(auth.searchParams.get("scope")).not.toContain("gmail");
    const requests: string[] = [];
    const transport = (async (url: any, init: any) => {
      requests.push(String(url));
      if (String(url).includes("/token"))
        return Response.json({
          access_token: "synthetic-access",
          refresh_token: "synthetic-refresh",
          expires_in: 1,
          scope: GOOGLE_SCOPE,
        });
      if (String(url).includes("/userinfo"))
        return Response.json({
          email: "synthetic@example.test",
          email_verified: true,
        });
      expect(init.headers.Authorization).toBe("Bearer synthetic-access");
      return Response.json({
        items: [
          {
            id: "one",
            summary: "Owner preparation",
            start: { dateTime: "2026-11-09T13:00:00Z" },
            end: { dateTime: "2026-11-09T14:00:00Z" },
          },
        ],
      });
    }) as typeof fetch;
    const stateFile = path.join(dir, "google-state.json");
    const pending = JSON.parse(await readFile(stateFile, "utf8"));
    await writeFile(
      stateFile,
      JSON.stringify({ ...pending, expires: Date.now() - 1000 }),
    );
    await expect(
      finishGoogle(start.state, start.state, "expired", transport),
    ).rejects.toThrow();
    await writeFile(stateFile, JSON.stringify(pending));
    await expect(
      finishGoogle(start.state, "incorrect", "code", transport),
    ).rejects.toThrow();
    await finishGoogle(start.state, start.state, "synthetic-code", transport);
    expect((await googleStatus()).email).toBe("synthetic@example.test");
    expect(
      await readFile(path.join(dir, "google-tokens.json"), "utf8"),
    ).not.toContain("synthetic-access");
    await expect(
      finishGoogle(start.state, start.state, "replay", transport),
    ).rejects.toThrow();
    const result = await googleEvents(
      defaultBriefSettings(),
      new Date("2026-11-09T10:00:00Z"),
      transport,
    );
    expect(result.events[0].title).toBe("Owner preparation");
    expect(requests.filter((u) => u.includes("/token"))).toHaveLength(2);
    expect(
      requests.every((u) =>
        [
          "https://oauth2.googleapis.com",
          "https://openidconnect.googleapis.com",
          "https://www.googleapis.com",
        ].includes(new URL(u).origin),
      ),
    ).toBe(true);
    const partialTransport = (async (url: any) =>
      String(url).includes("/token")
        ? Response.json({ access_token: "synthetic-access", expires_in: 3600 })
        : Response.json({ items: [], nextPageToken: "more" })) as typeof fetch;
    const partial = await googleEvents(
      defaultBriefSettings(),
      new Date("2026-11-09T10:00:00Z"),
      partialTransport,
    );
    expect(partial.warnings).toHaveLength(1);
    await disconnectGoogle();
    expect((await googleStatus()).connected).toBe(false);
    const denied = await beginGoogle();
    const deniedTransport = (async () =>
      Response.json({
        access_token: "not-stored",
        refresh_token: "not-stored",
        expires_in: 3600,
        scope: "openid email",
      })) as typeof fetch;
    await expect(
      finishGoogle(denied.state, denied.state, "denied-scope", deniedTransport),
    ).rejects.toThrow();
    expect((await googleStatus()).connected).toBe(false);
  } finally {
    if (previous === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
test("calendar parser excludes cancelled/declined events and respects exclusive all-day ends", () => {
  const event = {
    id: "x",
    summary: "Readiness",
    start: { date: "2026-11-09" },
    end: { date: "2026-11-10" },
    attendees: [
      { self: true, responseStatus: "accepted" },
      { email: "owner@example.test", responseStatus: "accepted" },
    ],
  };
  const e = parseGoogleEvent(event, "primary", "America/New_York");
  expect(e?.start).toBe("2026-11-09T05:00:00.000Z");
  expect(e?.end).toBe("2026-11-10T05:00:00.000Z");
  expect(e?.people).toEqual(["owner@example.test"]);
  expect(
    parseGoogleEvent(
      { ...event, status: "cancelled" },
      "primary",
      "America/New_York",
    ),
  ).toBeNull();
  expect(
    parseGoogleEvent(
      { ...event, attendees: [{ self: true, responseStatus: "declined" }] },
      "primary",
      "America/New_York",
    ),
  ).toBeNull();
});
test("Google endpoints require controller, reject cross-origin setup and callbacks never reflect authorization codes", async ({
  context,
}) => {
  const request = context.request;
  expect((await request.get("/api/sync/google")).status()).toBe(401);
  await fixtureRole(context, "display");
  expect((await request.get("/api/sync/google")).status()).toBe(403);
  await fixtureRole(context, "controller");
  expect(
    (
      await request.post("/api/sync/google", {
        headers: { Origin: "https://untrusted.example" },
      })
    ).status(),
  ).toBe(403);
  expect(await (await request.get("/api/sync/google")).json()).toMatchObject({
    configured: false,
    connected: false,
  });
  expect((await request.get("/api/sync/google/events")).status()).toBe(409);
  const callback = await request.get(
    "/api/sync/google/callback?code=secret-synthetic-code&state=bad",
    { maxRedirects: 0 },
  );
  expect(callback.status()).toBe(303);
  expect(callback.headers().location).toBe(
    "http://localhost:3000/nexus?google=failed",
  );
  expect(await callback.text()).not.toContain("secret-synthetic-code");
});
test("connection UI explains local setup and does not imply account authorization", async ({
  page,
  context,
}) => {
  await fixtureRole(context, "controller");
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  const panel = page.getByRole("region", {
    name: "Google Calendar connection",
  });
  await expect(panel).toContainText("One-time Google OAuth setup required");
  await expect(
    panel.getByRole("button", { name: "Connect Google Calendar", exact: true }),
  ).toBeDisabled();
  await expect(panel).toContainText("Read-only");
});

test("localhost sign-in start works behind the all-interface Next server and rejects other browser hosts", async ({
  context,
}) => {
  const target = path.join(process.env.GW_SYNC_TEST_ROOT!, "google-oauth.json");
  await writeFile(
    target,
    JSON.stringify({
      clientId: "synthetic.apps.googleusercontent.com",
      clientSecret: "synthetic-private-client",
    }),
  );
  const headers = {
    Cookie: fixtureCookieHeader("controller"),
    Host: "localhost:3000",
    Origin: "http://localhost:3000",
  };
  try {
    const started = await context.request.post("/api/sync/google", { headers });
    expect(started.status()).toBe(200);
    const body = await started.json();
    const url = new URL(body.url);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("redirect_uri")).toBe(GOOGLE_REDIRECT);
    expect(JSON.stringify(body)).not.toContain("synthetic-private-client");
    expect(started.headers()["set-cookie"]).toContain(
      "HttpOnly; SameSite=Lax; Path=/api/sync/google/callback",
    );
    for (const host of [
      "127.0.0.1:3000",
      "0.0.0.0:3000",
      "10.0.0.213:3000",
      "localhost.evil.example:3000",
      "localhost:3001",
    ]) {
      const rejected = await context.request.post("/api/sync/google", {
        headers: {
          Cookie: headers.Cookie,
          Host: host,
          Origin: "http://" + host,
          "X-Forwarded-Host": "localhost:3000",
        },
      });
      expect(rejected.status()).toBe(400);
    }
    expect(
      (
        await context.request.post("/api/sync/google", {
          headers: { ...headers, Origin: "https://untrusted.example" },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await rm(target, { force: true });
    await rm(path.join(process.env.GW_SYNC_TEST_ROOT!, "google-state.json"), {
      force: true,
    });
  }
});

test("browser Connect button reaches synthetic Google sign-in from localhost with a bound callback cookie", async ({
  page,
  context,
}) => {
  const target = path.join(process.env.GW_SYNC_TEST_ROOT!, "google-oauth.json");
  await writeFile(
    target,
    JSON.stringify({
      clientId: "synthetic.apps.googleusercontent.com",
      clientSecret: "synthetic-private-client",
    }),
  );
  try {
    await context.addCookies([
      { ...fixtureCookie("controller"), domain: "localhost" },
    ]);
    let authUrl = "";
    await page.route("https://accounts.google.com/**", async (route) => {
      authUrl = route.request().url();
      await route.fulfill({
        contentType: "text/html",
        body: "<h1>Synthetic sign-in destination</h1>",
      });
    });
    await page.goto("http://localhost:3000/nexus");
    await page
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Connect Google Calendar", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Synthetic sign-in destination" }),
    ).toBeVisible();
    expect(new URL(authUrl).searchParams.get("redirect_uri")).toBe(
      GOOGLE_REDIRECT,
    );
    const cookies = await context.cookies(
      "http://localhost:3000/api/sync/google/callback",
    );
    const state = cookies.find((c) => c.name === "gw_google_state");
    expect(state?.httpOnly).toBe(true);
    expect(state?.sameSite).toBe("Lax");
    expect(state?.value).toBe(new URL(authUrl).searchParams.get("state"));
  } finally {
    await rm(target, { force: true });
    await rm(path.join(process.env.GW_SYNC_TEST_ROOT!, "google-state.json"), {
      force: true,
    });
  }
});
