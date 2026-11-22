# Conversational selected-folder access

In Auto or Local mode:

- “Show my connected folders” reports selected labels and current index coverage.
- “Refresh my laptop file index” scans only the folders already selected on the host.
- “Find laptop files about aircraft maintenance” searches those indexed passages without a model. “Containing” can replace “about”.

These are exact command families with optional Nexus/please prefixes. Search text is treated as a query, never a path or shell command. Folder selection remains local through `Setup-Nexus-Folders.cmd`. Connected Obsidian roots participate under their existing Markdown-only restrictions. The legacy environment-only Obsidian adapter is separate and is not a selected root in this view.

The authenticated paired controller and same-origin checks precede command processing. Recognized file commands in cloud, Compare or Knowledge-only modes are rejected before any provider call. Android requests inspect its paired host's selected-folder index, not Android files. No credentials, account writes, new grants, whole-drive access, file editing/moving/deletion or OS application launch are added.

The existing scanner bounds, file-type exclusions, symlink/junction checks, size limits and content-hash validation apply. A refresh changes only the private index, not source files. Search/status revalidate indexed file identity; changed, deleted or unavailable files are withheld until a successful refresh. A missing result is not proof that a file does not exist elsewhere. Partial scan and stale-file warnings remain visible. Refresh completion does not mean every selected file was indexed successfully.

Results are literal matching source passages with labels/locations, up to eight passages and 1,200 characters per passage. They are evidence, not generated conclusions or executable instructions. The search remains lexical and relevance ranked, not an exhaustive exact-content search. Cancellation before dispatch prevents a refresh; once underway a bounded scan may finish updating the index even if the browser request is closed.

This is an initial read-only file-access integration in architecture milestone 4. Broader file mutation, the general broker/helper, desktop takeover and browser execution remain pending. Tests use isolated synthetic selected folders; Windows path/junction behavior and native voice acceptance remain separate checks.

## Reading beyond a search excerpt

Search results now offer Read file buttons for the distinct matching indexed files. Reading returns up to 3,000 characters from one indexed section at a time, preserving its source location. Next part advances through the remaining extracted text. You can also ask “Read laptop file manual.txt” using an exact indexed relative name, basename or stable file ID. Duplicate names produce choices; Nexus does not guess.

Buttons carry the selected file ID and content hash. Subsequent parts require that version reference, revalidate the current selected-folder snapshot and reject a changed version, even after an index refresh. A missing/deleted/unselected/stale file cannot be read through an old reference. Out-of-range parts are rejected. References are selectors, not authorization: controller/local-mode and selected-folder checks still apply. No caller-supplied path is opened.

This reads extracted indexed text only, not every original PDF image, formula, page or embedded element. Existing partial-index warnings remain visible. “End of indexed text” is explicitly distinct from complete extraction of the original. Literal source text is not interpreted as instructions and no model or external provider is contacted. Reading does not open an OS application or change the source.
