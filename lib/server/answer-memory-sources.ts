import type { KnowledgeDocument } from "@/lib/nexus";

// Retained exports are historical copies, not current owner context. Apply
// before ranking so even later chunks cannot reintroduce forgotten content.
// Group by displayed source: if one section identifies a snapshot, withhold
// every section of that source, including imported/renamed Markdown copies.
export function answerMemorySources(documents: KnowledgeDocument[]) {
  const retained = new Set<string>();
  for (const document of documents) {
    const source = document.source.replace(/\\/g, "/");
    if (
      /(?:^|[/·]\s*)Nexus Memory Snapshots(?:\/|$)/i.test(source) ||
      /^\s*# Nexus (?:owner memory|reviewed work note)\s*(?:\r?\n|$)/i.test(
        document.text,
      )
    )
      retained.add(document.source);
  }
  return {
    documents: documents.filter((document) => !retained.has(document.source)),
    withheldSources: retained.size,
  };
}
