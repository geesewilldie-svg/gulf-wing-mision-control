import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { discoverWindowsStorage } from "./storage-discovery-lib.mjs";
import {
  readBrowseGrants,
  addBrowseGrant,
  removeBrowseGrant,
} from "./storage-browse-lib.mjs";
const prompt = createInterface({
  input: process.stdin,
  output: process.stdout,
});
try {
  if (process.platform !== "win32")
    throw Error("Run this on the Windows laptop.");
  const dir = path.resolve(
    process.env.GW_SYNC_DATA_DIR ||
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
        ".gulf-wing",
      ),
  );
  const grants = await readBrowseGrants(dir);
  console.log(
    "Nexus browse-only storage. Knowledge/index selections stay separate.",
  );
  grants.forEach((g, i) => console.log(`${i + 1}. ${g.label}: ${g.path}`));
  const action = (
    await prompt.question(
      "Add or remove a browse location? (A/R; anything else cancels) ",
    )
  )
    .trim()
    .toUpperCase();
  if (action === "R") {
    const number =
      Number(await prompt.question("Browse location number to remove: ")) - 1;
    if (!Number.isInteger(number) || !grants[number])
      throw Error("No browse location selected.");
    console.log(
      `Remove browsing access: ${grants[number].label} / ${grants[number].path}`,
    );
    if (
      (await prompt.question("Remove this browse grant? (Y/N) "))
        .trim()
        .toUpperCase() === "Y"
    ) {
      await removeBrowseGrant(dir, grants[number].id);
      console.log(
        "Browse grant removed. Source files and knowledge selections were not changed.",
      );
    }
  } else if (action === "A") {
    const inventory = await discoverWindowsStorage();
    const choices = [
      ...inventory.folders.map((f) => ({
        label: f.name,
        path: f.path,
        type: "folder",
      })),
      ...inventory.drives.map((d) => ({
        label: `${d.path} ${d.label || d.kind}`.slice(0, 60),
        path: d.path,
        type: "drive",
      })),
    ].filter(
      (item, i, all) =>
        all.findIndex(
          (other) => other.path.toLowerCase() === item.path.toLowerCase(),
        ) === i,
    );
    choices.forEach((c, i) => console.log(`${i + 1}. ${c.label}: ${c.path}`));
    const number = Number(await prompt.question("Location number: ")) - 1;
    if (!Number.isInteger(number) || !choices[number])
      throw Error("No storage location selected.");
    const choice = choices[number];
    console.log(`Selected: ${choice.label} / ${choice.path}`);
    console.log(
      "Paired controllers, including your phone, will be able to list this location and descendants and open supported originals. Existing hidden/protected-name exclusions and file-size limits apply. Whole-drive selection is broad access. No indexing, model sharing, file editing or automatic scanning is enabled. Removing this grant later does not revoke a separate overlapping folder grant.",
    );
    if (
      (await prompt.question("Enable browsing for this exact location? (Y/N) "))
        .trim()
        .toUpperCase() === "Y"
    ) {
      await addBrowseGrant(dir, choice);
      console.log(
        "Browse location saved. Reload the selected-folder list in Memory; no index refresh is needed.",
      );
    }
  }
} catch (error) {
  console.error(error.message || "Storage settings could not be updated.");
  process.exitCode = 1;
} finally {
  prompt.close();
}
