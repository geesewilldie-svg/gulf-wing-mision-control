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
    const host = new URL(request.url).hostname;
    if (host !== "localhost")
      throw new SyncError(
        400,
        "Start Google sign-in on the laptop at http://localhost:3000/nexus.",
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
