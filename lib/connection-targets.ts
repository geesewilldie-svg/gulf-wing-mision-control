// Build-level integration summaries, deliberately separate from live readiness.
// Listing these cards must never perform discovery, downloads, auth or inference.
export const plannedConnectionTargets = [
  {
    id: "rea",
    name: "REA inspection tools",
    status: "Owned diagnostic implemented",
    detail:
      "Pinned rea-agents 6.10.1 supports isolated staging, protocol checks and one Nexus-owned browser diagnostic with saved metadata review. Compatible runtime/package setup is checked separately. General target-scoped website inspection and signed-in browser control remain unconnected.",
    authorization:
      "Paired controller and explicit diagnostic actions are required. This overview starts no setup, tool process, browser attachment or inspection. Historical success is not current readiness.",
  },
  {
    id: "hugging-face",
    name: "Hugging Face Model Hub",
    status: "Reviewed model lifecycle implemented",
    detail:
      "Explicit anonymous metadata lookup and reviewed archive-only transfer are implemented; live Hub access is unverified. Separate local blob staging, generated model creation, current-identity review and fixed diagnostics are implemented; actual model compatibility and native hardware fit remain unverified. Source identity, license review, capacity and full-byte integrity checks gate each transfer.",
    authorization:
      "No automatic acquisition, account token use or hosted inference is enabled. A separate explicit reviewed-file action is required for archive transfer; local runtime prerequisites and explicit creation/diagnostic controls remain separate.",
  },
  {
    id: "venice",
    name: "Venice hosted inference",
    status: "Planned — not connected",
    detail:
      "Optional external model-provider target. API compatibility, actual model IDs, credentials, limits and usage reporting remain pending. No model from the video is assumed available.",
    authorization:
      "Requires local provider setup, explicit enablement and per-question private-context sharing permission. No API request, billing change or automatic routing is enabled.",
  },
] as const;
