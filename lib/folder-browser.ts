export type FolderReference = { id: string; name: string; handle: string };
export type BrowserRoots = {
  host: { id: string; label: string };
  roots: {
    id: string;
    rootId: string;
    name: string;
    kind: "folder" | "obsidian";
    available: boolean;
    handle?: string;
  }[];
};
export type FolderPage = {
  location: {
    id: string;
    parentId: string | null;
    rootId: string;
    rootLabel: string;
    name: string;
    relativeName: string;
  };
  entries: {
    id: string;
    name: string;
    relativeName: string;
    kind: "folder" | "file";
    size: number | null;
    modifiedAt: string;
    handle?: string;
    original?: { handle: string; view: "picture" | "document" | "download" };
    indexed?: { id: string; hash: string; sections: number };
  }[];
  inspected: number;
  omitted: number;
  visible: number;
  limited: boolean;
  nextCursor: string | null;
};
