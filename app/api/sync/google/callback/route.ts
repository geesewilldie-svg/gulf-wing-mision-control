import { finishGoogle, GOOGLE_REDIRECT } from "@/lib/server/google-calendar";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookie =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("gw_google_state="))
      ?.slice("gw_google_state=".length) || "";
  let status = "failed";
  try {
    await finishGoogle(
      url.searchParams.get("state") || "",
      cookie,
      url.searchParams.get("code") || "",
    );
    status = "connected";
  } catch {
    /* Never reflect codes, credentials or Google responses into the redirect. */
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL("/nexus?google=" + status, GOOGLE_REDIRECT).toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Set-Cookie":
        "gw_google_state=; HttpOnly; SameSite=Lax; Path=/api/sync/google/callback; Max-Age=0",
    },
  });
}
