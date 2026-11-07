import {
  authorized,
  sameOrigin,
  readBody,
  response,
  failure,
  SyncError,
} from "@/lib/server/sync-store";
import {
  acknowledgeWorker,
  deleteTask,
  backupFoundation,
  snapshot,
  createTask,
  changeTask,
  saveMemory,
  deleteMemory,
  setPolicy,
  memoryContext,
} from "@/lib/server/foundation/store";
import {
  foundationCapabilities,
  scope,
  text,
} from "@/lib/foundation/contracts";
import {
  validateTaskCandidate,
  decideCandidate,
} from "@/lib/server/foundation/candidate-review";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await authorized(request, true);
    return response({ ...snapshot(), capabilities: foundationCapabilities });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await authorized(request, true);
    const body = (await readBody(request, 16000)) as any;
    if (!body || typeof body !== "object")
      throw new SyncError(400, "Choose a supported foundation operation.");
    try {
      switch (body.op) {
        case "candidate.validate":
          await validateTaskCandidate(body, request.signal);
          break;
        case "candidate.decide":
          decideCandidate(body);
          break;
        case "worker.acknowledge":
          acknowledgeWorker(body);
          break;
        case "task.create":
          createTask(body);
          break;
        case "task.delete":
          deleteTask(body);
          break;
        case "backup.create":
          return response({ filename: backupFoundation() });
        case "task.change":
          changeTask(body);
          break;
        case "memory.save":
          saveMemory(body);
          break;
        case "memory.delete":
          deleteMemory(body);
          break;
        case "policy.set":
          setPolicy(body);
          break;
        case "memory.search":
          return response({
            context: JSON.parse(
              memoryContext(scope(body.scope), text(body.query, 2000)),
            ),
          });
        default:
          throw new SyncError(400, "Unsupported foundation operation.");
      }
    } catch (e) {
      if (e instanceof SyncError) throw e;
      if (
        e instanceof Error &&
        /Enter text|Choose a supported workspace/.test(e.message)
      )
        throw new SyncError(400, e.message);
      throw e;
    }
    return response({ ...snapshot(), capabilities: foundationCapabilities });
  } catch (e) {
    return failure(e);
  }
}
