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

HolographicCore's Galaxy uses deterministic demo points and demo agents. Its existing small Expand hologram button opens a viewport portal; it is not a real indexed-file graph. NexusAgentActivity's globe shows request/provider events and currently has no separate expansion control. Neither should be mislabelled as the requested file browser.

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
