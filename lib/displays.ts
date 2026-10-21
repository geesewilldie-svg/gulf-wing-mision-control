export const displayViews = [
  {
    id: "overview",
    name: "Mission overview",
    description: "A complete briefing for a TV or main display.",
  },
  {
    id: "core",
    name: "Holographic core",
    description: "Give your agent constellation its own screen.",
  },
  {
    id: "missions",
    name: "Mission board",
    description: "Keep the current venture’s mission queue in view.",
  },
  {
    id: "activity",
    name: "Agent activity",
    description: "Follow simulated updates on a dedicated screen.",
  },
] as const;
export type DisplayView = (typeof displayViews)[number]["id"];
export function parseDisplayView(value: string | null): DisplayView {
  return displayViews.find((view) => view.id === value)?.id ?? "overview";
}
