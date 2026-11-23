# Real file galaxy and expandable globe

Owner requirement accepted November 23, 2026. This document records the requested build; it does not claim that the real file galaxy or globe expansion is implemented.

## Requested behavior

- Galaxy and request globe each have a clearly labelled Expand / Fullscreen control. Each can independently fill the usable viewport and return to its previous layout; support browser fullscreen when available with a usable in-page expanded fallback. Exit remains visible; Escape returns focus to the originating control. Preserve zoom, selection and orientation where possible.
- Every selectable file-shaped galaxy dot represents a real currently authorized indexed file, with a stable file ID, version reference, readable name, folder/vault and coverage state. Do not map the existing decorative 1,050-point demo to invented files. Folder or provider hubs, if used, have distinct shapes/labels and are not counted as file dots.
- Show atom-like nodes and connecting stems/edges so the owner can explore related sources. Initial connections are selected-folder membership and literal resolved Obsidian wiki links already provided by the source map. Edge labels explain that evidence; visual proximity alone makes no semantic claim. Company/job/person relationships require a later evidence model, named source passages and uncertainty, rather than guessed edges.
- Clicking/tapping a file dot selects it and opens an accessible viewer with the file title, source location, content and close/back controls. Follow connected nodes without losing orientation. The existing version-bound indexed reader supplies the first text viewer and Next part navigation. It must be labelled indexed text with coverage limits.
- Retain the owner's requirement to inspect original files as well: provide an independently authorized View original / Open original path for supported formats in a later bounded file-view adapter. PDFs should be viewable as documents where supported, not represented as fully opened merely because extracted text is displayed. Revalidate selection, current identity/hash and permissions before returning bytes or launching a native viewer. Unsupported/protected/scanned formats get a clear explanation, not a false success.
- Include search/filter, zoom, pan/rotate as appropriate, reset and a list alternative for keyboard/screen-reader use. Large indexes need disclosed caps or clustering with counts and a way to find omitted files. Reduced-motion and phone/touch use remain supported.

## Current implementation and reuse

At requirement capture, HolographicCore's Galaxy used deterministic demo points and demo agents and the request globe lacked expansion. The first implementation below replaces Galaxy mode with selected real files and adds independent expansion. Core/terrain remain demos; whole-drive/original-file navigation is still not implemented.

Reuse sourceMap / noteLinks for explicit current metadata and same-vault wiki links, fileSnapshot for stale/permission filtering, and readIndexedFile for hash-bound parts. The file galaxy is a separate authenticated data view; the request globe remains a provider/activity view. Setup inventory, node selection, live service activity and a source relationship are distinct facts.

## Next implementation sequence

1. Preserve current Copilot repair and native verification independently.
2. Add accessible labelled expansion for the existing galaxy/core and request globe; verify desktop, narrow/touch, keyboard, Escape/focus return, resize and reduced motion. Expansion is presentation, not new authority.
3. Supply the authenticated galaxy with bounded real file nodes and evidence-bearing folder/wiki edges, selectable names, name filters and a list alternative. Unpaired/display-only screens get no private filenames, contents or identifiers. Decorative demo geometry remains clearly separated or removed from this file mode.
4. Open hash-bound indexed text in a pane that works in normal and expanded modes. Abort/withhold stale, revoked or changed files. On controller loss clear private nodes/content and leave no stale selectable copies.
5. Add supported original-document viewing only through a separately tested bounded adapter. Do not serve arbitrary filesystem paths or interpolate file names into shell commands.

## Acceptance

Use known synthetic folders/notes to assert file node counts, folder membership and explicit wiki edges. Click a node and verify the correct indexed text and next part; follow an edge and verify target ID/hash. Remove a folder or change a file and verify withholding. Test duplicate names, partial indexes, unsupported originals, auth loss, fullscreen rejection/fallback and keyboard/touch operation. Capture actual owner-laptop behavior for expansion, source selection and viewing before calling this feature native-accepted.

A graph or fullscreen button adds no provider consent, file-edit right, arbitrary terminal access or Microsoft/GitHub account access. Copilot work continues separately.

