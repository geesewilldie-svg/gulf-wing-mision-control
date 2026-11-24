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
      "Browse metadata in selected folders without indexing their contents, refresh the index, search, and read indexed text. Open hash-checked original PDFs/text in the browser or download indexed originals. Folder selection stays local.",
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
