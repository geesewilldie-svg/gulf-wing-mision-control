import { laptopCapabilities } from "../laptop-capabilities";
import { fileRoots } from "./local-files";
import { maintenanceEnabled } from "./maintenance";
import { linkOpeningEnabled } from "./web-link";
export async function laptopCapabilitiesAnswer() {
  const [folders, maintenance, links] = await Promise.allSettled([
    fileRoots(),
    maintenanceEnabled(),
    linkOpeningEnabled(),
  ]);
  const capabilities = laptopCapabilities.map((capability) => {
    let status = capability.implemented
      ? "Included in this build"
      : "Not built yet";
    let detail = capability.description;
    if (capability.id === "selected-files.read") {
      if (folders.status === "rejected") {
        status = "Settings unavailable";
        detail +=
          " Folder settings could not be read; access is not confirmed.";
      } else if (!folders.value.length) {
        status = "Folder setup needed";
        detail += " Choose folders with Setup-Nexus-Folders.cmd on the laptop.";
      } else {
        status = "Folders selected";
        detail +=
          " " +
          folders.value.length +
          (folders.value.length === 1
            ? " folder is selected"
            : " folders are selected") +
          "; current file coverage is checked when searching.";
      }
    }
    if (capability.id === "nexus-services.maintain") {
      if (process.platform !== "win32") status = "Windows host required";
      else if (maintenance.status === "rejected")
        status = "Settings unavailable";
      else
        status = maintenance.value
          ? "Enabled locally"
          : "Local enablement needed";
    }
    if (capability.id === "browser.open-reviewed-link") {
      if (process.platform !== "win32") status = "Windows host required";
      else if (links.status === "rejected") status = "Settings unavailable";
      else status = links.value ? "Enabled locally" : "Local enablement needed";
    }
    return {
      id: capability.id,
      version: capability.version,
      name: capability.name,
      status,
      detail,
      authorization: capability.authorization,
      effects: capability.effects,
      verification: capability.verification,
    };
  });
  return {
    engine: "Nexus laptop capabilities",
    answer:
      "This build includes selected-file reading, reviewed drafts/links, service checks, current-record search, reviewed local model lifecycle, single-frame local visual questions and a fixed REA owned-browser diagnostic. Each has separate setup and explicit controls; this overview checks no runtime, captures no image and starts no tool. General computer control, arbitrary website inspection and continuous vision remain unconnected. Included does not mean configured, currently available or verified on your hardware.",
    capabilities,
    sources: [],
    warnings: [],
    routing: {
      mode: "local",
      selected: [],
      reason:
        "Built-in capability descriptions and local settings only. No model, provider or maintenance process was used.",
    },
  };
}
