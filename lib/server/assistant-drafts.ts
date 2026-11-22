import { createHash } from "node:crypto";
import {
  mkdirSync,
  lstatSync,
  realpathSync,
  openSync,
  closeSync,
  fstatSync,
  readSync,
  writeFileSync,
  constants,
} from "node:fs";
import path from "node:path";
import { scopes } from "../foundation/contracts";
import { withStore } from "./foundation/store";
import { SyncError } from "./sync-store";
const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const limit = 40000;
function directory() {
  const dir = path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
    "assistant-drafts",
  );
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stat = lstatSync(dir),
    actual = realpathSync(dir);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (process.platform === "win32"
      ? actual.toLowerCase() !== dir.toLowerCase()
      : actual !== dir)
  )
    throw new SyncError(
      409,
      "The managed draft directory is redirected or unavailable. Nothing was written.",
    );
  return dir;
}
function readFile(id: string) {
  const file = path.join(directory(), id + ".md");
  let fd: number;
  try {
    if (lstatSync(file).isSymbolicLink())
      throw new SyncError(409, "Draft links are not supported.");
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError(
      409,
      "The draft file is missing or unavailable. Nothing was changed.",
    );
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit)
      throw new SyncError(409, "Draft is unavailable or changed.");
    const buffer = Buffer.alloc(limit + 1);
    const size = readSync(fd, buffer, 0, buffer.length, 0);
    if (size > limit) throw new SyncError(409, "Draft exceeds its size limit.");
    return buffer.subarray(0, size);
  } finally {
    closeSync(fd);
  }
}
export function saveAssistantDraft(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new SyncError(400, "Review and confirm a draft first.");
  const data = input as Record<string, unknown>;
  if (
    Object.keys(data).some(
      (key) =>
        !["requestId", "title", "scope", "text", "confirmed"].includes(key),
    ) ||
    data.confirmed !== true ||
    typeof data.requestId !== "string" ||
    !/^[a-zA-Z0-9-]{16,80}$/.test(data.requestId) ||
    typeof data.title !== "string" ||
    !data.title.trim() ||
    data.title.length > 80 ||
    /[\x00-\x1f\x7f]/.test(data.title) ||
    typeof data.text !== "string" ||
    !data.text.trim() ||
    Buffer.byteLength(data.text) > limit ||
    data.text.includes("\0") ||
    !scopes.includes(data.scope as any)
  )
    throw new SyncError(
      400,
      "Confirm a title up to 80 characters, a workspace and nonempty draft text up to 40,000 UTF-8 bytes. Paths and overwrite options are not accepted.",
    );
  const title = data.title.trim(),
    content = Buffer.from(data.text),
    hash = digest(content),
    id = digest(data.requestId).slice(0, 32);
  return withStore((db) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const old = db
        .prepare("SELECT * FROM assistant_drafts WHERE request_id=?")
        .get(data.requestId as string) as any;
      if (
        old &&
        (old.title !== title || old.scope !== data.scope || old.hash !== hash)
      )
        throw new SyncError(
          409,
          "That draft request reference already belongs to different content.",
        );
      if (!old) {
        if (
          (db.prepare("SELECT count(*) n FROM assistant_drafts").get() as any)
            .n >= 500
        )
          throw new SyncError(
            409,
            "The managed draft limit is reached. No file was written.",
          );
        try {
          writeFileSync(path.join(directory(), id + ".md"), content, {
            flag: "wx",
            mode: 0o600,
          });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
      }
      if (digest(readFile(id)) !== hash)
        throw new SyncError(
          409,
          "The draft file is changed or incomplete. Nothing was overwritten; create a new reviewed draft.",
        );
      if (!old)
        db.prepare("INSERT INTO assistant_drafts VALUES(?,?,?,?,?,?,?)").run(
          id,
          data.requestId as string,
          title,
          data.scope as string,
          hash,
          content.length,
          new Date().toISOString(),
        );
      const saved = db
        .prepare(
          "SELECT id,title,scope,hash,bytes,created_at FROM assistant_drafts WHERE id=?",
        )
        .get(id);
      db.exec("COMMIT");
      return saved;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  });
}
export function listAssistantDrafts(scope: string) {
  if (!scopes.includes(scope as any))
    throw new SyncError(400, "Choose a supported workspace.");
  return withStore((db) =>
    db
      .prepare(
        "SELECT id,title,scope,hash,bytes,created_at FROM assistant_drafts WHERE scope=? ORDER BY created_at DESC,rowid DESC LIMIT 20",
      )
      .all(scope),
  );
}
export function downloadAssistantDraft(id: string) {
  if (!/^[a-f0-9]{32}$/.test(id))
    throw new SyncError(400, "Choose a saved draft reference.");
  const row = withStore((db) =>
    db.prepare("SELECT hash FROM assistant_drafts WHERE id=?").get(id),
  ) as { hash: string } | undefined;
  if (!row) throw new SyncError(404, "Saved draft not found.");
  const data = readFile(id);
  if (digest(data) !== row.hash)
    throw new SyncError(
      409,
      "The saved file changed. Its original content cannot be confirmed.",
    );
  return data;
}
