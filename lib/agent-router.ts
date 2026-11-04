export const providerIds = ["local", "openai", "anthropic", "gemini"] as const;
export type ProviderId = (typeof providerIds)[number];
export type ProviderStatus = {
  id: ProviderId;
  name: string;
  configured: boolean;
  external: boolean;
  detail: string;
};
export type AgentEvent = {
  id: string;
  agent: string;
  started: number;
  finished?: number;
  state: "working" | "complete" | "failed" | "cancelled";
};
export type AgentResult = {
  provider: ProviderId;
  name: string;
  answer?: string;
  error?: string;
};
export function planAgents(
  mode: string,
  query: string,
  providers: ProviderStatus[],
  allowExternal: boolean,
): ProviderId[] {
  const permitted = providers.filter(
    (p) => p.configured && (!p.external || allowExternal),
  );
  if (mode === "knowledge") return [];
  if (providerIds.includes(mode as ProviderId))
    return permitted.some((p) => p.id === mode) ? [mode as ProviderId] : [];
  const preferred: ProviderId =
    /review|contract|document|compare|research/i.test(query)
      ? "anthropic"
      : /google|image|multimodal/i.test(query)
        ? "gemini"
        : "openai";
  if (
    mode === "auto" &&
    allowExternal &&
    /review|contract|document|research|google|image|multimodal/i.test(query) &&
    permitted.some((p) => p.id === preferred)
  )
    return [preferred];
  const ordered = [
    ...permitted.filter((p) => p.id === "local"),
    ...permitted.filter((p) => p.id === preferred),
    ...permitted.filter((p) => p.id !== "local" && p.id !== preferred),
  ];
  return ordered.slice(0, mode === "compare" ? 2 : 1).map((p) => p.id);
}
