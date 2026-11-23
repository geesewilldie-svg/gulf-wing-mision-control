# Memory Galaxy and file stars: governing plan

Consolidated November 23, 2026 after comparison with the original saved architecture and the owner's later corrections. This is the current requirement; older progress notes describing a flat chart, connecting stems or immediate opening on first click are superseded. Implemented means code/fixture verification, not blanket native acceptance.

## Original architecture and the clarification

The earliest saved reconciliation, commit 735bd96, already required broad file capability, authoritative assistant memory, and a knowledge graph backed by real sources that opens underlying evidence. It did not explicitly specify Galaxy/file stars, the original spiral look, no connecting lines, zoom-before-open or whole-computer star navigation. These are now explicit interface/resource requirements under the same architecture; they do not replace its ownership, provenance or permission model.

## Required appearance and interaction

1. Retain the original animated spiral Galaxy in the main Mission Control dashboard and use that style across shared Memory surfaces. Do not substitute a flat node-map diagram. Brighter labelled file stars are real files; decorative ambient stars do not imply additional documents.
2. No visible lines connect file stars. Original scanner rings/ticks may remain part of the established galaxy styling.
3. First click/tap/keyboard selection zooms and centers a file star without reading its content. Nearby real file stars appear as a neighborhood, like selecting a galaxy/planet and seeing neighboring bodies. Selecting a neighbor changes focus; provide Back and Return to galaxy.
4. Open file or selecting the centered star again opens a large, readable source viewer. In-app Escape closes the preview before its parent galaxy. Keep explicit close controls, pagination where needed, focus return and keyboard/list alternatives.
5. Keep independent galaxy and request-globe expansion/fullscreen with a browser-fullscreen attempt and expanded fallback. Retain pause/resume, rotation, zoom, reduced motion and appropriate touch targets. Preserve selection/zoom/orientation across expansion where possible; the current remount resets these and needs follow-up.

## What neighborhoods mean

Use actual source membership or a literal indexed note link, not an invented relationship. Current code groups files sharing the selected folder or an explicit incoming/outgoing wiki link; it shows up to twelve nearby files and reports omitted neighbors. A file star is not a folder and does not physically contain its neighbors. A missing, stale, revoked or unselected source is not fabricated as a child. Later semantic relationships need their own source evidence and uncertainty; no model inference is required for the current layout.

## Complete storage/navigation target

Memory Galaxy is a visual File Explorer for all owner-accessible storage, not just selected knowledge notes. Support Computer → Drive → Folder → File, including Pictures, Downloads, OneDrive locations, images and documents. Drives/folders use distinct representations and can be entered; file stars select files. Supply breadcrumbs/back and a useful list/search alternative.

Enumerate actual host drives and special-folder locations. Browse metadata lazily for the opened directory, paginate/cluster large folders and disclose counts/coverage; do not draw millions of fabricated points or require permanent manual indexing of every folder for ordinary navigation. Accurately represent removable, cloud-only, offline and denied resources. Respect OS permissions; no automatic elevation is implied.

A browseable file need not already be indexed or provided to a model. Browsing, indexed search, SQLite assistant facts/rules/tasks, model context and original opening are separate capabilities. Do not ingest whole drives into assistant memory or transmit contents simply because stars are shown.

## Original files and resource contracts

The current preview is extracted indexed text, with hash-bound parts. It is not original PDF rendering, image viewing, native app launching or proof that all content was extracted. The full target retains direct image/PDF viewing where supported, and explicit native opening for supported other types. Unsupported formats must have an honest state.

The next resource adapter should preserve host/volume, opaque entry identity, parent identity, type, label, version/freshness, availability and supported browse/preview/open actions. Revalidate path identity, link/junction handling, source selection/authority and content version before returning bytes or launching a viewer. Do not expose arbitrary shell/path execution from a star label. Format/viewer success needs its own result evidence.

## Shared Mission Control, every base

Use a common resource service and responsive file-star interface for laptop, phone, controller ScreenPad and future operating bases. Identify which host owns a resource and whether it is reachable. A paired phone can use host-backed resources; its own internal storage and another base's drives require their own native adapters/permissions. Do not silently merge hosts or imply access to offline devices. Presentation access alone does not expose private names or content.

## Current status and next sequence

| Requirement | Status |
| --- | --- |
| Original-style spiral with current selected-index file stars | Implemented; owner observed restored styling before the latest focus refinement |
| No connecting lines; focus/zoom neighborhoods; Back/Return | Implemented and fixture-tested; latest native acceptance pending |
| Large hash-bound indexed-text preview | Implemented and fixture-tested |
| Shared Memory, Overview Galaxy, controller ScreenPad, globe expansion | Implemented with desktop/mobile fixtures; acceptance per native device pending |
| Selection/orientation preservation across expansion | Follow-up; current source-view remount clears selection |
| Drive discovery and lazy directory browsing | Not implemented; next file-resource adapter |
| Original PDF/image viewing and supported native opening | Not implemented |
| Phone-native storage, additional hosts and offline recovery | Not implemented |

Next work must implement the drive/directory resource layer without replacing the owner-approved visual direction. Then bind drive/folder navigation and original-file viewing to that layer. No new graph database is required merely to render file stars. Keep the provider-request globe separate from the file-star browser and keep the unresolved Copilot generation result separate from file permissions.

## Acceptance

Use synthetic files to verify real star counts, no drawn file connections, centering, zero content-read requests on focus, neighbor evidence/caps, star-to-star exploration, Back/Return, exact preview identity/version and explicit open behavior. Test stale/revoked sources, duplicate names, auth loss, empty folders, pagination, unsupported originals, fullscreen failure, keyboard/touch, reduced motion and selection persistence. Extend native acceptance to actual drive discovery, directories, image/PDF/native viewers and each host/device before marking whole-computer access delivered.
