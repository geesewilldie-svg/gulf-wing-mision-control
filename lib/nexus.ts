export type KnowledgeDocument = {
  id: string;
  source: string;
  location: string;
  text: string;
};
export const connections = [
  [
    "ChatGPT",
    "General business analysis",
    "Provider API access required; ChatGPT subscription is separate.",
  ],
  ["Claude", "Research and document review", "Anthropic API access required."],
  [
    "Gemini",
    "Multimodal research",
    "Google model access and quota verification required.",
  ],
  [
    "GitHub Copilot",
    "Software and code review",
    "Copilot SDK authorization and entitlement required.",
  ],
  [
    "Microsoft Copilot",
    "Microsoft business workflows",
    "Account and supported integration must be verified.",
  ],
  [
    "Codex",
    "Software implementation",
    "Supported agent runtime authorization required.",
  ],
  [
    "Hermes",
    "Operational workflows",
    "Installed runtime and authenticated adapter required.",
  ],
  [
    "OpenClaw",
    "Approved tool workflows",
    "Local gateway and scoped adapter required.",
  ],
  [
    "Google Workspace",
    "Drive, Gmail and Calendar",
    "Read-only OAuth scopes must be approved first.",
  ],
  [
    "Meta Ads",
    "Facebook and Instagram marketing",
    "Ads API authorization required. No spend enabled.",
  ],
  [
    "Google Ads",
    "Search advertising",
    "OAuth and developer access required. No spend enabled.",
  ],
  [
    "LinkedIn",
    "Professional outreach",
    "Account type and API permissions require verification.",
  ],
] as const;
export function validateDocuments(value: unknown): KnowledgeDocument[] {
  if (!Array.isArray(value) || !value.length || value.length > 1000)
    throw new Error("Import 1–1,000 document sections.");
  const seen = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== "object")
      throw new Error("Invalid document section.");
    const d = item as KnowledgeDocument;
    if (
      ![d.id, d.source, d.location, d.text].every(
        (v) => typeof v === "string" && v.trim(),
      ) ||
      d.id.length > 200 ||
      d.source.length > 240 ||
      d.location.length > 240 ||
      d.text.length > 30000 ||
      seen.has(d.id)
    )
      throw new Error("Invalid or duplicate document section.");
    seen.add(d.id);
    return { id: d.id, source: d.source, location: d.location, text: d.text };
  });
}
export function searchDocuments(documents: KnowledgeDocument[], query: string) {
  const terms = [
    ...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []),
  ].filter(
    (word) =>
      ![
        "the",
        "and",
        "what",
        "does",
        "with",
        "from",
        "have",
        "that",
        "this",
        "how",
        "are",
        "our",
      ].includes(word),
  );
  return documents
    .map((document) => {
      const text = `${document.source} ${document.text}`.toLowerCase();
      return {
        ...document,
        score: terms.reduce(
          (score, term) => score + (text.includes(term) ? 1 : 0),
          0,
        ),
      };
    })
    .filter((document) => document.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
export function estimateService(
  hours: number,
  wage: number,
  burden: number,
  materials: number,
  margin: number,
) {
  const cost = hours * wage * (1 + burden / 100) + materials;
  return { cost, price: cost / (1 - margin / 100) };
}
