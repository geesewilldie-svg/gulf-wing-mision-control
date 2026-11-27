export type LocalModelDetails = {
  model: string;
  digest: string;
  checkedAt: string;
  format: string | null;
  family: string | null;
  parameterSize: string | null;
  parameterCount: number | null;
  quantization: string | null;
  architecture: string | null;
  contextLength: number | null;
  embeddingLength: number | null;
  capabilities: string[];
  capabilitiesKnown: boolean;
  capabilitiesOmitted: number;
  notice: string;
};

// Keep this first slice to simple local names. Never admit cloud selectors,
// URLs, provider namespaces or caller-supplied runtime options.
export function localDetailModel(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 200 &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*(?::[A-Za-z0-9][A-Za-z0-9._-]*)?$/.test(
      value,
    ) &&
    !/(?:^|[-:])cloud(?:$|[-:])/i.test(value)
  );
}
