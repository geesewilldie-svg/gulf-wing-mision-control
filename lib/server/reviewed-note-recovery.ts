import { createHmac, timingSafeEqual } from "node:crypto";
import { config, SyncError } from "./sync-store";
import { savedNoteRoot, trackSavedNote, type Identity } from "./note-versions";
import { indexSavedSnapshot } from "./local-files";
type Saved = { file: { rootId: string; name: string }; sha256: string };
type Recovery = {
  version: 1;
  expiresAt: number;
  saved: Saved;
  identity: Identity;
  proof: { rootIdentity: string; savedAt: string };
};
const sign = (payload: string, secret: string) =>
  createHmac("sha256", secret)
    .update("nexus-reviewed-note-recovery-v1:" + payload)
    .digest();
export async function reviewedRecoveryToken(
  saved: Saved,
  identity: Identity,
): Promise<string | null> {
  try {
    const rootIdentity = await savedNoteRoot(saved),
      settings = await config();
    if (!rootIdentity || !settings) return null;
    const data: Recovery = {
      version: 1,
      expiresAt: Date.now() + 30 * 60 * 1000,
      saved,
      identity: { ...identity, producer: "reviewed" },
      proof: { rootIdentity, savedAt: new Date().toISOString() },
    };
    const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
    return (
      payload +
      "." +
      sign(payload, settings.signingSecret).toString("base64url")
    );
  } catch {
    return null;
  }
}
export async function recoverReviewedNote(body: any) {
  if (
    !body ||
    Object.keys(body).some((key) => !["op", "token"].includes(key)) ||
    typeof body.token !== "string" ||
    body.token.length > 8000
  )
    throw new SyncError(
      400,
      "Use the recovery control from a confirmed vault save.",
    );
  const settings = await config();
  const [payload, signature, extra] = body.token.split(".");
  if (
    !settings ||
    !payload ||
    !signature ||
    extra ||
    !/^[A-Za-z0-9_-]+$/.test(payload) ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  )
    throw new SyncError(403, "Vault metadata recovery proof is invalid.");
  const expected = sign(payload, settings.signingSecret),
    supplied = Buffer.from(signature, "base64url");
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    throw new SyncError(403, "Vault metadata recovery proof is invalid.");
  let data: Recovery;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new SyncError(400, "Vault metadata recovery proof is invalid.");
  }
  if (
    data.version !== 1 ||
    !Number.isSafeInteger(data.expiresAt) ||
    data.expiresAt <= Date.now() ||
    data.expiresAt > Date.now() + 30 * 60 * 1000 ||
    data.identity?.producer !== "reviewed" ||
    !data.proof?.rootIdentity
  )
    throw new SyncError(
      409,
      "Vault metadata recovery proof expired or is unsupported. The saved file is retained; do not republish it to retry metadata.",
    );
  if ((await savedNoteRoot(data.saved)) !== data.proof.rootIdentity)
    throw new SyncError(
      409,
      "Saved file or selected vault changed or is unavailable. No metadata or source file was rewritten.",
    );
  const tracking = await trackSavedNote(data.saved, data.identity, data.proof);
  const indexed = await indexSavedSnapshot(data.saved.file, data.saved.sha256);
  return {
    state: "saved",
    tracking,
    indexing: indexed.state,
    notice:
      "Metadata retry only. The existing Markdown note was not recreated or edited.",
  };
}
