export const scopes = [
  "Personal",
  "Co-hosting",
  "Holding company",
  "Aviation",
  "Security Operations",
  "Future ventures",
] as const;
export type Scope = (typeof scopes)[number];
export type TaskState =
  | "accepted"
  | "queued"
  | "running"
  | "verifying"
  | "completed"
  | "paused"
  | "waiting"
  | "failed"
  | "cancelled";
export type NexusTask = {
  id: string;
  revision: number;
  request: string;
  scope: Scope;
  mode: "plan" | "development";
  state: TaskState;
  reason: string;
  output: string;
  createdAt: string;
  updatedAt: string;
  policyRevision: number;
};
export type MemoryRecord = {
  id: string;
  revision: number;
  kind: "fact" | "preference" | "instruction";
  scope: Scope;
  content: string;
  updatedAt: string;
  source: "owner";
  localOnly: true;
};
export type FoundationEvent = {
  id: number;
  taskId: string | null;
  type: string;
  at: string;
  detail: string;
};
export type FoundationSnapshot = {
  schemaVersion: 1;
  capabilities?: typeof foundationCapabilities;
  tasks: NexusTask[];
  memory: MemoryRecord[];
  policy: { revision: number; planningEnabled: boolean };
  events: FoundationEvent[];
  skills: {
    id: string;
    taskId: string;
    status: "draft";
    description: string;
  }[];
};
export function text(v: unknown, max: number) {
  if (typeof v !== "string" || !v.trim() || v.length > max || v.includes("\0"))
    throw Error("Enter text within the allowed length.");
  return v.trim();
}
export function scope(v: unknown): Scope {
  if (!scopes.includes(v as Scope))
    throw Error("Choose a supported workspace scope.");
  return v as Scope;
}

export const foundationCapabilities = [
  {
    id: "nexus.plan.local",
    version: 1,
    mode: "plan",
    health: "installed",
    prerequisites: [
      "controller session",
      "dispatch enabled",
      "configured and ready local model",
    ],
    inputSchema: {
      type: "object",
      required: ["request", "scope"],
      properties: {
        request: { type: "string", maxLength: 2000 },
        scope: { enum: scopes },
      },
    },
    outputSchema: { type: "string", maxLength: 40000 },
    effects: ["private planning artifact"],
    cost: "local compute; no paid fallback",
    cancellation: "cooperative abort plus task/policy revision fencing",
    verification: "SQLite artifact read-back; external claims unverified",
    limitations: [
      "No shell, browser or account actions",
      "Small local model context/output limits",
    ],
  },
  {
    id: "nexus.development.handoff",
    version: 1,
    mode: "development",
    health: "installed",
    prerequisites: ["controller session", "dispatch enabled"],
    inputSchema: {
      type: "object",
      required: ["request", "scope"],
      properties: {
        request: { type: "string", maxLength: 2000 },
        scope: { enum: scopes },
      },
    },
    outputSchema: {
      type: "object",
      required: [
        "parentTaskId",
        "objective",
        "permissions",
        "externalSpendLimit",
      ],
    },
    effects: ["private handoff artifact", "unvalidated skill draft"],
    cost: "deterministic local processing",
    cancellation: "task revision checked at commit",
    verification:
      "Handoff artifact saved; worker execution remains unavailable",
    limitations: [
      "No authenticated coding worker",
      "No skill activation or code execution",
    ],
  },
] as const;
