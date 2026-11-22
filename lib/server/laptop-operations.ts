import { randomBytes, randomUUID } from "node:crypto";
import { withStore } from "./foundation/store";
import { SyncError } from "./sync-store";
import type { MaintenanceAction } from "./maintenance";

export type LaptopOperation = {
  id: string;
  action: MaintenanceAction;
  outcome:
    | "running"
    | "complete"
    | "needs-attention"
    | "not-started"
    | "unknown";
  message: string;
};
const receipt = (row: any): LaptopOperation => ({
  id: row.id,
  action: row.action,
  outcome: row.state,
  message: row.message,
});
function expire(db: Parameters<Parameters<typeof withStore>[0]>[0]) {
  db.prepare(
    "UPDATE laptop_operations SET state='unknown',message=?,updated_at=? WHERE state='running' AND expires<=?",
  ).run(
    "No final result was recorded before the operation deadline. Check laptop logs and current services; this request will not be automatically repeated.",
    new Date().toISOString(),
    Date.now(),
  );
}
export function claimLaptopOperation(
  action: MaintenanceAction,
  requestId: unknown,
  timeout: number,
) {
  const key = requestId === undefined ? randomUUID() : requestId;
  if (typeof key !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(key))
    throw new SyncError(400, "Invalid laptop operation request reference.");
  return withStore((db) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      expire(db);
      const old = db
        .prepare("SELECT * FROM laptop_operations WHERE request_id=?")
        .get(key) as any;
      if (old && old.action !== action)
        throw new SyncError(
          409,
          "This request reference already belongs to a different operation.",
        );
      if (old) {
        db.exec("COMMIT");
        return { execute: false, receipt: receipt(old) };
      }
      if (
        db
          .prepare("SELECT id FROM laptop_operations WHERE state='running'")
          .get()
      )
        throw new SyncError(
          409,
          "A laptop maintenance operation is already running.",
        );
      const id = randomBytes(12).toString("hex"),
        at = new Date().toISOString();
      db.prepare(
        "INSERT INTO laptop_operations VALUES(?,?,?,'running',?,?,?,?)",
      ).run(
        id,
        key,
        action,
        "Operation accepted; no final result is recorded yet.",
        at,
        at,
        Date.now() + timeout + 60000,
      );
      const row = db
        .prepare("SELECT * FROM laptop_operations WHERE id=?")
        .get(id);
      db.exec("COMMIT");
      return { execute: true, receipt: receipt(row) };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  });
}
export function finishLaptopOperation(
  id: string,
  outcome: LaptopOperation["outcome"],
  message: string,
) {
  return withStore((db) => {
    expire(db);
    const changed = db
      .prepare(
        "UPDATE laptop_operations SET state=?,message=?,updated_at=? WHERE id=? AND state='running'",
      )
      .run(outcome, message, new Date().toISOString(), id);
    if (!changed.changes)
      throw new SyncError(
        409,
        "Operation is no longer current. Inspect its saved status.",
      );
    return receipt(
      db.prepare("SELECT * FROM laptop_operations WHERE id=?").get(id),
    );
  });
}
export function laptopOperation(id: string): LaptopOperation {
  if (!/^[a-f0-9]{24}$/i.test(id))
    throw new SyncError(
      400,
      "Use the operation reference shown in the maintenance response.",
    );
  return withStore((db) => {
    expire(db);
    const row = db
      .prepare("SELECT * FROM laptop_operations WHERE id=?")
      .get(id.toLowerCase());
    if (!row)
      throw new SyncError(
        404,
        "No saved laptop operation has that reference. Older audit-only operations are not imported.",
      );
    return receipt(row);
  });
}
export function recentLaptopOperations(): LaptopOperation[] {
  return withStore((db) => {
    expire(db);
    return db
      .prepare(
        "SELECT * FROM laptop_operations ORDER BY started_at DESC,rowid DESC LIMIT 10",
      )
      .all()
      .map(receipt);
  });
}
