import { test, expect } from "@playwright/test";
import { galaxyNeighborhood } from "../lib/galaxy-neighborhood";
test("file star neighborhoods use current shared-folder or explicit-link evidence only", () => {
  const files = [
    { id: "center", rootId: "first", noteLinks: { links: [{ id: "linked" }] } },
    { id: "sibling", rootId: "first" },
    { id: "linked", rootId: "second" },
    {
      id: "incoming",
      rootId: "third",
      noteLinks: { links: [{ id: "center" }] },
    },
    { id: "unrelated", rootId: "fourth" },
  ];
  expect(
    galaxyNeighborhood(files, "center").visible.map((file) => file.id),
  ).toEqual(["center", "sibling", "linked", "incoming"]);
  expect(galaxyNeighborhood(files, "missing").focus).toBeNull();
  expect(
    galaxyNeighborhood(
      files.filter((file) => file.id !== "linked"),
      "center",
    ).nearby.map((file) => file.id),
  ).not.toContain("linked");
  const bounded = galaxyNeighborhood(files, "center", 1);
  expect(bounded.nearby).toHaveLength(1);
  expect(bounded.omitted).toBe(2);
  expect(galaxyNeighborhood(files, "unrelated").nearby).toEqual([]);
});
