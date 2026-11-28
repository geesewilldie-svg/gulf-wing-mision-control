export type LaptopCapability = {
  id: string;
  version: 1;
  name: string;
  implemented: boolean;
  description: string;
  effects: string;
  authorization: string;
  verification: string;
};
export const laptopCapabilities: readonly LaptopCapability[] = [
  {
    id: "browser.open-reviewed-link",
    version: 1,
    name: "Open reviewed web links",
    implemented: true,
    description:
      "Review an HTTPS address and request it open in the laptop's normal browser. Page display and load are not verified.",
    effects:
      "Hand one reviewed HTTPS link to Windows; no page reading or clicking.",
    authorization:
      "Windows host, paired controller, separate local enablement and Open on laptop confirmation.",
    verification:
      "Windows process handoff only; saved request receipt. No page or account verification.",
  },
  {
    id: "selected-files.read",
    version: 1,
    name: "Selected laptop files",
    implemented: true,
    description:
      "Browse metadata in selected folders without indexing their contents, refresh the index, search, and read indexed text. Open hash-checked indexed originals, or supported browsed documents and PNG/JPEG pictures through current signed references without indexing. Folder selection stays local.",
    effects:
      "Read approved sources; refresh the private index. No source-file edits.",
    authorization: "Paired controller and locally selected folders.",
    verification:
      "Source identity and content hashes; partial and stale files are disclosed.",
  },
  {
    id: "managed-drafts.create",
    version: 1,
    name: "Reviewed file drafts",
    implemented: true,
    description:
      "Review an answer, save a new Markdown file, view or download it, and edit a separate copy.",
    effects:
      "Create-only files inside Nexus's managed output area. Originals are preserved.",
    authorization:
      "Paired controller; explicit review and Save file confirmation.",
    verification:
      "Exclusive creation, exact read-back and source hashes for copies.",
  },
  {
    id: "nexus-services.maintain",
    version: 1,
    name: "Nexus service checks",
    implemented: true,
    description:
      "Check laptop services or start missing Nexus services using the existing launcher.",
    effects:
      "Run two fixed Windows maintenance scripts; no arbitrary commands.",
    authorization:
      "Windows host, paired controller and locally enabled maintenance.",
    verification:
      "Saved operation receipts; a child exit does not establish full readiness.",
  },
  {
    id: "foundation.current-records",
    version: 1,
    name: "Current memory and task search",
    implemented: true,
    description:
      "Search bounded current owner memory and task text in one workspace or all six. Signed conversational next/previous pages and numbered inspection preserve currentness. Historical snapshots and files are separate sources.",
    effects:
      "Read current Foundation rows only; no memory/task edit or provider request.",
    authorization:
      "Paired controller; Auto or Local conversational commands, or explicit Memory controls.",
    verification:
      "Scoped corpus stamps and selected revision/profile hashes. Owner statements and task output are not independently verified facts.",
  },
  {
    id: "models.reviewed-lifecycle",
    version: 1,
    name: "Reviewed local model lifecycle",
    implemented: true,
    description:
      "Review Hub metadata, archive/resume one reviewed GGUF, inspect and stage it locally, and create a new generated Ollama alias through separate explicit controls. Saved diagnostics and current identity checks remain distinct.",
    effects:
      "Explicit acquisition can use the network and disk; staging/creation writes to local Ollama. Reading this overview starts none of these operations.",
    authorization:
      "Paired controller; source/license, integrity, capacity and runtime prerequisites are rechecked for each applicable action. No automatic activation or default-model change.",
    verification:
      "Historical receipts, current source/runtime identity and a separate fixed inference test. Real-model compatibility, live Hub access and native hardware fit remain unverified.",
  },
  {
    id: "vision.single-frame",
    version: 1,
    name: "Local camera and screen questions",
    implemented: true,
    description:
      "Explicit video-only camera/screen preview, one newly sampled frame per local question, optional reviewed spoken-question draft and explicit answer JSON download. A phone captures its own available source, not the laptop screen remotely.",
    effects:
      "Preview uses device capture. Asking sends one bounded JPEG and question to the paired server and local Ollama. Downloads retain private text metadata without the image; no automatic memory ingestion.",
    authorization:
      "Paired controller, browser capture permission and an inspected installed vision/completion model. Each frame question and download is explicit; the saved voice preference is unchanged.",
    verification:
      "Reported model/digest and historical timestamps; generated descriptions are unverified. Native device/ASR, actual image decoding and hardware acceptance remain unverified. No continuous vision or hosted image adapter.",
  },
  {
    id: "rea.owned-diagnostic",
    version: 1,
    name: "REA owned browser diagnostic",
    implemented: true,
    description:
      "Pinned isolated REA preflight, protocol check and one fixed Nexus-owned browser fixture, with retained metadata review/export. General website inspection and signed-in browser control remain unconnected.",
    effects:
      "Explicit diagnostics can launch one owned tool process and temporary headless browser; this overview launches neither.",
    authorization:
      "Paired controller and separate checks over the compatible pinned package/runtime. No caller URL, browser attachment or arbitrary command is accepted.",
    verification:
      "Package/protocol identity, owned target evidence and cleanup acceptance for that run. Historical success does not establish current tool readiness.",
  },
  {
    id: "desktop.browser-control",
    version: 1,
    name: "Browser control",
    implemented: false,
    description:
      "Reading or clicking pages, controlling existing tabs and acting in signed-in accounts are not implemented.",
    effects: "None; no execution adapter.",
    authorization: "No grant or adapter is provided.",
    verification: "Not implemented.",
  },
  {
    id: "desktop.general-execution",
    version: 1,
    name: "General computer control",
    implemented: false,
    description:
      "Arbitrary terminal commands, application control and editing or deleting existing source files are not implemented.",
    effects: "None; no general execution adapter.",
    authorization: "No grant or adapter is provided.",
    verification: "Not implemented.",
  },
];
export const laptopCapabilityFacts =
  "Implemented laptop capability registry (descriptions only, not live health or execution permission):\n" +
  laptopCapabilities
    .map(
      (capability) =>
        capability.id +
        " v" +
        capability.version +
        ": " +
        (capability.implemented ? "implemented. " : "not implemented. ") +
        capability.description +
        " " +
        capability.authorization,
    )
    .join("\n") +
  "\nThe answering model and planning worker have no execution tools. Explain existing controls; never claim to have performed these actions or enable capabilities by changing memory.";
export function laptopCapabilitiesIntent(query: string) {
  const text = query
    .trim()
    .replace(/^(?:hey\s+)?nexus[, ]+/i, "")
    .replace(/^please\s+/i, "");
  return (
    /^(?:show|list)(?: my)? laptop capabilities[.!?]*$/i.test(text) ||
    /^what can (?:you|nexus) do on my laptop[.!?]*$/i.test(text)
  );
}
