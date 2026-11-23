export type NeighborhoodFile = {
  id: string;
  rootId: string;
  noteLinks?: { links: { id: string }[] } | null;
};
// A visual neighborhood is evidence of shared source membership or a literal link,
// never a claim that documents physically contain other files.
export function galaxyNeighborhood<T extends NeighborhoodFile>(
  files: T[],
  focusId?: string,
  limit = 12,
) {
  const focus = files.find((file) => file.id === focusId) || null;
  if (!focus)
    return { focus: null, nearby: [] as T[], visible: files, omitted: 0 };
  const related = files.filter(
    (file) =>
      file.id !== focus.id &&
      (file.rootId === focus.rootId ||
        focus.noteLinks?.links.some((link) => link.id === file.id) ||
        file.noteLinks?.links.some((link) => link.id === focus.id)),
  );
  const nearby = related.slice(0, limit);
  return {
    focus,
    nearby,
    visible: [focus, ...nearby],
    omitted: Math.max(0, related.length - nearby.length),
  };
}
