# Reviewed model archive transfer

After the artifact acquisition preview passes its metadata/capacity checks, the owner can acknowledge that the commit's license terms were reviewed and choose **Download reviewed file to laptop archive**. This is a separate explicit controller action. A lookup, preview, page refresh or update does not start a transfer.

The API re-reads the immutable source commit, compares filename/bytes/SHA-256/license identifier and checks current capacity again. It accepts only the exact selected source identity, expected license and `licenseReviewed: true` / `archiveOnly: true`; no custom URL, destination, token, branch, command or runtime import is accepted. The first profile supports an anonymous ungated single non-split GGUF file up to 4 GiB. It does not assess full GGUF structure or runtime compatibility; the bytes' initial GGUF magic alone is not proof of a runnable model.

## Transfer and publication

- One active transfer per local server process, with a 10-minute combined operation deadline. The intended deployment is the existing single local Next server, not a multi-worker shared archive service. Cleanup/filesystem operations may finish after cancellation or the network deadline.
- Fixed HTTPS Hugging Face resolve URL at the selected commit. Manual GET redirects allow at most four requests total and only exact candidate delivery hosts: `huggingface.co`, `cdn-lfs.huggingface.co`, `cdn-lfs.hf.co`, `cdn-lfs-us-1.hf.co`, `cdn-lfs-eu-1.hf.co`, `cas-bridge.xethub.hf.co`. Unknown hosts, non-HTTPS URLs, custom ports, credentials/fragments and excess redirects fail closed. These delivery routes remain live-unverified in this cloud.
- No authentication, cookies, owner memory or private excerpts are sent. Signed redirect query strings are transient and are not written to errors/receipts. No automatic retry/fallback/resume is performed.
- Stream to a private create-only partial file; enforce the reviewed byte count and SHA-256, then sync and hash-read the stored bytes again. A missing/wrong size, wrong hash or invalid magic prevents publication.
- Publish using create-only same-volume linking, never overwrite an existing model. Retain an exclusive bounded receipt with source identity, license acknowledgment, byte count, digest, verification time and archive-relative location. Receipt writes receive same-handle readback verification.

The private archive lives under the installation data directory's `model-assets/asset-000` through `asset-099`. The application rejects symlink/non-directory ancestry and rechecks directory/file identity before publication; this is defensive local bookkeeping, not an operating-system sandbox or a guarantee against a privileged local writer. Capacity is not reserved and can change during a transfer. Repeated explicit successful downloads create separate retained records rather than deduplicating prior files. No existing record is automatically removed to make room.

Each successful slot contains `model.gguf` and `receipt.json`. A verified receipt describes bytes at the recorded time; it does not establish that the file is still unchanged later. The file is not executed, imported into Ollama, selected for inference, added to the knowledge index or promoted into owner memory. Runtime import and inference readiness remain false.

## Failure and restart limits

Cancellation/failed verification attempts remove only the identifiable owned partial file; failures during cleanup can retain it. Failed/cancelled receipts are retained. If a model was published but receipt completion cannot be confirmed, the response reports an uncertain result instead of success or an automatic retry. Closing/changing the browser preview cancels its request, but publication may already have occurred; inspect the archive receipt before repeating an uncertain request.

A process/OS crash can retain a started receipt or partial file. Automatic resume, archive history UI, deduplication, crash-recovery/reconciliation, pruning and runtime import are not implemented by this slice. Model archive records are separate from REA diagnostic receipts and foundation backup coverage. Do not run multiple server processes against the same private archive.

Validation uses tiny synthetic GGUF-header fixtures, actual local streaming/file hashing/readback and mocked delivery responses. No real model weights were acquired in this task. Live Hub/CDN access remains unverified because the cloud's outgoing policy blocked prior Hub API/documentation checks; no network policy or account setting was changed. Native Windows transfer/link behavior remains acceptance work despite the owner's successful native app builds.
