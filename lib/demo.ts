export const ventures = [
  "Gulf Wing Holding Company",
  "Co-hosting",
  "Aviation",
  "Security Operations",
  "Future Ventures",
] as const;
export const agents = [
  {
    name: "GPT",
    role: "Strategy & orchestration",
    color: "#49d5ff",
    symbol: "◎",
  },
  {
    name: "Claude",
    role: "Research & analysis",
    color: "#c3a2ff",
    symbol: "✳",
  },
  {
    name: "Hermes",
    role: "Operations & routing",
    color: "#52e2be",
    symbol: "⌁",
  },
  {
    name: "Codex",
    role: "Engineering & automation",
    color: "#ffbd79",
    symbol: "⌘",
  },
];
export type Task = {
  id: number;
  title: string;
  agent: string;
  status: "Queued" | "In progress" | "Complete";
  venture: string;
};
export const initialTasks: Task[] = [
  {
    id: 1,
    title: "Prepare portfolio briefing",
    agent: "GPT",
    status: "In progress",
    venture: ventures[0],
  },
  {
    id: 2,
    title: "Review quarterly performance",
    agent: "Claude",
    status: "Queued",
    venture: ventures[0],
  },
  {
    id: 3,
    title: "Map operational workflows",
    agent: "Hermes",
    status: "Complete",
    venture: ventures[0],
  },
  {
    id: 4,
    title: "Draft guest arrival checklist",
    agent: "Hermes",
    status: "Queued",
    venture: ventures[1],
  },
  {
    id: 5,
    title: "Review fleet readiness report",
    agent: "Claude",
    status: "In progress",
    venture: ventures[2],
  },
  {
    id: 6,
    title: "Summarize incident exercise",
    agent: "GPT",
    status: "Queued",
    venture: ventures[3],
  },
];
export const costs = [
  { name: "GPT", amount: 4.82, tokens: "186k" },
  { name: "Claude", amount: 3.16, tokens: "124k" },
  { name: "Hermes", amount: 0.48, tokens: "42k" },
  { name: "Codex", amount: 1.24, tokens: "68k" },
];
