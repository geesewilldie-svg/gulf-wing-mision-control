// Websites supplied by the operator. Listing a product is not an installed adapter.
export const toolInventory = [
  {
    name: "Cursor",
    status: "Development companion — not a Nexus answering agent",
    url: "https://cursor.com/download",
    role: "Open this repository to maintain Mission Control with branches, tests and review.",
    next: "Project rules and privacy exclusions are supplied. Sign-in, installation and current product capabilities must be verified on the laptop.",
  },
  {
    name: "GrockBot",
    status: "Unverified — kept separate",
    url: "https://grockbot.fun/",
    role: "The operator-provided domain has not been verified as an xAI product or a supported integration.",
    next: "No adapter, credential access, file access or workflow execution is enabled. Do not treat it as the Grok API without publisher verification.",
  },
  {
    name: "Manus",
    status: "Evaluation only — not connected",
    url: "https://manus.im/",
    role: "Candidate for a small public-information research task after checking account terms, costs and supported interfaces.",
    next: "No Manus API/SDK has been verified or installed. Do not provide private company records during an initial public-data evaluation.",
  },
  {
    name: "OpenClaw",
    status: "Execution disabled — not connected",
    url: "https://openclaw.ai/",
    role: "Candidate workflow tool. Installed version, publisher and permission model require verification before any connection.",
    next: "No gateway, skills, account permissions or automation are enabled. Begin with a read-only, synthetic-data task if a supported integration is verified.",
  },
] as const;
