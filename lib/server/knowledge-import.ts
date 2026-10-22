import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import readExcelFile from "read-excel-file/node";
import { validateDocuments, type KnowledgeDocument } from "@/lib/nexus";

export function checkWorkbookArchive(data: Buffer) {
  // Bound expanded ZIP entries before the workbook parser allocates XML strings.
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (data.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw Error("Invalid XLSX archive.");
  const count = data.readUInt16LE(end + 10);
  let offset = data.readUInt32LE(end + 16),
    expanded = 0;
  if (count > 1000 || count === 0)
    throw Error("Workbook has too many archive entries.");
  for (let i = 0; i < count; i++) {
    if (offset + 46 > data.length || data.readUInt32LE(offset) !== 0x02014b50)
      throw Error("Invalid workbook archive.");
    const size = data.readUInt32LE(offset + 24);
    if (data.readUInt16LE(offset + 8) & 1 || size > 16_000_000)
      throw Error("Encrypted or oversized workbook entry.");
    expanded += size;
    if (expanded > 32_000_000) throw Error("Workbook expands beyond 32 MB.");
    offset +=
      46 +
      data.readUInt16LE(offset + 28) +
      data.readUInt16LE(offset + 30) +
      data.readUInt16LE(offset + 32);
  }
}
export async function extractKnowledge(
  name: string,
  data: Buffer,
): Promise<{
  documents: KnowledgeDocument[];
  prefix: string;
  warnings: string[];
}> {
  if (!name || name.length > 200 || !data.length || data.length > 2_000_000)
    throw Error(
      "Use a nonempty file below 2 MB with a name under 200 characters.",
    );
  const prefix =
    "upload-" +
    createHash("sha256").update(name).digest("hex").slice(0, 24) +
    ":";
  const documents: KnowledgeDocument[] = [];
  const warnings: string[] = [];
  const add = (text: string, location: string) => {
    text = text.trim();
    for (let offset = 0; offset < text.length; offset += 7000)
      documents.push({
        id: prefix + documents.length,
        source: name,
        location: location + (offset ? " (continued)" : ""),
        text: text.slice(offset, offset + 7000),
      });
  };
  const extension = name.toLowerCase().split(".").pop();
  if (extension === "pdf") {
    if (!data.subarray(0, 5).equals(Buffer.from("%PDF-")))
      throw Error("This file is not a PDF.");
    const pdf = await getDocumentProxy(new Uint8Array(data), {
      maxImageSize: 16_000_000,
    });
    try {
      if (pdf.numPages > 100) throw Error("Use PDFs of at most 100 pages.");
      const { text } = await extractText(pdf, { mergePages: false });
      text.forEach((page, i) => add(page, "Page " + (i + 1)));
      if (!documents.length)
        throw Error("No text found. Scanned PDFs need OCR before import.");
    } finally {
      await pdf.loadingTask.destroy();
    }
  } else if (extension === "xlsx") {
    checkWorkbookArchive(data);
    const sheets = await readExcelFile(data);
    if (sheets.length > 40)
      throw Error("Use a workbook with at most 40 sheets.");
    for (const sheet of sheets) {
      if (sheet.data.length > 5000)
        throw Error("Keep each sheet below 5,000 rows.");
      for (let start = 0; start < sheet.data.length; start += 20) {
        const rows = sheet.data
          .slice(start, start + 20)
          .map(
            (row, i) =>
              "Row " +
              (start + i + 1) +
              ": " +
              row
                .map(
                  (cell, j) =>
                    "C" +
                    (j + 1) +
                    "=" +
                    (cell instanceof Date
                      ? cell.toISOString()
                      : String(cell ?? "")),
                )
                .join(" | "),
          )
          .filter((row) => row.length > 20)
          .join("\n");
        if (rows)
          add(
            "Workbook values are cached spreadsheet values, not recalculated formulas or verified actual results.\n" +
              rows,
            "Sheet " +
              sheet.sheet +
              " · rows " +
              (start + 1) +
              "–" +
              Math.min(start + 20, sheet.data.length),
          );
      }
    }
    warnings.push(
      "Workbook formulas were not recalculated; cached values may be missing or stale. Forecasts are not actual results.",
    );
  } else if (extension === "json") {
    const parsed = validateDocuments(JSON.parse(data.toString("utf8")));
    parsed.forEach((d) =>
      documents.push({ ...d, id: prefix + documents.length }),
    );
  } else if (extension === "md" || extension === "txt") {
    add(data.toString("utf8"), "Imported note");
  } else
    throw Error("Choose PDF, XLSX, Markdown, text or a JSON knowledge pack.");
  if (!documents.length) throw Error("No readable document sections found.");
  validateDocuments(documents);
  return { documents, prefix, warnings };
}
