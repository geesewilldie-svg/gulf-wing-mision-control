# Create a separate local runtime model

After **Check runtime blob** reports presence, archive history offers **Create new local model** with a source/license confirmation. This is a separate explicit write from staging or review. It creates a runtime model under a fresh `nexus-archive-<UUID>:latest` name; it never chooses an existing name, changes the saved model selection or starts inference.

The controller-only, same-origin endpoint accepts exactly `create-runtime-model`, archive slot, inspected source receipt SHA-256, staging run ID, expected recorded license, `licenseReviewed: true` and `createOnly: true`. Caller aliases, paths, prompts, templates, messages, parameters, quantization settings and URLs are rejected. No repository Python, native command or custom Modelfile is executed by Nexus.

## Execution-time prerequisites

The action shares the local answer/planning/diagnostic inference slot. It rechecks full current source size/hash and original receipt identity, the selected staging association and recorded license. The staged outcome may remain uncertain: a fresh runtime HEAD must report the exact required blob present; no missing blob is uploaded or retried here.

The first creation profile requires little-endian GGUF v2/v3, complete bounded metadata with a declared architecture identifier and nonzero declared tensor count. Runtime staging/creation can inspect up to 8 MiB of tokenizer/other metadata; lightweight metadata previews retain their existing 1 MiB limit. Opaque tokenizer arrays are skipped as data rather than decoded as display text. This is not independent tensor validation. Actual parsing/support is left to the local runtime and checked through its response/metadata.

Minimum observed host free RAM and process-available memory must both be known, with the lower value covering two artifact sizes plus 1 GiB. The same conservative disk buffer must be observed at the known runtime model-store/blob locations. These are momentary policy checks rather than reservations, measured working-memory requirements or GPU/context-fit guarantees. The runtime catalog must be completely inspectable within this profile (fewer than 100 models, no invalid entries). Unknown or insufficient prerequisites stop before creation.

## Creation and acceptance

Nexus generates the name and requires `/api/show` to return 404 for it before claiming a separate exclusive local creation receipt. It then makes one fixed loopback `/api/create` request containing only that name, `files: {"model.gguf": "sha256:<verified source hash>"}` and `stream: false`. A reported existing name is never intentionally reused. The upstream API does not provide an atomic create-if-absent operation; fresh random names and preflight avoid intentional/accidental replacement, while unrelated concurrent runtime clients remain outside Nexus coordination.

Acceptance requires the runtime's success response, non-remote GGUF metadata with the source's declared architecture, a current catalog entry for the generated name with a valid reported manifest digest, unchanged configured selection and unchanged staging/source evidence. The source identity fence closes before the creation receipt is finalized and read back. A runtime manifest digest is distinct from the source weight-file SHA-256.

A `created` receipt means runtime-reported creation corroborated by metadata/catalog at the recorded time. It sets `runtimeImported: true` for this creation operation and keeps `inferenceReady: false`. Refresh **Installed local models** to inspect the alias and request the existing explicit local diagnostic. No diagnostic is automatic, and a created model is not proof of sustained performance or a safe larger context on the 8 GB laptop. Original archive/transfer/staging receipts remain unchanged; their original flags describe those earlier actions.

## Retained outcomes and limits

`runtime-model-create.json` is a separate, initially exclusive receipt per archive, binding source/staging identity, generated name, run/time and started/created/failed/cancelled/unconfirmed outcome. Only the owned open receipt is updated. Prior, malformed or unsafe receipts are retained and block replay. Archive history projects known fields without runtime probes or automatic recovery. Historical creation does not prove the model still exists or retains the same current bytes.

Once creation is attempted, response failure, cancellation, changed evidence, post-create mismatch or receipt uncertainty can leave a model/name on the runtime. Nexus retains the name/outcome without automatic retry, deletion or rollback. A crash can leave incomplete metadata. The existing ten-minute cooperative source-operation deadline applies, and generation admission is released on exit. Explicit model-creation reconciliation/receipt recovery and broader model lifecycle remain separate work.

The adapter trusts the existing loopback Ollama service boundary and its reported blob/catalog/metadata, not independent process or stored-byte authentication. It sends no owner memory, file excerpts or conversation to inference and requests no external hosted service, pull or generation. Native Windows/installed Ollama support and real-model inference remain unverified by cloud fixtures.

Contract reviewed November 27, 2026: [official Ollama Create a Model](https://github.com/ollama/ollama/blob/main/docs/api.md#create-a-model), including GGUF blob files and non-streaming output. Validation uses tiny synthetic GGUF sources, disposable stores and an owned HTTP runtime fixture, not an actual Ollama model parser/inference runtime.
