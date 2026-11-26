export const reaTarget = Object.freeze({
  package: "rea-agents",
  version: "6.10.1",
  engines: "^22.23.4 || ^24.22.1 || >=26.12.1",
  sourceRevision: "0f4ec6231828ec0af1807f2d093d94e5d103a553",
  archiveIntegrity:
    "sha512-3AWrfFEXppvC98FWhZR2Tzulnqs5xJQrSKmAub6+QME/I58Pr3h8pHqqwM30z2DvlnIx/8Hsu8woMngfi4SNyg==",
});
export function reaRuntimeCompatible(version) {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger)) return false;
  return (
    major > 26 ||
    (major === 26 && (minor > 12 || (minor === 12 && patch >= 1))) ||
    (major === 24 && (minor > 22 || (minor === 22 && patch >= 1))) ||
    (major === 22 && (minor > 23 || (minor === 23 && patch >= 4)))
  );
}
