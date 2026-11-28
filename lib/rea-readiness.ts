import { reaTarget } from "../scripts/rea-target.mjs";
export { reaTarget, reaRuntimeCompatible } from "../scripts/rea-target.mjs";
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

export type ReaProtocolObservation = {
  serverVersion: string;
  tools: { name: string; schemaSha256: string }[];
  checkedAt: string;
  notice: string;
};
