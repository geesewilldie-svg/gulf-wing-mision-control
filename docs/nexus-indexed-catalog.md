# Indexed catalog search and Galaxy pages

Knowledge stars now support name/source-label search across the current selected-folder index, including records outside the first 80-star view. In **Memory → Knowledge stars → Find files and view controls**, use **Search all indexed file names** and **Search indexed catalog**. **Show indexed catalog** clears that search. The existing Find files and Galaxy rail controls still filter loaded stars locally.

Each server page contains at most 80 real file records. Previous/Next indexed stars preserves the submitted query and loads another page; selection/reader state is cleared during reload. A found star uses the existing focus-first/open-explicitly behavior. Searching and paging never invoke read-indexed or an original-file endpoint. The server uses existing freshness checks and controller/same-origin authorization, withholding changed/unavailable files. Lost access clears the private map. Query length is capped at 200 characters and page offsets at 160 under the existing 200-file index limit.

Coverage reports matched/current indexed files, current page size, withheld files and existing partial-index warnings. This is name/source-label substring search over the selected-folder index, not whole-drive discovery, document-body search, SQLite owner-memory search or a claim to include every laptop file. Metadata browsing remains separately available in Storage galaxy.

## Explicit relationship metrics

The map counts resolved directed wiki links, unresolved targets and files with partial link extraction across the current index, independently of the displayed page or search. It uses the existing same-Obsidian-root literal-link resolver. Repeated identical targets in one source are deduplicated, self-links excluded, reciprocal links count as two directions, and ambiguous/unavailable targets remain unresolved. There is no semantic inference or drawn connection line.

These counts are bounded extracted-text metrics: each source checks at most 200,000 text characters and 100 link candidates, returns at most 20 resolved targets, and exposes partial extraction. Original-file extraction itself may be incomplete. Consequently these are not complete original-vault or global-memory relationship totals. The existing index/file-size limits remain in force; no model call, indexing refresh, filesystem write or access grant is introduced by search.
