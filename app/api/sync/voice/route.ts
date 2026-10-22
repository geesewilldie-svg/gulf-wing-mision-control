import {
  authorized,
  failure,
  sameOrigin,
  SyncError,
} from "@/lib/server/sync-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let busy = false;
export async function GET(request: Request) {
  try {
    await authorized(request);
    const r = await fetch("http://127.0.0.1:8766/health", {
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });
    if (!r.ok) throw new Error();
    return Response.json(await r.json(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { available: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
export async function POST(request: Request) {
  let ownsSlot = false;
  try {
    sameOrigin(request);
    await authorized(request, true);
    const action = new URL(request.url).searchParams.get("action");
    if (!["speak", "transcribe"].includes(action ?? ""))
      throw new SyncError(400, "Unsupported voice action.");
    if (busy) throw new SyncError(429, "Voice is busy. Try again shortly.");
    busy = ownsSlot = true;
    const reader = request.body?.getReader();
    if (!reader) throw new SyncError(400, "Missing voice input.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8_000_000) {
        await reader.cancel();
        throw new SyncError(413, "Voice input exceeds 8 MB.");
      }
      chunks.push(value);
    }
    const r = await fetch(`http://127.0.0.1:8766/${action}`, {
      method: "POST",
      headers: {
        "Content-Type":
          request.headers.get("content-type") || "application/octet-stream",
      },
      body: Buffer.concat(chunks),
      signal: AbortSignal.timeout(120000),
    });
    if (!r.ok) throw new Error();
    return new Response(await r.arrayBuffer(), {
      headers: {
        "Content-Type": action === "speak" ? "audio/wav" : "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof SyncError) return failure(error);
    return Response.json(
      {
        error:
          "Local voice service unavailable. Start the optional voice worker on the laptop.",
      },
      { status: 503 },
    );
  } finally {
    if (ownsSlot) busy = false;
  }
}
