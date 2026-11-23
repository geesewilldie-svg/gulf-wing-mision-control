# Selected source map

In Nexus, use Auto or Local routing and ask **Show my source map**. Selected folders and Obsidian vaults appear as separate cards with current indexed files. Filter by folder label or file name, then choose **Read file** for the current indexed text.

Folder membership and supported explicit Obsidian wiki links are shown. Similar names or co-occurring text are not evidence of company, person, job or agent relationships. The map is not an inventory of model accounts or external services.

The existing file snapshot revalidates selection and current file hashes before map creation; stale/unavailable sources are withheld. Reading revalidates again and pins the selected version. Absolute root paths and document contents are excluded from map metadata. Existing warnings disclose partial/no scans. No automatic scan or model/provider call is made by this command.

The map displays up to 80 current files and reports omitted entries; use **Find laptop files about …** to search other indexed content. A name filter only filters displayed map entries, not document contents. An empty selected folder may have unsupported, excluded, changed or unindexed files; it does not establish that the folder is empty on disk. Refresh with **Refresh my laptop file index** when needed. Folder selection remains local through Setup-Nexus-Folders.cmd.

This command uses existing controller-only, same-origin and local-mode gates. It does not add file edits, browser automation, execution permissions, new providers or a schema migration.

## Explicit Obsidian links

The map resolves literal `[[Note]]`, `[[Folder/Note]]`, optional `.md`, heading suffixes and display aliases in current indexed Obsidian Markdown. Only a unique target in the same selected vault is linked. Exact vault-relative names take precedence; otherwise a bare note name must be unique. Source and target use existing current-file validation. Read linked note pins the target hash and revalidates at read time.

Missing, ambiguous, excluded, unavailable, external, relative-dot and unsupported targets are counted without disclosing their names. Self links and duplicate resolved targets do not create repeated controls. Embeds, inline backtick code, closed fenced code blocks and HTML comments are excluded by a bounded text scanner. This is not a complete Markdown/Obsidian parser: plugins, generated links, aliases declared in frontmatter, attachments and semantic relationships are not implemented. No source instruction is executed.

Each displayed source inspects at most 200,000 indexed characters and 100 wiki-link occurrences, and displays at most 20 unique linked targets. Limits produce a partial-coverage notice. The overall 80-source display cap still applies; a target can be read even when its own source card is beyond that cap. The map uses indexed extraction, not a claim of complete original-note coverage. Link labels are selected target file names, never model-generated relationship claims. No provider receives this content.

## Overview galaxy navigation

In Mission Control Overview, choose Galaxy. Paired controllers see real current indexed files as brighter labelled stars inside the original animated spiral style. Stems show shared-folder membership and literal wiki links; ambient decorative stars are not files. File names can be filtered and selected through the chart or Browse file list. Selecting a file opens an enlarged indexed-text preview. Read uses the exact selected ID/hash and revalidates current source access. Zoom controls and horizontal scrolling support the chart on narrow screens.

Expand view fills the viewport and offers Browser fullscreen, with an expanded fallback if unavailable; Escape/close returns to the dashboard. The request globe has a separate Expand request globe control. Core/terrain visuals remain demos. The galaxy is a selected-index browser, not yet the owner's requested whole-computer drive/folder explorer. Original documents are not opened by the indexed-text viewer. Expanding/collapsing currently reloads the child source view; do not assume a selection or in-flight preview persists through that remount.
