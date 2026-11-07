export const candidateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "files", "testNotes"],
  properties: {
    summary: { type: "string", maxLength: 2000 },
    files: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "content"],
        properties: {
          path: { type: "string", maxLength: 160 },
          content: { type: "string", maxLength: 12000 },
        },
      },
    },
    testNotes: { type: "string", maxLength: 1000 },
  },
} as const;
export type CodeCandidate = {
  summary: string;
  files: { path: string; content: string }[];
  testNotes: string;
};
export function validateCandidate(value: unknown): CodeCandidate {
  const v = value as CodeCandidate;
  const plain = (x: unknown, n: number) =>
    typeof x === "string" &&
    x.trim().length > 0 &&
    x.length <= n &&
    !x.includes("\0");
  if (
    !v ||
    typeof v !== "object" ||
    Object.keys(v).some(
      (k) => !["summary", "files", "testNotes"].includes(k),
    ) ||
    !plain(v.summary, 2000) ||
    !plain(v.testNotes, 1000) ||
    !Array.isArray(v.files) ||
    !v.files.length ||
    v.files.length > 8
  )
    throw Error("Candidate contract is invalid.");
  const seen = new Set<string>();
  for (const f of v.files) {
    if (
      !f ||
      Object.keys(f).some((k) => !["path", "content"].includes(k)) ||
      !plain(f.path, 160) ||
      !plain(f.content, 12000) ||
      !/^(src|tests|docs)\/[a-zA-Z0-9_./-]+\.(ts|tsx|json|md|css)$/.test(
        f.path,
      ) ||
      f.path
        .split("/")
        .some(
          (p) =>
            !p ||
            p.startsWith(".") ||
            p === "." ||
            p === ".." ||
            /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(p),
        ) ||
      seen.has(f.path.toLowerCase())
    )
      throw Error("Candidate path/content is unsafe or duplicated.");
    seen.add(f.path.toLowerCase());
  }
  if (new TextEncoder().encode(JSON.stringify(v)).length > 30000)
    throw Error("Candidate exceeds the artifact budget.");
  return v;
}
