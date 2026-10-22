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
async function writeKnowledge(value: unknown) {
  let documents;
  try {
    documents = validateDocuments(value);
  } catch (error) {
    throw new SyncError(400, (error as Error).message);
  }
  if (Buffer.byteLength(JSON.stringify(documents)) > 2_000_000)
    throw new SyncError(413, "Keep the knowledge index below 2 MB.");
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
const knowledgeGlobal = globalThis as typeof globalThis & {
  gwKnowledgeQueue?: Promise<unknown>;
};
export function saveKnowledge(value: unknown) {
  const update = (knowledgeGlobal.gwKnowledgeQueue ?? Promise.resolve())
    .catch(() => {})
    .then(() => writeKnowledge(value));
  knowledgeGlobal.gwKnowledgeQueue = update.catch(() => {});
  return update;
}
export function mergeKnowledge(
  documents: KnowledgeDocument[],
  prefixes: string[],
) {
  const update = (knowledgeGlobal.gwKnowledgeQueue ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const current = await readKnowledge();
      const incoming = new Set(documents.map((d) => d.id));
      const merged = [
        ...current.filter(
          (d) =>
            !incoming.has(d.id) &&
            !prefixes.some((prefix) => d.id.startsWith(prefix)),
        ),
        ...documents,
      ];
      await writeKnowledge(merged);
      return {
        sections: merged.length,
        imported: documents.length,
        sources: [...new Set(documents.map((d) => d.source))],
      };
    });
  knowledgeGlobal.gwKnowledgeQueue = update.catch(() => {});
  return update;
}
export async function configuredLocalModel(): Promise<string | null> {
  if (process.env.GW_NEXUS_MODEL?.trim())
    return process.env.GW_NEXUS_MODEL.trim();
  try {
    const raw = JSON.parse(
      await fs.readFile(
        path.join(path.dirname(file()), "nexus-config.json"),
        "utf8",
      ),
    );
    if (
      raw.version !== 1 ||
      typeof raw.model !== "string" ||
      raw.model.length > 120 ||
      !/^[a-z0-9][a-z0-9._/-]*(?::[a-z0-9._-]+)?$/i.test(raw.model)
    )
      throw new Error();
    return raw.model;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new SyncError(
      503,
      "Nexus model settings could not be read. Run local AI setup to check the saved configuration.",
    );
  }
}
export async function localModelReady() {
  const model = await configuredLocalModel();
  if (!model) return false;
  try {
    const result = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    const body = await result.json();
    return (
      result.ok &&
      Array.isArray(body.models) &&
      body.models.some((m: { name: string }) => m.name === model)
    );
  } catch {
    return false;
  }
}
