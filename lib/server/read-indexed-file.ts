import path from "node:path";
import type { IndexedFile } from "../local-files";
import type { FileIntent } from "../file-intent";
import { SyncError } from "./sync-store";

export function readIndexedFile(
  intent: Extract<FileIntent, { kind: "read" }>,
  files: IndexedFile[],
  warnings: string[],
) {
  if (
    !Number.isSafeInteger(intent.part) ||
    intent.part < 1 ||
    intent.part > 100000
  )
    throw new SyncError(400, "Choose a valid indexed-file part.");
  const reference = /^([a-f0-9]{24})@([a-f0-9]{64})$/i.exec(intent.target);
  const target = intent.target.toLowerCase();
  const matches = files.filter((file) =>
    reference
      ? file.id === reference[1].toLowerCase()
      : file.id === target ||
        file.name.toLowerCase() === target ||
        path.posix.basename(file.name).toLowerCase() === target,
  );
  const file = matches.length === 1 ? matches[0] : null;
  const base = {
    engine: "Nexus laptop files",
    warnings,
    routing: {
      mode: "local",
      selected: [],
      reason:
        "Current indexed text from a selected folder; no model, cloud provider or source-file edit.",
    },
  };
  if (!file)
    return {
      ...base,
      sources: [],
      fileRead: null,
      fileChoices: matches
        .map((file) => ({
          id: file.id,
          hash: file.hash,
          name: file.documents[0]?.source || file.name,
        }))
        .slice(0, 20),
      answer: matches.length
        ? "More than one current file has that name. Select a file below; nothing was guessed."
        : "That file is not available in the current selected-folder index. Search again or refresh; changed and unavailable files are withheld.",
    };
  if (reference && file.hash !== reference[2].toLowerCase())
    throw new SyncError(
      409,
      "This file changed since it was selected. Search again and start reading the current version.",
    );
  if (intent.part > 1 && !reference)
    throw new SyncError(
      409,
      "Start with part 1, then use the next-part control to keep reading the same file version.",
    );
  const parts = file.documents.flatMap((document) => {
    const chunks = [];
    for (let offset = 0; offset < document.text.length; offset += 3000)
      chunks.push({
        ...document,
        text: document.text.slice(offset, offset + 3000),
      });
    return chunks;
  });
  const source = parts[intent.part - 1];
  if (!source)
    throw new SyncError(
      404,
      "That part is not present in the indexed text. Start reading the file again.",
    );
  return {
    ...base,
    sources: [source],
    fileChoices: [],
    fileRead: {
      name: file.name,
      id: file.id,
      hash: file.hash,
      part: intent.part,
      totalParts: parts.length,
    },
    answer: `${source.source} · ${source.location}\nPart ${intent.part} of ${parts.length} of indexed text:\n\n${source.text}\n\n${intent.part < parts.length ? "More indexed text is available using Next part." : "End of indexed text; this does not establish that every page or original-file element was extracted."}`,
  };
}
