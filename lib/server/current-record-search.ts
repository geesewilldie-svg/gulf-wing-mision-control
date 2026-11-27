import { createHash } from "node:crypto";
import { scopes, type Scope } from "../foundation/contracts";
import type {
  CurrentRecord,
  CurrentRecordSearch,
  RecordWorkspace,
  CurrentRecordInspection,
} from "../current-record-search";
import { withStore } from "./foundation/store";
import { SyncError } from "./sync-store";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const bad = () => {
  throw new SyncError(
    400,
    "Choose a workspace and a plain-text query of up to 200 characters and eight words. Unsupported fields are not accepted.",
  );
};
const workspace = (v: unknown): RecordWorkspace =>
  v === "all" || scopes.includes(v as Scope) ? (v as RecordWorkspace) : bad();
function fields(v: any, allowed: string[], required: string[]) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(v, key))
  )
    bad();
}
const controls =
  /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/;
type Row = {
  id: string;
  revision: number;
  type: "owner" | "task";
  scope: Scope;
  kind: string;
  updatedAt: string;
  title: string;
  content: string;
  sourceTruncated: number;
};
function record(row: Row): CurrentRecord {
  return {
    id: row.id,
    revision: row.revision,
    type: row.type,
    scope: row.scope,
    kind: row.kind,
    updatedAt: row.updatedAt,
    title: row.title.slice(0, 180),
    excerpt: row.content.slice(0, 360),
    sourceTruncated: !!row.sourceTruncated,
    contentHash: hash(JSON.stringify(row)),
  };
}
// Only these live tables participate. Snapshot files/history/candidate reports are
// not sources. Bounds are applied before matching, never disguised as exhaustive.
function corpus(selected: RecordWorkspace) {
  return withStore((db) => {
    db.exec("BEGIN");
    try {
      const where =
        selected === "all"
          ? `scope IN (${scopes.map(() => "?").join(",")})`
          : "scope=?";
      const params = selected === "all" ? [...scopes] : [selected];
      const owner = db
        .prepare(
          `SELECT id,revision,'owner' AS type,scope,kind,updated_at AS updatedAt,substr(content,1,180) AS title,substr(content,1,1000) AS content,length(content)>1000 AS sourceTruncated FROM memory WHERE ${where} ORDER BY updated_at DESC,id LIMIT 500`,
        )
        .all(...params) as Row[];
      const tasks = db
        .prepare(
          `SELECT id,revision,'task' AS type,scope,state AS kind,updated_at AS updatedAt,substr(request,1,180) AS title,substr(request,1,2000)||char(10)||substr(output,1,20000) AS content,(length(request)>2000 OR length(output)>20000) AS sourceTruncated FROM tasks WHERE ${where} ORDER BY updated_at DESC,id LIMIT 1000`,
        )
        .all(...params) as Row[];
      const total = Number(
        (
          db
            .prepare(
              `SELECT (SELECT count(*) FROM memory WHERE ${where})+(SELECT count(*) FROM tasks WHERE ${where}) AS n`,
            )
            .get(...params, ...params) as any
        ).n,
      );
      db.exec("COMMIT");
      return { rows: [...owner, ...tasks], total };
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  });
}
export function searchCurrentRecords(
  value: any,
  signal: AbortSignal,
): CurrentRecordSearch {
  fields(
    value,
    ["action", "workspace", "query", "page", "stamp"],
    ["action", "workspace", "query", "page"],
  );
  if (
    value.action !== "search-current-records" ||
    typeof value.query !== "string" ||
    !value.query.trim() ||
    value.query.length > 200 ||
    controls.test(value.query) ||
    !Number.isInteger(value.page) ||
    value.page < 0 ||
    value.page > 74 ||
    (value.stamp !== undefined &&
      (typeof value.stamp !== "string" ||
        !/^[a-f0-9]{64}$/.test(value.stamp))) ||
    (value.page > 0 && !value.stamp)
  )
    bad();
  const selected = workspace(value.workspace),
    query: string = value.query.trim(),
    tokens = query.split(/\s+/);
  if (tokens.length > 8) bad();
  signal.throwIfAborted();
  const { rows, total } = corpus(selected);
  const stamp = hash(JSON.stringify({ selected, query, total, rows }));
  if (value.stamp && value.stamp !== stamp)
    throw new SyncError(
      409,
      "Current memory or tasks changed. Run a fresh search before paging.",
    );
  // Literal case-folded terms, not FTS/SQL syntax. Every term must occur in the
  // same bounded record, in any order; no fuzzy/semantic match is inferred.
  const terms = tokens.map((t) => t.toLowerCase());
  const matches = rows
    .filter((row) => {
      const content = row.content.toLowerCase();
      return terms.every((term) => content.includes(term));
    })
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) ||
        a.type.localeCompare(b.type) ||
        a.id.localeCompare(b.id),
    );
  if (value.page > 0 && value.page * 20 >= matches.length)
    throw new SyncError(
      409,
      "That result page is no longer available. Run a fresh search.",
    );
  signal.throwIfAborted();
  return {
    workspace: selected,
    query,
    page: value.page,
    stamp,
    readAt: new Date().toISOString(),
    totalRecords: total,
    scannedRecords: rows.length,
    matchedRecords: matches.length,
    outsideBudgetRecords: Math.max(0, total - rows.length),
    truncatedRecords: rows.filter((r) => r.sourceTruncated).length,
    pageSize: 20,
    records: matches.slice(value.page * 20, value.page * 20 + 20).map((row) => {
      const result = record(row),
        position = row.content.toLowerCase().indexOf(terms[0]);
      return {
        ...result,
        excerpt: row.content.slice(
          Math.max(0, position - 80),
          Math.max(0, position - 80) + 360,
        ),
      };
    }),
    notice:
      "Current Foundation owner memory and task records only. Every plain-text word must match the same bounded record. Owner-stated memory is separate from unverified task output; a recorded task state does not prove external completion. No files, snapshots, old revisions, provider request or automatic context change were used.",
  };
}
export function inspectCurrentRecord(
  value: any,
  signal: AbortSignal,
): CurrentRecordInspection {
  fields(
    value,
    ["action", "workspace", "type", "id", "revision", "contentHash"],
    ["action", "workspace", "type", "id", "revision", "contentHash"],
  );
  if (
    value.action !== "inspect-current-record" ||
    !["owner", "task"].includes(value.type) ||
    typeof value.id !== "string" ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(value.id) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    typeof value.contentHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.contentHash)
  )
    bad();
  const selected = workspace(value.workspace);
  signal.throwIfAborted();
  const { rows } = corpus(selected),
    row = rows.find((r) => r.id === value.id && r.type === value.type);
  if (
    !row ||
    row.revision !== value.revision ||
    record(row).contentHash !== value.contentHash
  )
    throw new SyncError(
      409,
      "This record changed, was removed or left the search profile. Run a fresh search; no old content was returned.",
    );
  signal.throwIfAborted();
  return {
    ...record(row),
    content: row.content,
    inspectedAt: new Date().toISOString(),
    provenance:
      row.type === "owner" ? "owner-stated" : "unverified-task-record",
  };
}
