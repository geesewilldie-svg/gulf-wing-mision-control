# Selected laptop folders and Obsidian search

This delivery adds a read-only local file index, searchable from Connections and Ask Nexus. It does not connect a cloud drive, grant general PowerShell access, install Obsidian, or index the entire laptop. The relationship-graph view remains a later feature; search results point to real indexed source previews now.

## Windows setup

1. After pulling the update, stop only the project's running Next server, build, and run `Start-Nexus.cmd` as usual.
2. Run `.\Setup-Nexus-Folders.cmd` from the project directory, or double-click it in Explorer. Enter `obsidian` for a Markdown vault or `folder` for business documents, give it a short display label, then choose the folder in the Windows picker. Cancellation makes no change. Repeat for up to four folders. Selecting an existing folder is idempotent.
3. Open Nexus → Connections → Laptop files and Obsidian → **Refresh file index**. Folder selection is reread without restarting Nexus. Browser/phone requests cannot add arbitrary laptop paths.
4. Check the refresh time, indexed/skipped counts and partial-index messages. Search for a phrase in a known document, then open its **Preview source** button. Preview shows extracted text, source modification time and index time, rather than opening/executing the original file.
5. Ask Nexus the same question in Knowledge only mode. Connected-file excerpts join imported plans and operating records. Existing local-first routing and per-question external-sharing controls still apply.
6. Edit or delete that test document: previous indexed text should be withheld until refresh. Remove a folder in Connections when no longer needed; refresh any remaining folders afterward.

Choose a specific approved business folder or vault, not a drive or the entire Windows user profile. All paired controllers share this index; display-only devices cannot read it. This is a laptop-hosted shared workspace, not a tenant-isolated customer/contractor file portal.

## Coverage and limits

- Business folders: `.md`, `.txt`, `.pdf`, `.xlsx`; Obsidian: `.md` only. Other file types are counted as skipped. Word DOCX, images, audio, OCR, Google Docs shortcut files and arbitrary binary formats are not supported in this delivery. Files must be readable through the laptop filesystem; Windows may hydrate a synced cloud file when it is read.
- Up to four roots, 200 files, 8 MB of source bytes, 2 million extracted characters, 4,000 directory entries and depth eight per refresh. Individual files are at most 2 MB; existing PDF (100-page) and workbook parser/archive limits still apply. The elapsed-time check between entries stops further traversal after 45 seconds; it is not a hard deadline for a single parser call.
- Hidden entries, application/configuration folders, credential-like names, symlinks and Windows junctions are excluded. Exclusions are not a secret detector: select folders appropriate for all paired controllers to read.
- Source metadata and content hashes are rechecked before returning connected text; unavailable, redirected or changed sources are withheld. Refresh builds a replacement snapshot, including removal of previously indexed text from unreadable folders. Partial coverage is visible and does not mean every file was indexed.
- Scanned PDFs need OCR first. Spreadsheet formulas are not recalculated; cached values may be stale or absent. Original files are never edited, moved, deleted or executed by this connection.
- Search is keyword-ranked across extracted text. Previews show up to eight extracted sections. They are not full original-file viewers or proof of business facts. Document contents are evidence, not agent instructions.

## Private storage and removal

`local-folders.json` and `local-file-index.json` live in the private `.gulf-wing` directory (or `GW_SYNC_DATA_DIR`) and are git-ignored. Absolute source paths stay server-side; the browser receives folder labels and relative source names. The index contains private extracted text; protect/backup the laptop accordingly. Refresh writes atomically, preserving the old file if a write fails. Malformed configuration fails closed and is not silently replaced.

Removing a root deletes the connected-file snapshot and removes that root from the selection. Original files and separately imported `knowledge.json` remain. Existing chat answers, downloaded backups and external excerpts already deliberately shared are not retroactively erased. If the legacy `GW_NEXUS_OBSIDIAN_VAULT` environment setting is configured, that independent live Markdown reader remains active until its configuration is removed; the selected-folder controls do not change environment variables.

## Remaining connections

Selected read-only Google Drive, Docs and Sheets snapshots and multiple Calendar accounts are now implemented in the [Google Workspace increment](google-workspace.md); native authorization/acceptance is still required. Gmail, Tasks and other Google services remain in the [connection roadmap](nexus-connections-roadmap.md). Local folder setup does not itself authorize any Google account, Copilot/DeepAI integration or commercial provider entitlement.

## Validation

The default Turbopack production build passed. The complete desktop/mobile regression suite passed 378 tests with eight skipped. Eleven focused temporary-folder tests also passed, covering Markdown/text/PDF/XLSX extraction, Obsidian Markdown filtering, content-hash freshness, deleted files, symlink/root replacements, removal, scan limits, corrupt-index recovery and local setup preservation. Browser scenarios verified controller refresh/search/preview/Ask Nexus retrieval/removal and rejected display-only, unpaired, cross-site and arbitrary-path requests. Connection diagnostics (two tests), launcher checks (five) and synthetic local-AI setup passed. Synthetic model/voice runtime checks passed without real inference or account access. The native Windows picker, chosen laptop folder permissions and laptop walkthrough still require acceptance on the operator's device.