## Owner clarification: a visual whole-computer file explorer

The owner clarified that Memory Galaxy should work like their Files/File Explorer: see available drives, browse what is in each drive, enter Pictures, Downloads and other folders, select files and open them. Retain all owner-accessible drives/folders/files as the target, not only previously selected/indexed notes. This includes non-text content such as pictures and documents.

The intended navigation is Computer → Drive → Folder → File, with breadcrumbs/back, familiar folder labels and an optional atom-like connection layout. Folder membership is a real connection independent of semantic note links. Browse metadata lazily for the opened drive/folder, paginate or cluster large directories, and disclose how many children are shown. Do not attempt to put millions of fabricated or unlabelled points on one screen. Each actual visible file dot represents a file; folders/drives use distinct shapes and can be entered.

Browsing, indexed search, model context and native opening are separate operations. A file can be browseable without being searchable or sent to a model. Provide OS-permission-respecting directory listing and an opaque identity-bound read/open adapter; revalidate the chosen file at use time. Listing drives does not silently ingest their entire contents, expand search scopes or authorize external transmission. Do not require the user to manually add every folder as a permanent knowledge source to achieve ordinary Explorer navigation. Unavailable/removable/cloud-only drives and denied access need accurate states; do not auto-elevate or claim complete coverage.

Original file behavior should match the format: direct image/PDF viewing when supported, a clear indexed-text option where available, or explicit native app opening for other formats. Downloads/Pictures/OneDrive need real host locations rather than assumed paths. This broader Explorer adapter remains to be implemented after the bounded indexed-galaxy first slice. That slice must explicitly say selected indexed files and must not claim the whole-computer requirement is complete.

## First implementation slice

The selected-index galaxy, evidence-bearing folder/wiki edges, searchable/list-based node selection and hash-bound text viewer are now implemented for paired controllers in Overview. Galaxy/core and request globe have expanded viewport controls plus browser-fullscreen attempts. Original-file/all-drive exploration remains planned. Expanded/collapsed source-view remount currently reloads metadata and clears selection; persistent selection/orientation across expansion is an identified follow-up. Native owner acceptance remains pending installation.

## Shared Mission Control surface requirement

The owner clarified that Memory Galaxy belongs to the entire Mission Control base: laptop, phone and every future base of operations. Implement it as a shared resource-navigation service and responsive UI, not a laptop-only decorative card. Paired controllers use the same host-backed Memory section from desktop/mobile browsers, with appropriately sized pointer/touch/keyboard controls. Preserve source-host identity when multiple bases are added. A phone browsing a host's files is different from browsing the phone's own storage; each device's local-storage adapter, availability and authority must be implemented and verified separately. Do not silently merge files across hosts or imply access to offline bases. Presentation access does not automatically reveal private file metadata.

## Owner visual correction

Preserve the original animated spiral Galaxy style in the dashboard. The owner explicitly rejected the flat diagram replacement. File access must feel like selecting stars inside that existing galaxy, with an enlarged readable file preview. The corrective implementation restores the three-arm star field/HUD rings and overlays actual file stars; ambient decorative stars are not files and are labelled accordingly. File previews are modal overlays, not a small pane below a different diagram. The visual correction does not complete whole-drive browsing or original-document viewing.

## Owner refinement: no lines, file-star neighborhoods

The owner wants no lines connecting file stars. Preserve the original galaxy field and HUD treatment. Selecting a file star should zoom/recenter it and reveal nearby real file stars, analogous to selecting a galaxy then exploring nearby bodies. The implementation's first click focuses without reading contents; Open file or a second click on the centered star opens its preview. Nearby stars can be selected as the next focus, with Back and Return to galaxy.

Current neighborhoods use shared selected-folder membership or literal incoming/outgoing wiki links, not a model's semantic guess and not a claim that one document contains other files. At most twelve nearby stars are shown; the file-list alternative retains access to the displayed index. Missing/stale/unselected sources do not become neighboring stars. Original all-drive/original-file browsing remains a separate unfinished adapter.
