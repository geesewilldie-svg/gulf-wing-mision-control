import {
  COOKIE,
  SyncError,
  checkCode,
  config,
  failure,
  limitPairing,
  readBody,
  response,
  sameOrigin,
  session,
  token,
} from "@/lib/server/sync-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const settings = await config();
    const identity = settings ? session(request, settings) : null;
    return response({
      enabled: !!settings,
      paired: !!identity,
      role: identity?.role ?? null,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    limitPairing();
    const settings = await config();
    if (!settings)
      throw new SyncError(
        503,
        "Run npm run sync:setup on your Windows laptop first.",
      );
    const body = (await readBody(request, 4096)) as {
      code?: unknown;
      role?: unknown;
    };
    if (
      !body ||
      typeof body.code !== "string" ||
      body.code.length > 100 ||
      !checkCode(body.code.trim(), settings)
    )
      throw new SyncError(401, "Pairing code not recognized.");
    if (body.role !== "controller" && body.role !== "display")
      throw new SyncError(400, "Choose controller or display access.");
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return response({ paired: true, role: body.role }, 200, {
      "Set-Cookie": `${COOKIE}=${token(settings, body.role)}; HttpOnly; SameSite=Strict; Path=/api/sync; Max-Age=86400${secure}`,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    return response({ paired: false }, 200, {
      "Set-Cookie": `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/sync; Max-Age=0`,
    });
  } catch (error) {
    return failure(error);
  }
}
