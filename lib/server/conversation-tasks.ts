import type { TaskIntent } from "@/lib/task-intent";
import type { NexusTask } from "@/lib/foundation/contracts";
import {
  createTask,
  changeTask,
  listConversationTasks,
} from "./foundation/store";
import { SyncError } from "./sync-store";
export type TaskContext = { id: string; revision: number; scope: string };
const reference = (task: NexusTask): TaskContext => ({
  id: task.id,
  revision: task.revision,
  scope: task.scope,
});
const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function conversationTask(
  intent: TaskIntent,
  workspace: string,
  mode: string,
  requestId: unknown,
  context: unknown,
) {
  const base = {
    engine: "Nexus tasks",
    sources: [],
    warnings: [],
    routing: {
      mode,
      selected: [],
      reason:
        "Local saved task state. No external action or cloud-worker permission is granted by this command.",
    },
  };
  if (intent.kind === "create") {
    const id = createTask({
      request: intent.request,
      scope: workspace,
      mode: "plan",
      requestId,
    });
    const saved = listConversationTasks(workspace, 1000).find(
      (t) => t.id === id,
    )!;
    return {
      ...base,
      answer:
        saved.state === "accepted"
          ? `Saved your task in ${workspace}: ${intent.request}. It is recorded for planning; no action has started.`
          : `This task is already saved in ${workspace}: ${saved.request}. Status: ${saved.state}. ${saved.reason}. No duplicate record was created.`,
      task: reference(saved),
    };
  }
  if (intent.kind === "list") {
    const tasks = listConversationTasks(workspace);
    return {
      ...base,
      taskChoices: tasks.map((task) => ({
        ...reference(task),
        request: task.request,
        state: task.state,
      })),
      answer: tasks.length
        ? `Your latest tasks in ${workspace}: ` +
          tasks.map((t) => `${t.request} — ${t.state}`).join("; ") +
          ". These are saved task statuses, not proof of completed actions."
        : `No saved tasks in ${workspace}. Say “Create a task to” followed by what you want to record.`,
    };
  }
  let known: TaskContext | undefined;
  if (context !== undefined && context !== null) {
    const c = context as TaskContext;
    if (
      !c ||
      typeof c.id !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(c.id) ||
      !Number.isSafeInteger(c.revision) ||
      c.revision < 0 ||
      c.scope !== workspace
    )
      throw new SyncError(
        400,
        "Task context is invalid or belongs to another workspace. Name the task again.",
      );
    known = c;
  }
  const tasks = listConversationTasks(workspace, 1000);
  const target = normalize(intent.target);
  const matches =
    intent.target === "last"
      ? tasks.filter((t) => t.id === known?.id)
      : tasks.filter(
          (t) =>
            t.id.toLowerCase() === intent.target.toLowerCase() ||
            (intent.target.length >= 8 &&
              t.id.toLowerCase().startsWith(intent.target.toLowerCase())) ||
            (target && normalize(t.request).includes(target)),
        );
  if (matches.length !== 1)
    return {
      ...base,
      answer: matches.length
        ? "More than one task matches. Select a task below, then repeat the command using ‘that task’, or use its full reference. Nothing was changed."
        : "I could not identify one saved task in this workspace. Name it, or say ‘Show my tasks’ and select one. Nothing was changed.",
      taskChoices: (matches.length ? matches : tasks)
        .slice(0, 10)
        .map((t) => ({ ...reference(t), request: t.request, state: t.state })),
    };
  let task = matches[0];
  let feedback: string | undefined;
  if (intent.action === "pause" && task.state === "paused")
    feedback = "This task is already paused. Nothing was changed.";
  else if (intent.action === "cancel" && task.state === "cancelled")
    feedback = "This task is already cancelled. Nothing was changed.";
  else if (
    intent.action !== "status" &&
    ["completed", "cancelled"].includes(task.state)
  )
    feedback = `This task is already ${task.state}. Nothing was changed. Create a new task if more work is needed.`;
  else if (
    intent.action === "resume" &&
    ["queued", "running", "verifying"].includes(task.state)
  )
    feedback = `This task is already ${task.state}. No duplicate work was queued.`;
  else if (intent.action === "pause" && task.state === "failed")
    feedback =
      "This task has failed rather than running. Nothing was changed. Review its reason before resuming or correcting it.";
  if (intent.action !== "status" && !feedback) {
    if (intent.action === "resume" && task.mode !== "plan")
      throw new SyncError(
        409,
        "Review development tasks in Foundation before queueing a worker. No worker permission was added.",
      );
    changeTask({
      id: task.id,
      revision: known?.id === task.id ? known.revision : task.revision,
      action: intent.action === "resume" ? "queue" : intent.action,
      request: intent.request,
      allowWorker: false,
    });
    task = listConversationTasks(workspace, 1000).find(
      (t) => t.id === task.id,
    )!;
  }
  const note =
    feedback ||
    (intent.action === "resume"
      ? "Queued for local planning; this does not authorize external actions."
      : intent.action === "steer"
        ? "Objective updated and paused for review. Say ‘Resume that task’ to queue local planning."
        : intent.action === "cancel"
          ? "Cancelled; existing artifacts and completed effects are retained."
          : intent.action === "pause"
            ? "Paused; completed effects are retained."
            : "This is the saved task status, not proof that external actions happened.");
  return {
    ...base,
    task: reference(task),
    answer: `${task.request}. Status: ${task.state}. ${task.reason}. ${note}`,
    taskDetail: {
      ...reference(task),
      request: task.request,
      state: task.state,
      reason: task.reason,
      output: task.output,
      updatedAt: task.updatedAt,
    },
  };
}
