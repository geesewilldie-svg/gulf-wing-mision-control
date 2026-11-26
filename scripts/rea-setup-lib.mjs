import { reaTarget, reaRuntimeCompatible } from "./rea-target.mjs";
export function validateReaLock(lock) {
  const packages = lock?.packages,
    root = packages?.["node_modules/rea-agents"];
  if (
    lock?.lockfileVersion !== 3 ||
    packages?.[""]?.dependencies?.[reaTarget.package] !== reaTarget.version ||
    root?.version !== reaTarget.version ||
    root?.integrity !== reaTarget.archiveIntegrity
  )
    throw Error(
      "REA lock does not match the pinned package/archive integrity.",
    );
  const entries = Object.entries(packages);
  if (entries.length > 1000)
    throw Error("REA dependency lock exceeds the package limit.");
  for (const [name, entry] of entries) {
    if (!name) continue;
    const url = new URL(entry.resolved);
    if (
      !name.startsWith("node_modules/") ||
      name.split("/").includes("..") ||
      entry.link ||
      url.origin !== "https://registry.npmjs.org" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.endsWith(".tgz") ||
      !/^sha(?:256|512)-[A-Za-z0-9+/]+=*$/.test(entry.integrity || "")
    )
      throw Error(
        "REA lock contains an unsupported dependency source or integrity.",
      );
  }
  return entries.length - 1;
}
export async function setupRea(io) {
  if (!reaRuntimeCompatible(io.nodeVersion))
    throw Error(
      `Node ${io.nodeVersion} does not meet pinned REA range ${reaTarget.engines}. No install was started.`,
    );
  const lock = await io.readLock();
  const packages = validateReaLock(lock);
  return io.withLock(async () => {
    if (await io.exists()) {
      await io.verifyExisting();
      return { state: "already-staged", packages, executed: false };
    }
    await io.reserve();
    await io.copyInputs();
    await io.install();
    await io.verifyInstalled();
    await io.record();
    return { state: "staged", packages, executed: false };
  });
}
