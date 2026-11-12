import {
  authorized,
  failure,
  sameOrigin,
  SyncError,
} from "@/lib/server/sync-store";
import {
  elevenSpeechStatus,
  disableElevenSpeech,
  generateElevenSpeech,
} from "@/lib/server/elevenlabs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await authorized(request, true);
    return Response.json(await elevenSpeechStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    return Response.json(await disableElevenSpeech(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    const reader = request.body?.getReader();
    if (!reader) throw new SyncError(400, "Missing speech request.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16000) {
        await reader.cancel();
        throw new SyncError(413, "Speech request is too large.");
      }
      chunks.push(value);
    }
    let value;
    try {
      value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new SyncError(400, "Invalid speech request.");
    }
    const audio = await generateElevenSpeech(value, request.signal);
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
