import { FRAME_MAX_BYTES } from "./local-frame-analysis";
// Browser canvas encoders may include an ICC color profile. Remove optional
// APP1..APP15/comment segments before the first scan; the server independently
// validates the resulting full marker envelope. Never fetch or decode a URL.
export function stripFrameMetadata(bytes: Uint8Array): Uint8Array {
  if (
    bytes.length < 4 ||
    bytes.length > FRAME_MAX_BYTES + 65536 ||
    bytes[0] !== 255 ||
    bytes[1] !== 216
  )
    throw Error("The browser frame encoding is unsupported or too large.");
  const chunks: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset < bytes.length) {
    const start = offset;
    if (bytes[offset++] !== 255) break;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (offset + 2 > bytes.length) break;
    const length = bytes[offset] * 256 + bytes[offset + 1],
      end = offset + length;
    if (length < 2 || end > bytes.length) break;
    if (marker === 218) {
      chunks.push(bytes.subarray(start));
      const size = chunks.reduce((n, chunk) => n + chunk.length, 0);
      if (size > FRAME_MAX_BYTES)
        throw Error("This frame exceeds the local image limit.");
      const result = new Uint8Array(size);
      let position = 0;
      for (const chunk of chunks) {
        result.set(chunk, position);
        position += chunk.length;
      }
      return result;
    }
    if (!(marker >= 225 && marker <= 239) && marker !== 254)
      chunks.push(bytes.subarray(start, end));
    offset = end;
  }
  throw Error("The browser JPEG frame is incomplete.");
}
