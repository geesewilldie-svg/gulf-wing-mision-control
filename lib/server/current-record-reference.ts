import { createHmac, timingSafeEqual } from "node:crypto";
import { config, SyncError } from "./sync-store";
import { scopes } from "../foundation/contracts";
import {
  searchCurrentRecords,
  inspectCurrentRecord,
} from "./current-record-search";
import type { CurrentRecordSearch } from "../current-record-search";
const lifetime = 5 * 60 * 1000;
const sign = (payload: string, secret: string) =>
  createHmac("sha256", secret)
    .update("nexus-current-record-reference-v1:" + payload)
    .digest();
export async function currentRecordReference(
  results: CurrentRecordSearch,
  workScope: string,
): Promise<string> {
  const settings = await config();
  if (!settings)
    throw new SyncError(
      503,
      "Current search selection could not be prepared. Run a fresh search.",
    );
  return encodeReference(
    results,
    workScope,
    Date.now(),
    settings.signingSecret,
  );
}
function encodeReference(
  results: CurrentRecordSearch,
  workScope: string,
  issuedAt: number,
  secret: string,
) {
  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      issuedAt,
      expiresAt: issuedAt + lifetime,
      workScope,
      workspace: results.workspace,
      query: results.query,
      page: results.page,
      stamp: results.stamp,
    }),
  ).toString("base64url");
  return payload + "." + sign(payload, secret).toString("base64url");
}
async function readReference(
  token: unknown,
  workScope: string,
  signal: AbortSignal,
) {
  if (typeof token !== "string" || token.length > 2000)
    throw new SyncError(
      409,
      "Run a current-record search in this conversation before inspecting a result.",
    );
  const [payload, signature, extra] = token.split("."),
    settings = await config();
  if (
    !settings ||
    !payload ||
    !/^[A-Za-z0-9_-]+$/.test(payload) ||
    !signature ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature) ||
    extra
  )
    throw new SyncError(
      403,
      "Current search reference is invalid. Run a fresh search.",
    );
  const supplied = Buffer.from(signature, "base64url"),
    expected = sign(payload, settings.signingSecret);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected) ||
    supplied.toString("base64url") !== signature
  )
    throw new SyncError(
      403,
      "Current search reference is invalid. Run a fresh search.",
    );
  let data: any;
  try {
    const bytes = Buffer.from(payload, "base64url");
    if (bytes.toString("base64url") !== payload) throw Error();
    data = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new SyncError(400, "Current search reference is unsupported.");
  }
  const now = Date.now();
  if (
    !data ||
    Object.keys(data).length !== 8 ||
    Object.keys(data).some(
      (k) =>
        ![
          "version",
          "issuedAt",
          "expiresAt",
          "workScope",
          "workspace",
          "query",
          "page",
          "stamp",
        ].includes(k),
    ) ||
    data.version !== 1 ||
    !Number.isSafeInteger(data.issuedAt) ||
    !Number.isSafeInteger(data.expiresAt) ||
    data.expiresAt - data.issuedAt !== lifetime ||
    data.issuedAt > now + 5000 ||
    data.expiresAt <= now ||
    !Number.isInteger(data.page) ||
    data.page < 0 ||
    data.page > 74 ||
    data.workScope !== workScope ||
    !scopes.includes(data.workScope) ||
    !(data.workspace === "all" || data.workspace === workScope)
  )
    throw new SyncError(
      409,
      "Current search reference expired, changed workspace or is unsupported. Run a fresh search.",
    );
  signal.throwIfAborted();
  const value = {
    action: "search-current-records",
    workspace: data.workspace,
    query: data.query,
    page: data.page,
    stamp: data.stamp,
  };
  const found = searchCurrentRecords(value, signal);
  return { data, settings, value, found };
}
export async function pageConversationRecords(
  direction: "next" | "previous",
  token: unknown,
  workScope: string,
  signal: AbortSignal,
) {
  if (direction !== "next" && direction !== "previous")
    throw new SyncError(400, "Choose next or previous current results.");
  const { data, settings, value, found } = await readReference(
    token,
    workScope,
    signal,
  );
  const page = data.page + (direction === "next" ? 1 : -1);
  if (page < 0 || page * 20 >= found.matchedRecords)
    throw new SyncError(
      409,
      "There is no current result page in that direction. Run a fresh search.",
    );
  const recordSearch = searchCurrentRecords({ ...value, page }, signal);
  return {
    recordSearch,
    recordSearchReference: encodeReference(
      recordSearch,
      workScope,
      data.issuedAt,
      settings.signingSecret,
    ),
  };
}
export async function inspectConversationRecord(
  number: number,
  token: unknown,
  workScope: string,
  signal: AbortSignal,
) {
  if (!Number.isInteger(number) || number < 1 || number > 1500)
    throw new SyncError(400, "Choose a current result number from 1 to 1500.");
  const { value, found } = await readReference(token, workScope, signal);
  const row = found.records[number - found.page * 20 - 1];
  if (!row)
    throw new SyncError(
      409,
      "That result is not in the selected search page. Run a fresh search.",
    );
  const recordInspection = inspectCurrentRecord(
    {
      action: "inspect-current-record",
      workspace: found.workspace,
      type: row.type,
      id: row.id,
      revision: row.revision,
      contentHash: row.contentHash,
    },
    signal,
  );
  const recordSearch = searchCurrentRecords(value, signal); // Final whole-profile fence, not just the selected row.
  return { recordSearch, recordInspection, recordSearchReference: token };
}
