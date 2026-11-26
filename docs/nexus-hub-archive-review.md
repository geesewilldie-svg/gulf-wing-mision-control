# Review local model archives

Connections → Models and tools → **Local model archive** exposes two separate explicit actions:

1. **Inspect local model archive** reads bounded local receipts and current published/partial-file size metadata. It does not read model weights, contact a provider, create directories, delete files or resume downloads.
2. **Check current file** hashes a recorded completed transfer against its recorded size/SHA-256. This reads the local model file only. It does not revalidate Hub metadata, license terms, model authenticity, runtime compatibility or inference readiness.

The list examines only fixed slots `asset-000`–`asset-099`, reads receipts up to 8 KB, projects known fields and shows the newest 20 valid records. It separately reports valid, withheld and occupied counts. Symlink/non-directory ancestry, unsafe receipts and invalid schema/slot/source identities are rejected. Directory/file identities are checked around reads. Raw receipt fields, private absolute paths and arbitrary directory contents are not returned. Missing archive storage remains an empty state rather than a reason to create files.

Recorded verified, failed, cancelled, unfinished and publication-unconfirmed outcomes stay distinct. An unfinished receipt can be active or interrupted; process liveness is not inferred from receipt age or a saved PID. Current file-size agreement is explicitly labelled **hash not checked**. Missing or changed-size files and retained partials remain visible separately from the historical outcome. Failed or uncertain records cannot be promoted by this completed-file checker.

A fresh check supports one active hash operation per local server process, a 10-minute operation deadline and the archive's existing 4 GiB limit. It uses bounded-buffer reads, verifies file identity/size/mtime/ctime around hashing, then re-reads and compares the receipt identity/content and directory guards before accepting a matching result. Size differences return mismatch without reading model bytes. An unsafe or changing file/receipt returns no accepted hash result. Cancellation closes the owned file handle; neither model nor receipt is rewritten. Filesystem cleanup may outlast the operation deadline.

The controller-only same-origin API accepts only `{action:"list"}` or `{action:"verify",slot:"asset-NNN"}`. Caller paths, transfer options, deletion and source URLs are not accepted. The UI makes no archive request until explicitly invoked, clears results after denied/failed reads and allows download of the visible metadata projection as JSON without another server request. New UI uses the shared spaced cards/actions and wraps long identities on phones.

Local receipts can be edited by someone with host file access. A fresh match proves agreement with that local record at the checked time, not independently authenticated source provenance or permanent integrity. The separate Ollama catalog remains the place for installed-model metadata. Listing or hashing an archive does not import, execute, activate or index a model.

Automatic interrupted-run reconciliation, resume, pruning/deduplication and runtime import remain future work. This review slice adds no model/source network request and does not resolve the prior cloud Hub/CDN egress restriction. Native Windows file-check behavior remains host acceptance work; tests use actual tiny disposable local files and the compiled production API.
