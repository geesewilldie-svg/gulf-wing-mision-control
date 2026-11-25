// Retained architecture targets, deliberately separate from executable providers.
// Listing these cards must never perform discovery, downloads, auth or inference.
export const plannedConnectionTargets = [
  {
    id: "rea",
    name: "REA inspection tools",
    status: "Planned — not connected",
    detail:
      "Reviewed target: morluto/rea, rea-agents 6.10.1. Runtime compatibility, isolated tool setup and a target-scoped inspection adapter remain pending. Browser observation does not supply general browser control.",
    authorization:
      "An explicit inspection target and restricted tool contract are required. No MCP installation, browser attachment, file inspection or execution starts from this view.",
  },
  {
    id: "hugging-face",
    name: "Hugging Face Model Hub",
    status: "Planned — not connected",
    detail:
      "Model catalog and download adapter target. License, repository revision, artifact hash, disk space and runtime compatibility must be checked. A downloaded model is not a running local model.",
    authorization:
      "No account access, token use, model download or hosted inference is enabled. Local runtime setup and any hosted Hugging Face service are separate capabilities.",
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
