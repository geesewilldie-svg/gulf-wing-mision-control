import { readFileSync } from "node:fs";
import path from "node:path";
import type { Cookie, BrowserContext } from "@playwright/test";
import { token, COOKIE } from "../../lib/server/sync-store";
// Feature tests exercise session authorization without repeatedly invoking the
// real pairing endpoint. Dedicated sync tests still test pairing/rate behavior.
export function fixtureCookie(role: "controller" | "display"): Cookie {
  const root = process.env.GW_SYNC_TEST_ROOT;
  if (!root) throw Error("Disposable Playwright sync fixture is required.");
  const settings = JSON.parse(
    readFileSync(path.join(root, "sync-config.json"), "utf8"),
  );
  return {
    name: COOKIE,
    value: token(settings, role),
    domain: "127.0.0.1",
    path: "/api/sync",
    expires: Math.floor(Date.now() / 1000) + 3600,
    httpOnly: true,
    secure: false,
    sameSite: "Strict",
  };
}
export const fixtureCookieHeader = (role: "controller" | "display") => {
  const c = fixtureCookie(role);
  return c.name + "=" + c.value;
};
export async function fixtureRole(
  context: BrowserContext,
  role: "controller" | "display" = "controller",
) {
  await context.addCookies([fixtureCookie(role)]);
}
