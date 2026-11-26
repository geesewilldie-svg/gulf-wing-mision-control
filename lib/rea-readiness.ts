export const reaTarget = {
  package: "rea-agents",
  version: "6.10.1",
  engines: "^22.23.4 || ^24.22.1 || >=26.12.1",
  sourceRevision: "0f4ec6231828ec0af1807f2d093d94e5d103a553",
} as const;
export function reaRuntimeCompatible(version: string) {
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
export type ReaReadiness = {
  checkedAt: string;
  nodeVersion: string;
  runtimeCompatible: boolean;
  packageState:
    | "missing"
    | "pinned-metadata"
    | "different-metadata"
    | "unavailable";
  expected: typeof reaTarget;
  adapterReady: false;
  notice: string;
};
