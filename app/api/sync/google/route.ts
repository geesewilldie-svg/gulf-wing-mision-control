import {
  authorized,
  sameOrigin,
  response,
  failure,
  SyncError,
  readBody,
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
    const body =
      request.body && request.headers.get("content-length") !== "0"
        ? ((await readBody(request, 2000)) as {
            features?: unknown;
            accountId?: unknown;
          })
        : {};
    if (
      !body ||
      typeof body !== "object" ||
      (body.features !== undefined &&
        !["calendar", "drive", "both"].includes(body.features as string)) ||
      (body.accountId !== undefined &&
        (typeof body.accountId !== "string" ||
          !/^[a-f0-9]{24}$/.test(body.accountId)))
    )
      throw new SyncError(400, "Choose a supported Google account connection.");
    const start = await beginGoogle(
      body.features as "calendar" | "drive" | "both" | undefined,
      body.accountId as string | undefined,
    );
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
    const body =
      request.body && request.headers.get("content-length") !== "0"
        ? ((await readBody(request, 2000)) as { accountId?: unknown })
        : {};
    if (
      !body ||
      typeof body !== "object" ||
      (body.accountId !== undefined &&
        (typeof body.accountId !== "string" ||
          !/^[a-f0-9]{24}$/.test(body.accountId)))
    )
      throw new SyncError(400, "Choose a connected Google account.");
    await disconnectGoogle(body.accountId as string | undefined);
    return response({ disconnected: true });
  } catch (e) {
    return failure(e);
  }
}
