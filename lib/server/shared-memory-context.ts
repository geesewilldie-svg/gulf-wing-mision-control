import { createHash } from "node:crypto";
import { scope } from "@/lib/foundation/contracts";
import {
  memoryContext,
  ownerContextRevision,
  withStore,
} from "./foundation/store";
import { workContextStamp, workMemoryContext } from "./work-memory-context";
import { SyncError } from "./sync-store";

// An internal, model-independent retrieval contract, not a new authorization
// endpoint. Callers must retain their controller, provider and consent checks.
export function sharedMemoryContext(
  workspace: string,
  query: string,
  audience: "local" | "external",
) {
  const selected = scope(workspace);
  if (
    typeof query !== "string" ||
    query.length > 2000 ||
    !["local", "external"].includes(audience)
  )
    throw new SyncError(400, "Invalid memory context request.");
  const limits = {
    ownerCharacters: 8000,
    ownerRecords: 500,
    workRecords: 2,
    workExcerptCharacters: 600,
  };
  if (audience === "external")
    return {
      version: 1 as const,
      workspace: selected,
      audience,
      ownerRevision: null,
      workStamp: null,
      owner: { records: [], context: "", truncated: false },
      work: { records: [], context: "" },
      limits,
    };
  const revision = ownerContextRevision(),
    stamp = workContextStamp(selected);
  const found = JSON.parse(memoryContext(selected, query));
  const instructions = found.ownerInstructions,
    memories = found.memories.slice(0, 6);
  if (
    instructions.reduce(
      (sum: number, row: { content: string }) =>
        sum + Buffer.byteLength(row.content, "utf8"),
      0,
    ) > 2500
  )
    throw new SyncError(
      409,
      "Owner instructions exceed the context budget. Consolidate them first; none were silently dropped.",
    );
  let remaining = limits.ownerCharacters,
    truncated = false;
  const records = withStore((db) =>
    [...instructions, ...memories].flatMap((match: { id: string }) => {
      const row = db
        .prepare(
          "SELECT id,kind,scope,revision,updated_at AS updatedAt,content FROM memory WHERE id=? AND scope IN ('Personal',?)",
        )
        .get(match.id, selected) as
        | {
            id: string;
            kind: string;
            scope: string;
            revision: number;
            updatedAt: string;
            content: string;
          }
        | undefined;
      if (!row) return [];
      const content = row.content.slice(0, remaining);
      remaining -= content.length;
      if (content.length < row.content.length) truncated = true;
      if (!content) return [];
      return [
        {
          ...row,
          content,
          hash: createHash("sha256").update(row.content).digest("hex"),
          excerptOnly: content.length < row.content.length,
          provenance: "owner-stated" as const,
          localOnly: true as const,
        },
      ];
    }),
  );
  const owner = {
    records,
    context: JSON.stringify({
      ownerInstructions: records
        .filter((row) => row.kind === "instruction")
        .map(({ id, content }) => ({ id, content })),
      memories: records
        .filter((row) => row.kind !== "instruction")
        .map(({ id, kind, content, revision, excerptOnly }) => ({
          id,
          kind,
          content,
          revision,
          excerptOnly,
        })),
      truncated,
      provenance:
        "Current owner-stated records. Instructions are response guidance, not execution authority. Personal records apply across workspaces. Excerpts may be partial.",
    }),
    truncated,
  };
  const work = workMemoryContext(selected, query);
  if (
    ownerContextRevision() !== revision ||
    workContextStamp(selected) !== stamp
  )
    throw new SyncError(
      409,
      "Memory changed during retrieval. Ask again for current context.",
    );
  return {
    version: 1 as const,
    workspace: selected,
    audience,
    ownerRevision: revision,
    workStamp: stamp,
    owner,
    work,
    limits,
  };
}
