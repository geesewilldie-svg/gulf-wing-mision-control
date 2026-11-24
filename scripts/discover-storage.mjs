import { discoverWindowsStorage } from "./storage-discovery-lib.mjs";
console.log("Nexus storage discovery — local metadata only.");
console.log(
  "No file scan, indexing, provider request or access-setting change.",
);
try {
  const inventory = await discoverWindowsStorage();
  console.log(
    "\nReported drives (availability and content access are not verified):",
  );
  for (const drive of inventory.drives)
    console.log(
      `${drive.path}  ${drive.kind}  ${drive.label || "(no volume label)"}  size bytes: ${drive.sizeBytes ?? "unknown"}  free bytes: ${drive.freeBytes ?? "unknown"}`,
    );
  console.log(
    "\nConfigured common folders (paths may be redirected, offline or unavailable):",
  );
  for (const folder of inventory.folders)
    console.log(`${folder.name}: ${folder.path}`);
  console.log(
    "\nDiscovery does not add these locations to the Galaxy. Existing selected-folder access is unchanged.",
  );
} catch {
  console.error(
    "Storage inventory could not be read. Run this on Windows with PowerShell available. No access settings were changed.",
  );
  process.exitCode = 1;
}
