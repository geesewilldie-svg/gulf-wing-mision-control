import { agents, initialTasks, Task, ventures } from "./demo";

export const STORAGE_KEY = "gulf-wing.demo-workspace.v1";
export const panelNames = [
  "Mission board",
  "Agent activity",
  "Model costs",
] as const;
export type PanelName = (typeof panelNames)[number];
export type PanelLayout = {
  offset: { x: number; y: number };
  size: { width: number; height: number } | null;
  maximized: boolean;
};
export type Workspace = {
  version: 1;
  tasks: Task[];
  venture: string;
  selected: string;
  events: string[];
  hidden: PanelName[];
  panels: Record<PanelName, PanelLayout>;
};
export function createWorkspace(): Workspace {
  const layout = (): PanelLayout => ({
    offset: { x: 0, y: 0 },
    size: null,
    maximized: false,
  });
  return {
    version: 1,
    tasks: initialTasks.map((task) => ({ ...task })),
    venture: ventures[0],
    selected: "GPT",
    events: [
      "Hermes completed operational workflow mapping",
      "Claude started quarterly performance analysis",
      "GPT prepared a portfolio briefing outline",
    ],
    hidden: [],
    panels: {
      "Mission board": layout(),
      "Agent activity": layout(),
      "Model costs": layout(),
    },
  };
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isAgent = (value: unknown): value is string =>
  agents.some((agent) => agent.name === value);
const isVenture = (value: unknown): value is string =>
  ventures.some((venture) => venture === value);
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

// Treat browser storage as untrusted input; never spread arbitrary stored properties into state.
export function parseWorkspace(raw: string): Workspace {
  if (raw.length > 2_000_000) throw new Error("Saved workspace too large");
  const data: unknown = JSON.parse(raw);
  if (
    !record(data) ||
    data.version !== 1 ||
    !isVenture(data.venture) ||
    !isAgent(data.selected) ||
    !Array.isArray(data.tasks) ||
    data.tasks.length > 2000 ||
    !Array.isArray(data.events) ||
    data.events.length > 12 ||
    !Array.isArray(data.hidden) ||
    !record(data.panels)
  )
    throw new Error("Invalid workspace");
  const ids = new Set<number>();
  const tasks = data.tasks.map((task: unknown): Task => {
    if (
      !record(task) ||
      !finite(task.id) ||
      !Number.isSafeInteger(task.id) ||
      task.id < 1 ||
      ids.has(task.id) ||
      typeof task.title !== "string" ||
      !task.title.trim() ||
      task.title.length > 120 ||
      !isAgent(task.agent) ||
      !isVenture(task.venture) ||
      !["Queued", "In progress", "Complete"].includes(task.status as string)
    )
      throw new Error("Invalid mission");
    ids.add(task.id);
    return {
      id: task.id,
      title: task.title,
      agent: task.agent,
      venture: task.venture,
      status: task.status as Task["status"],
    };
  });
  const events = data.events.map((event: unknown) => {
    if (typeof event !== "string" || event.length > 300)
      throw new Error("Invalid activity");
    return event;
  });
  if (
    data.hidden.length > panelNames.length ||
    new Set(data.hidden).size !== data.hidden.length ||
    data.hidden.some((name) => !panelNames.includes(name))
  )
    throw new Error("Invalid minimized panels");
  const panels = createWorkspace().panels;
  let maximized = false;
  for (const name of panelNames) {
    const panel = data.panels[name];
    if (
      !record(panel) ||
      !record(panel.offset) ||
      !finite(panel.offset.x) ||
      !finite(panel.offset.y) ||
      typeof panel.maximized !== "boolean" ||
      (panel.size !== null &&
        (!record(panel.size) ||
          !finite(panel.size.width) ||
          !finite(panel.size.height)))
    )
      throw new Error("Invalid panel layout");
    const size = panel.size as { width: number; height: number } | null;
    panels[name] = {
      offset: {
        x: clamp(panel.offset.x, -160, 160),
        y: clamp(panel.offset.y, -160, 160),
      },
      size: size
        ? {
            width: clamp(size.width, 280, 1600),
            height: clamp(size.height, 220, 700),
          }
        : null,
      maximized: panel.maximized && !maximized,
    };
    maximized ||= panels[name].maximized;
  }
  return {
    version: 1,
    tasks,
    events,
    venture: data.venture,
    selected: data.selected,
    hidden: data.hidden as PanelName[],
    panels,
  };
}
