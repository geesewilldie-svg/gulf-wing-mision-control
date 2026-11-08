import {
  authorized,
  sameOrigin,
  response,
  failure,
  SyncError,
} from "@/lib/server/sync-store";
import {
  googleStatus,
  beginGoogle,
  disconnectGoogle,
  GOOGLE_REDIRECT,
} from "@/lib/server/google-calendar";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await authorized(request, true);
    return response(await googleStatus());
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    // Next constructs request.url from the server bind address (0.0.0.0).
    // Validate the browser's actual Host instead, never a forwarded-host hint.
    const expected = new URL(GOOGLE_REDIRECT);
    if (request.headers.get("host")?.toLowerCase() !== expected.host)
      throw new SyncError(
        400,
        "Start Google sign-in on the laptop at http://localhost:3000/nexus.",
      );
    const origin = request.headers.get("origin");
    if (origin && origin !== expected.origin)
      throw new SyncError(
        403,
        "Open Google sign-in directly at " + expected.origin + "/nexus.",
      );
    const start = await beginGoogle();
    return response({ url: start.url }, 200, {
      "Set-Cookie":
        "gw_google_state=" +
        start.state +
        "; HttpOnly; SameSite=Lax; Path=/api/sync/google/callback; Max-Age=600",
    });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    await disconnectGoogle();
    return response({ disconnected: true });
  } catch (e) {
    return failure(e);
  }
}
