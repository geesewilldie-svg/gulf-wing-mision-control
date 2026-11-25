# Saved-note identity and version inspection

New reviewed owner-memory snapshots, reviewed task notes and automatic completed-task notes now register a private version record after the Markdown file has been saved and read back. Existing create-only save semantics remain: this feature never overwrites, merges, deletes or imports a note.

## Stable identity and source version

A logical note identity is derived from the selected vault/root ID, note kind, workspace and (for work notes) task ID. Repeated snapshots of the same logical source share that identity while retaining separate files and save receipts. The identity is bound to this source selection; moving/reselecting a vault does not silently adopt old files under a new root. It is catalog metadata, not a new identifier embedded into existing Markdown.

The captured source-version fingerprint is derived from the exact owner-record set or task record used to render the snapshot, excluding the export timestamp. Owner versions include record IDs/revisions/categories/content/update times. Work versions include task identity/scope/revision/mode/state/request/reason/output/update time. A concurrent source change before preview/save invalidates the reviewed request. A source change after a confirmed create-only save makes that copy historical; it does not rewrite it.

The catalog stores only bounded identity/provenance fields, source/file hashes, selected-root-relative file references, a canonical-path/filesystem-root identity hash and save time. It does not duplicate note bodies or credentials. Entry IDs and logical IDs are checked against their declared binding. Idempotent registration accepts an existing exact binding and rejects an attempt to rebind the same saved file to a different source version.

## Inspecting notes

In **Foundation → Owner memory and instructions → Saved note versions**, choose **Inspect [workspace] saved notes**. Inspection is controller-only and same-origin. It returns ten tracked rows at a time with scoped totals, last-check time, stable identity and separate file/source states:

| Dimension | Result | Meaning |
| --- | --- | --- |
| Saved file | Unchanged since save | Current bytes match the recorded saved hash within the selected source/root binding. |
| Saved file | External edit detected | Bytes changed after the save. The edited content is preserved and is not automatically imported. |
| Saved file | Saved file missing | The tracked file is absent from a still-selected, matching root. No recreation is attempted. |
| Saved file | Source unavailable | The root is removed/replaced/offline, the target is unsafe/unsupported for inspection, or reading cannot be confirmed. Root names/paths are not returned; filenames are withheld if the source binding cannot be validated. |
| Source record | Matches current source record | The original owner/task source version still matches. This is not independent verification of the note's claims. |
| Source record | Historical source version | The original source changed; this snapshot remains a historical copy. |
| Source record | Original task removed | The live task record no longer exists. Its exported file is retained. |

A historical copy is additionally marked superseded only when another tracked copy matches the current source version. This does not depend on wall-clock order or promote that new copy to factual authority. Owner correction/deletion still affects live SQLite context; retained snapshots remain excluded from automatic answer context by the existing source-family guard.

An inspection reads at most ten tracked files, each at most 1.5 MB. It reuses the selected-source link/junction/path/version checks and verifies current root identity before and after reading. Owner/task source stamps and selected-root configuration are checked across the request; changes require a fresh inspection instead of returning a mixed-version result. The checked timestamp describes that inspection, not continuous monitoring or a hard OS filesystem timeout.

## Failure and capacity boundaries

`.gulf-wing/note-versions.json` is a separate version-1 metadata catalog, bounded to 500 entries and 750 KB, updated through an exclusive local lock and atomic temporary-file rename. A corrupt/unsafe catalog is preserved and reported unavailable, not replaced with an empty catalog. A leftover lock is not automatically reclaimed.

Catalog registration and file indexing are separate from the already confirmed note save. Registration failure/full capacity reports **tracking pending**; it does not replay the Markdown write or turn the saved note into an unsaved result. Reviewed saves show this beside their controls; journal status counts new saved receipts whose tracking is pending separately from uncertain saves. There is no automatic metadata-retry/recovery or pruning in this slice. The file itself remains in the vault even if registration is pending.

Only new saves passing this version's registration hook are tracked. Older exports and legacy journal notes are not guessed, adopted or parsed into current facts. No generic Markdown path, arbitrary new content, import, replacement or deletion endpoint is added. Explicit conflict resolution, managed current-note replacement, catalog recovery/backfill and multi-agent write-back remain subsequent stages.

## Verification

Disposable fixtures verify shared logical identity, owner corrections, source supersession, external edits preserved byte-for-byte, deleted task versus deleted file, root revocation and replacement, mid-read source changes, corrupt catalog behavior, idempotent registration, wrong binding rejection, bounded pagination, scope isolation, route authorization and removal of private UI results after access denial. Existing journal anti-replay, snapshot indexing and private-context tests remain required. No owner note or permission is altered by these tests.
