import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { validateDocuments, type KnowledgeDocument } from "../nexus";
import { SyncError } from "./sync-store";
const file = () =>
  path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
    "knowledge.json",
  );
export async function readKnowledge(): Promise<KnowledgeDocument[]> {
  try {
    return validateDocuments(JSON.parse(await fs.readFile(file(), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new SyncError(
      503,
      "Knowledge storage could not be read. Existing files are preserved.",
    );
  }
}
export async function saveKnowledge(value: unknown) {
  let documents;
  try {
    documents = validateDocuments(value);
  } catch (error) {
    throw new SyncError(400, (error as Error).message);
  }
  const target = file(),
    temporary = `${target}.${randomBytes(8).toString("hex")}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  try {
    await fs.writeFile(temporary, JSON.stringify(documents), {
      mode: 0o600,
      flag: "wx",
    });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  return documents.length;
}
export async function localModelReady() {
  if (!process.env.GW_NEXUS_MODEL) return false;
  try {
    const result = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    const body = await result.json();
    return (
      result.ok &&
      Array.isArray(body.models) &&
      body.models.some(
        (m: { name: string }) => m.name === process.env.GW_NEXUS_MODEL,
      )
    );
  } catch {
    return false;
  }
}
