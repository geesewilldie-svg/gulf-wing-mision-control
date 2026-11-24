import path from "node:path";
import { SyncError } from "./sync-store";
const formats: Record<
  string,
  { mime: string; view: "picture" | "document" | "download" }
> = {
  ".pdf": { mime: "application/pdf", view: "document" },
  ".md": { mime: "text/plain; charset=utf-8", view: "document" },
  ".txt": { mime: "text/plain; charset=utf-8", view: "document" },
  ".csv": { mime: "text/plain; charset=utf-8", view: "document" },
  ".png": { mime: "image/png", view: "picture" },
  ".jpg": { mime: "image/jpeg", view: "picture" },
  ".jpeg": { mime: "image/jpeg", view: "picture" },
  ".xlsx": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    view: "download",
  },
  ".docx": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    view: "download",
  },
  ".pptx": {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    view: "download",
  },
};
export function resourceFormat(name: string, kind: string) {
  const extension = path.posix.extname(name).toLowerCase();
  if (kind === "obsidian" && extension !== ".md") return null;
  return formats[extension] ? { extension, ...formats[extension] } : null;
}
export function validateResourceBytes(
  data: Buffer,
  extension: string,
  download: boolean,
) {
  const invalid = () => {
    throw new SyncError(
      415,
      "The file does not match a supported document or picture format.",
    );
  };
  if (extension === ".pdf" && data.subarray(0, 5).toString("ascii") !== "%PDF-")
    invalid();
  if (
    [".xlsx", ".docx", ".pptx"].includes(extension) &&
    !data.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4]))
  )
    invalid();
  let width = 0,
    height = 0;
  if (extension === ".png") {
    if (
      data.length < 24 ||
      !data
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      data.subarray(12, 16).toString("ascii") !== "IHDR"
    )
      invalid();
    width = data.readUInt32BE(16);
    height = data.readUInt32BE(20);
  }
  if ([".jpg", ".jpeg"].includes(extension)) {
    if (data.length < 4 || data[0] !== 255 || data[1] !== 216) invalid();
    let position = 2;
    while (position < data.length) {
      if (data[position++] !== 255) break;
      while (position < data.length && data[position] === 255) position++;
      const marker = data[position++];
      if (marker === 217 || marker === 218 || position + 2 > data.length) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const length = data.readUInt16BE(position);
      if (length < 2 || position + length > data.length) break;
      if ([192, 193, 194].includes(marker) && length >= 7) {
        height = data.readUInt16BE(position + 3);
        width = data.readUInt16BE(position + 5);
        break;
      }
      position += length;
    }
  }
  if ([".png", ".jpg", ".jpeg"].includes(extension)) {
    if (!width || !height) invalid();
    if (
      !download &&
      (width > 16384 || height > 16384 || width * height > 32_000_000)
    )
      throw new SyncError(
        413,
        "Picture is too large for this browser preview. Use Download original file instead.",
      );
  }
}
