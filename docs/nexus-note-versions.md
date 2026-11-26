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

Catalog registration and file indexing are separate from the already confirmed note save. Registration failure/full capacity reports **tracking pending**; it does not replay the Markdown write or turn the saved note into an unsaved result. Reviewed saves show this beside their controls; journal status counts new saved receipts whose tracking is pending separately from uncertain saves. New automatic journal receipts with captured recovery proof now receive bounded metadata-only retries while the journal is enabled (see below). Older receipts remain pending; new reviewed saves can offer an explicit metadata-only retry while their signed session proof remains valid. No automatic catalog repair, adoption or pruning is supplied. The file itself remains in the vault even if registration is pending.

Only new saves passing this version's registration hook are tracked. Older exports and legacy journal notes are not guessed, adopted or parsed into current facts. No generic Markdown path, arbitrary new content, import, replacement or deletion endpoint is added. Explicit conflict resolution, managed current-note replacement, catalog recovery/backfill and multi-agent write-back remain subsequent stages.

## Verification

Disposable fixtures verify shared logical identity, owner corrections, source supersession, external edits preserved byte-for-byte, deleted task versus deleted file, root revocation and replacement, mid-read source changes, corrupt catalog behavior, idempotent registration, wrong binding rejection, bounded pagination, scope isolation, route authorization and removal of private UI results after access denial. Existing journal anti-replay, snapshot indexing and private-context tests remain required. No owner note or permission is altered by these tests.

## Review a separate current copy

After inspection, a changed, missing or historical tracked note can offer **Review a separate current copy** when the original selected source remains available and its live Nexus record still exists. A historical note already superseded by a tracked current-source copy does not offer another copy. Removed tasks and revoked/replaced roots do not expose this action.

This opens the existing reviewed vault-save workflow. The preview comes from the current SQLite owner records or task artifact, not from the external file's edits. Opening the controls and cancelling never writes a note. Confirmation creates a new independent snapshot in the configured destination; a changed source invalidates the preview. Existing files and edits remain intact. Inspect again after saving to update the list. Destination permissions are checked again by the existing preview/save handler.

This is an explicit keep-both review path, not an automatic merge, file replacement, import or ongoing synchronization. No conflict is silently resolved and no historical file becomes current owner memory. External edits must still be reconciled deliberately. Metadata recovery, legacy adoption, managed current notes and broader agent write-back remain later stages.


## Journal tracking recovery

New confirmed automatic saves retain their captured source fingerprint, verified selected-vault identity and original registration time in the private journal receipt. While the existing opt-in journal is enabled, each tick attempts at most two pending version registrations, rotating through at most 500 receipts. This only writes private catalog/receipt metadata; it never calls the Markdown publisher again. The same source fingerprint is used after task correction/deletion, preserving historical provenance instead of binding old bytes to the current task.

Registration checks the original file hash, protected relative path and captured vault identity. Changed/missing files, removed/replaced roots, corrupt/full catalogs and an occupied catalog lock remain pending. A transient lock may recover after its owner releases it; recovery never deletes a lock or repairs a corrupt catalog. If registration succeeded but the receipt update failed, the next attempt is idempotent. Original saved time is retained on recovery.

Unconfirmed/started claims, legacy receipts without recovery proof and reviewed saves are not retried by this worker. Disabling the journal stops these retries. At most two eligible receipts are attempted per pass; index metadata retains its independent existing two-attempt budget. These limits bound file attempts and byte reads, not OS filesystem latency. Existing snapshots remain excluded from automatic answer context.


## Reviewed-save metadata retry

When a newly confirmed reviewed snapshot has pending indexing or version tracking, the save controls may offer **Retry saved-note metadata only**. A signed 30-minute proof binds the original source version, selected-vault identity, relative saved file and confirmed hash. It is issued only after a protected read verifies the saved copy and only when metadata is pending. The proof carries metadata, not a note body or execution grant, and is kept only in the current review component's session state.

The controller-only, same-origin retry operation accepts only that proof and retries catalog registration/index insertion; it never calls the Markdown publisher. Exact file hash and root binding are rechecked first. Changed/missing files, revoked/replaced roots, tampered/expired proofs and credential rotation reject recovery. Original source identity is retained even if owner records or a task changed since the save. Successful repeat calls are idempotent. Full/corrupt/locked catalogs can remain pending and are never repaired or pruned by retry.

Leaving the view, starting another review or losing access clears the control. There is no durable reviewed-save recovery ledger or legacy backfill in this slice. An expired/unavailable proof is not a reason to publish another copy: the original note remains in the vault and normal full index refresh can still discover eligible files. Explicit retry is separate from the existing automatic confirmed-journal metadata recovery.
