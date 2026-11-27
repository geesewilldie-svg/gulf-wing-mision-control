export const GGUF_METADATA_LIMIT = 1024 * 1024;
export type GgufMetadata = {
  version: number;
  tensorCount: number;
  metadataCount: number;
  metadataRead: number;
  metadataComplete: boolean;
  architecture: string | null;
  modelName: string | null;
  contextLength: number | null;
  embeddingLength: number | null;
  blockCount: number | null;
  bytesInspected: number;
};
// Little-endian GGUF v2/v3 metadata only. Tensor descriptors/data are not parsed.
export function parseGgufMetadata(bytes: Buffer): GgufMetadata {
  const input = bytes.subarray(0, GGUF_METADATA_LIMIT);
  let offset = 0;
  const limit = new Error("Metadata inspection limit");
  function take(n: number) {
    if (!Number.isSafeInteger(n) || n < 0) throw Error("Invalid GGUF length");
    if (offset + n > input.length) throw limit;
    const b = input.subarray(offset, offset + n);
    offset += n;
    return b;
  }
  const u32 = () => take(4).readUInt32LE();
  function u64() {
    const n = take(8).readBigUInt64LE();
    if (n > BigInt(Number.MAX_SAFE_INTEGER))
      throw Error("Unsupported GGUF length");
    return Number(n);
  }
  function string() {
    const n = u64();
    const b = take(n);
    return n <= 512
      ? new TextDecoder("utf-8", { fatal: true }).decode(b)
      : null;
  }
  const widths = [1, 1, 2, 2, 4, 4, 4, 1, 0, 0, 8, 8, 8];
  function value(type: number): string | number | null {
    if (type === 8) return string();
    if (type === 9) {
      const element = u32(),
        count = u64();
      if (element === 9 || element > 12) throw Error("Unsupported GGUF array");
      if (element === 8) {
        if (count > GGUF_METADATA_LIMIT / 8) throw limit;
        for (let i = 0; i < count; i++) string();
      } else take(count * widths[element]);
      return null;
    }
    if (type > 12) throw Error("Unsupported GGUF value");
    const b = take(widths[type]);
    switch (type) {
      case 0:
        return b.readUInt8();
      case 1:
        return b.readInt8();
      case 2:
        return b.readUInt16LE();
      case 3:
        return b.readInt16LE();
      case 4:
        return b.readUInt32LE();
      case 5:
        return b.readInt32LE();
      case 10: {
        const n = b.readBigUInt64LE();
        return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : null;
      }
      case 11: {
        const n = b.readBigInt64LE();
        return n >= BigInt(Number.MIN_SAFE_INTEGER) &&
          n <= BigInt(Number.MAX_SAFE_INTEGER)
          ? Number(n)
          : null;
      }
      default:
        return null;
    }
  }
  if (!take(4).equals(Buffer.from("GGUF"))) throw Error("Not a GGUF file");
  const version = u32();
  if (version !== 2 && version !== 3)
    throw Error("Unsupported GGUF version or byte order");
  const tensorCount = u64(),
    metadataCount = u64();
  if (metadataCount > 100000 || tensorCount > 1000000)
    throw Error("Unsupported GGUF counts");
  const fields = new Map<string, string | number | null>();
  let metadataRead = 0;
  try {
    for (; metadataRead < metadataCount; metadataRead++) {
      const key = string();
      if (!key || fields.has(key)) throw Error("Invalid or duplicate GGUF key");
      fields.set(key, value(u32()));
    }
  } catch (error) {
    if (error !== limit) throw error;
  }
  const text = (key: string) => {
    const v = fields.get(key);
    return typeof v === "string" &&
      v.length <= 160 &&
      !/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(v)
      ? v
      : null;
  };
  const architecture = text("general.architecture");
  const integer = (suffix: string) => {
    const n = architecture ? fields.get(architecture + suffix) : null;
    return typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : null;
  };
  return {
    version,
    tensorCount,
    metadataCount,
    metadataRead,
    metadataComplete: metadataRead === metadataCount,
    architecture,
    modelName: text("general.name"),
    contextLength: integer(".context_length"),
    embeddingLength: integer(".embedding_length"),
    blockCount: integer(".block_count"),
    bytesInspected: input.length,
  };
}
