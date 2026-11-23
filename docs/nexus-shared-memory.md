# Portable shared memory and Obsidian

The owner wants a lasting second brain shared across permitted agents and future models. Markdown knowledge should remain useful when a model changes; this supplies context rather than training a model. The animated Memory Galaxy is its visual entry point, with real file stars, zoom, nearby notes and explicit opening. Decorative stars do not represent invented memories.

## First delivered step

Foundation → Owner memory and instructions includes **Download [workspace] memory for Obsidian**. Choose the memory workspace and download a Markdown snapshot. Save it in a vault yourself if desired. The controller-authorized, same-origin export reads current database records at request time, includes up to 500 current records in that workspace, and records owner provenance, IDs, revisions and update/export times. Content is quoted; owner-stated facts are not independently verified. Tasks, model answers, conversation history and credentials are excluded. An empty workspace exports an explicitly empty note.

This creates a browser download, not an automatic write to a selected vault. Downloaded copies are private and do not synchronize: correcting or forgetting a record in Nexus does not erase exported copies, backups or copies already shared with another agent. The database remains authoritative for these records. No import or provider permission is granted.

## Next architectural stages

1. A dedicated Nexus-managed Markdown area in an explicitly configured Obsidian vault, with a clearly defined authority for each record. Preserve owner-created notes; track stable IDs, revisions and content hashes before any replacement. External edits must produce conflicts rather than silent overwrite.
2. Agent work notes with provenance: agent identity, source references, task/run IDs, timestamps, verification state and supersession. Separate owner statements, observations and unverified model proposals. Successful file writes do not verify claims.
3. Bounded automatic updates for authorized work, using durable write receipts, cancellation/revision checks and recovery after interruption. Define correction, forgetting and deletion propagation before enabling ongoing synchronization.
4. Relevant retrieval across allowed agents with workspace filtering, current access checks, context limits and existing per-provider sharing consent. Selecting a vault does not authorize external models to read it.
5. Galaxy views for these real notes alongside broader storage browsing. All-drive metadata browsing and original-file viewing remain separate adapters; the phone controls laptop-hosted sources without acquiring blanket phone-storage access.

Agent vault write-back, continuous synchronization, automatic learning from every conversation and general cross-agent delegation are not delivered by this export.

## Reviewed vault snapshots

Run `Setup-Nexus-Memory-Vault.cmd` locally on Windows, select an already configured Obsidian vault, and confirm the displayed grant. Setup creates a new `Nexus Memory Snapshots` directory and a local `memory-vault.json` grant bound to that vault's ID and canonical path. Existing directories are not adopted; existing grants are not replaced. Setup sends no model request and saves no owner-memory note.

In Foundation, select the memory workspace and choose **Review [workspace] snapshot for vault**. Read the exact Markdown, then **Confirm and save new vault snapshot**. Confirmation regenerates the snapshot and checks its hash against the preview; changed memory or previews older than fifteen minutes require fresh review. Save creates a uniquely named batch directory and Markdown file, with byte/hash read-back before publishing the final `.md` name. It never replaces prior notes. Refresh the selected-file index to bring the new note into the file-star galaxy, subject to normal file/index limits.

Saving requires controller authorization, same origin, explicit confirmation and local setup. Removing the selected vault or replacing the destination with a link/junction blocks saving. No arbitrary target paths or supplied Markdown are accepted by the endpoint. This is an owner-approved snapshot workflow, not continuous agent write-back. Old snapshots remain private copies: corrections/forgetting do not remove them. An uncertain/interrupted save must be inspected before retrying; a retry can create another snapshot. A crash may leave an unpublished `.tmp` file in its batch directory. Local users with permission to change grants or filesystem contents remain trusted; this is not an OS sandbox against a hostile local account.
