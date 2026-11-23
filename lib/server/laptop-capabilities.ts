import { laptopCapabilities } from "../laptop-capabilities";
import { fileRoots } from "./local-files";
import { maintenanceEnabled } from "./maintenance";
export async function laptopCapabilitiesAnswer() {
  const [folders, maintenance] = await Promise.allSettled([
    fileRoots(),
    maintenanceEnabled(),
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
    return {
      id: capability.id,
      version: capability.version,
      name: capability.name,
      status,
      detail,
      authorization: capability.authorization,
    };
  });
  return {
    engine: "Nexus laptop capabilities",
    answer:
      "For laptop files and services, this build includes selected-file reading, reviewed draft files, and Nexus service checks when locally enabled. Browser and general computer control are not built yet. Setup settings are listed below; they do not prove live service health. No action was started.",
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
