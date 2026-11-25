import { plannedConnectionTargets } from "../connection-targets";
import { copilotPreparation } from "./copilot-preparation";
import { providerStatus } from "./agent-router";
import { publicGeminiStatus } from "./gemini-public";
import { googleStatus } from "./google-accounts";
import { fileRoots } from "./local-files";
import { codexWorkerEnabled } from "./foundation/codex-worker";

const probes = {
  providers: providerStatus,
  publicGemini: publicGeminiStatus,
  google: googleStatus,
  folders: fileRoots,
  codex: codexWorkerEnabled,
  copilot: copilotPreparation,
};
export async function connectionInventory(
  read: Omit<typeof probes, "copilot"> & {
    copilot?: typeof copilotPreparation;
  } = probes,
) {
  const [providers, publicGemini, google, folders, codex, copilot] =
    await Promise.allSettled([
      read.providers(),
      read.publicGemini(),
      read.google(),
      read.folders(),
      read.codex(),
      (read.copilot || copilotPreparation)(),
    ]);
  const cards: {
    id: string;
    name: string;
    status: string;
    detail: string;
    authorization: string;
  }[] = [];
  for (const [id, name] of [
    ["local", "Ollama"],
    ["openai", "ChatGPT API"],
    ["anthropic", "Claude API"],
    ["gemini", "Gemini private-context API"],
  ] as const) {
    const provider =
      providers.status === "fulfilled"
        ? providers.value.find((item) => item.id === id)
        : undefined;
    cards.push({
      id,
      name,
      status: !provider
        ? "Settings unavailable"
        : provider.configured
          ? "Configured — not live-checked"
          : "Not enabled",
      detail:
        provider?.detail ||
        "Model settings could not be read. Existing settings were preserved.",
      authorization:
        id === "local"
          ? "Local answers; availability is checked when used."
          : "Separate provider API setup and per-question sharing permission required. A chat subscription alone does not connect this adapter.",
    });
  }
  const pub = publicGemini.status === "fulfilled" ? publicGemini.value : null;
  cards.push({
    id: "gemini-public",
    name: "Gemini Public",
    status:
      !pub || pub.warning
        ? "Settings unavailable"
        : !pub.supported
          ? "Windows setup required"
          : pub.enabled && pub.configured
            ? "Enabled for public questions"
            : "Not enabled",
    detail:
      "Separate public-question box. Private files, owner memory and conversation history are excluded; this does not enable private Gemini routing.",
    authorization:
      "Public-question confirmation required. No generation or quota use is performed by this view.",
  });
  const roots =
    folders.status === "fulfilled"
      ? folders.value.filter((root) => root.kind === "obsidian")
      : null;
  cards.push({
    id: "obsidian",
    name: "Obsidian selected vaults",
    status:
      roots === null
        ? "Settings unavailable"
        : roots.length
          ? "Vault selected"
          : "No vault selected",
    detail: roots?.length
      ? `${roots.length} selected vault(s). Use Show my source map for current indexed files and explicit note links.`
      : "Select a vault locally with Setup-Nexus-Folders.cmd. Imported snapshots alone do not establish a current selected vault.",
    authorization:
      "Read-only selected-folder index. Selection does not prove current file coverage or freshness.",
  });
  cards.push({
    id: "codex-worker",
    name: "Codex workshop",
    status:
      codex.status === "rejected"
        ? "Settings unavailable"
        : codex.value
          ? "Enabled locally — not live-checked"
          : "Not enabled",
    detail:
      "Bounded candidate-code authoring. Enabled configuration does not prove CLI sign-in, worker readiness, passing tests or deployment.",
    authorization:
      "Existing Foundation worker permission and reviewed candidate workflow apply.",
  });
  for (const [feature, name] of [
    ["calendar", "Google Calendar"],
    ["drive", "Google Drive snapshots"],
  ] as const) {
    const accounts =
      google.status === "fulfilled"
        ? google.value.accounts.filter((account) => account[feature])
        : null;
    cards.push({
      id: `google-${feature}`,
      name,
      status:
        accounts === null
          ? "Settings unavailable"
          : accounts.length
            ? "Authorization saved — not live-checked"
            : "No saved authorization",
      detail: accounts?.length
        ? `${accounts.length} saved account authorization(s). Access may have expired or been revoked; verify in Connections.`
        : "Review the Google account setup in Connections. Existing unreadable credentials are preserved.",
      authorization:
        feature === "drive"
          ? "Selected read-only snapshots; newer files and changed permissions require refresh. No writes or email sending."
          : "Read-only selected calendars. This view does not fetch events or validate tokens.",
    });
  }
  for (const [id, name] of [
    ["github-copilot", "GitHub Copilot"],
    ["microsoft-copilot", "Microsoft Copilot"],
  ])
    cards.push({
      id,
      name,
      status: "Integration not built",
      detail:
        "Retained connection target. Supported interface, account entitlement and delegation behavior still require verification.",
      authorization:
        "No Nexus adapter, account access or unattended execution is supplied. Microsoft Graph access alone would not constitute a Copilot connection.",
    });
  cards.push(...plannedConnectionTargets);
  const githubCard = cards.find((card) => card.id === "github-copilot")!;
  const preparation = copilot.status === "fulfilled" ? copilot.value : null;
  if (!preparation || preparation.warning) {
    githubCard.status = "Preparation settings unavailable";
    githubCard.detail =
      "Existing Copilot setup was preserved. No model access is verified.";
  } else if (preparation.prepared) {
    githubCard.status = "Profile prepared — model adapter pending";
    githubCard.detail = `Pinned CLI ${preparation.version} found. Separate-profile sign-in, model access and restricted prompt execution remain unverified.`;
  }
  githubCard.authorization =
    "Preparation only. No automatic delegation, model prompt, private-context sharing or account-plan change is enabled.";
  return {
    engine: "Nexus connection setup",
    answer:
      "Saved setup and integration availability are listed below. These are configuration checks, not live service tests. This view changes no settings and contacts no provider.",
    capabilities: cards,
    sources: [],
    warnings: [],
    routing: {
      mode: "local",
      selected: [],
      reason:
        "Local setup inspection only; no model inference, browser action, token refresh or external request was started.",
    },
  };
}
