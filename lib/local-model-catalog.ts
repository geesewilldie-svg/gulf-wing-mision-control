export type LocalModelCatalog = {
  checkedAt: string;
  configuredModel: string | null;
  configuredListed: boolean | null;
  reportedEntries: number;
  uniqueModels: number;
  omitted: number;
  rejectedEntries: number;
  models: {
    name: string;
    bytes: number | null;
    digest: string | null;
    modifiedAt: string | null;
  }[];
  notice: string;
};
