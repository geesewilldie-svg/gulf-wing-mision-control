# REA, Hugging Face and Venice connection architecture

Requested by the owner November 25, 2026 after supplying the JARVIS transcript and official destination links. These are three different connector roles. `Show my connections` now retains all three as **Planned — not connected** targets. This registry addition does not install software, connect an account, enable model routing or perform a live probe.

| Target | Owner-supplied destination | Role in Nexus | Current evidence |
| --- | --- | --- | --- |
| REA | https://github.com/morluto/rea | Inspection tool adapter producing technical evidence/artifacts | Repository, source revision, MIT license, package identity and published runtime requirements verified below. Not installed or executed. |
| Hugging Face | https://huggingface.co/ | Model catalog and weight/artifact acquisition; optional hosted services are separate | Destination decoded from the supplied link. Direct access blocked by workspace network policy; no catalog, account, license or specific model checked. |
| Venice | https://venice.ai/ | Optional external inference adapter | Destination decoded from the supplied link. Direct access blocked; API endpoint/schema, accounts, pricing and actual model IDs remain unverified. |

Keep the layers distinct: REA does not supply an inference model; downloading Hub weights does not start a model runtime; a Venice response is hosted inference even when the interface and memory live on the laptop. None of these changes existing provider-sharing or browse-only storage grants.

## 1. REA: verified project, bounded adapter target

Reviewed public checkout: `morluto/rea` at **`0f4ec6231828ec0af1807f2d093d94e5d103a553`**. Read-only source review covered README, package metadata, LICENSE, installation, supported targets, CLI and browser-observation documentation. This is an integration review, not a full code/security audit or runtime acceptance test.

- Published npm package **`rea-agents@6.10.1`**, license **MIT**, repository metadata matching `morluto/rea`.
- npm integrity returned: `sha512-3AWrfFEXppvC98FWhZR2Tzulnqs5xJQrSKmAub6+QME/I58Pr3h8pHqqwM30z2DvlnIx/8Hsu8woMngfi4SNyg==`.
- Required Node engine: **`^22.23.4 || ^24.22.1 || >=26.12.1`**. This workspace's Node **24.19.0** is below that requirement. The owner's exact current Node patch version still needs a read-only check; earlier successful Nexus builds do not establish REA compatibility.
- The website surface observes a Chrome-family browser through CDP and returns bounded evidence; upstream explicitly distinguishes it from general browser automation. Browser opening/scrolling/navigation needs a separate owner-controlled or implemented browser adapter.
- Relevant exposed operations include `list_browser_targets`, `inspect_web_page`, `capture_web_screenshot`, `analyze_web_bundle`, `observe_web_session` and `compare_web_captures`. A Nexus allowlist should expose only the reviewed subset for the requested task. Native binary/debugging/rewrite operations are outside the first web-inspection slice.
- Standard setup registers MCP and workflow instructions for an entire agent client. An isolated profile/project configuration is preferable for a Nexus-specific integration. Merely choosing an isolated configuration is not an OS sandbox.
- No native disassembler is needed for the first web/static-JavaScript slice. Hopper/Ghidra/IDA and other native providers have separate prerequisites/licensing; do not install them as an incidental dependency.

Source anchors at the reviewed revision:

- [Package and engines](https://github.com/morluto/rea/blob/0f4ec6231828ec0af1807f2d093d94e5d103a553/package.json)
- [License](https://github.com/morluto/rea/blob/0f4ec6231828ec0af1807f2d093d94e5d103a553/LICENSE)
- [Browser observation contract](https://github.com/morluto/rea/blob/0f4ec6231828ec0af1807f2d093d94e5d103a553/docs/guides/web/browser-observation.md)
- [Setup/profile behavior](https://github.com/morluto/rea/blob/0f4ec6231828ec0af1807f2d093d94e5d103a553/docs/getting-started/installation.md)

### Proposed execution contract

An explicit inspection task identifies the owned/requested URL, exact allowed origins, browser target, observation duration, capture choices and output budget. Validate the selected target and redirect scope; bind a dedicated loopback CDP endpoint with an explicit port and a clean browser profile. Do not attach to an existing personal/account browser or the cloud platform's managed browser/debugging service. The browser itself can load network resources; an origin filter on evidence is not network containment.

Keep cookies, storage content, console text and source-body capture off unless the specific approved task needs them. Read the actual upstream option/schema before enabling a capture. Page text and tool declarations remain untrusted data, not instructions to expand tool access.

The adapter returns a durable receipt with task/run ID, pinned tool version, target/origins, start/end state, evidence IDs and file hashes, counts/limits, observed versus inferred findings and output locations. Recheck process/target/cancellation state. A report or generated answer is not proof of a security test or a successful code change. After review, the existing coding workshop can produce candidate code from selected evidence, followed by independent checks. Confirmed authorized outcomes may use the existing work journal without promoting report claims to owner facts.

Readiness stages: **reference reviewed → runtime compatible → isolated package/configuration prepared → bounded synthetic fixture verified → owner task eligible**. Every stage needs evidence. Do not label this target connected because the repository can be read or because a CLI is installed.

## 2. Hugging Face: model assets before inference

Build a catalog/download connector independent of `local-folders.json`, assistant memory and external inference routing. A candidate record needs the actual Hub repository ID, immutable revision, artifact filename, expected hash/digest source, size, license/gating requirements, model architecture/quantization and supported runtime. No model/version mentioned in the video is assumed real or available without catalog verification.

Anonymous metadata access, authenticated/gated downloads and hosted inference are distinct operations. Store any required token through a future local protected credential setup rather than the chat/browser. Before a download, show the exact revision/files, license obligations, bytes, destination and available capacity. Use bounded resumable acquisition with verified final bytes and explicit cancellation/partial state. Do not execute downloaded code, import arbitrary model repository Python, or silently enable remote code as a side effect.

Model states must distinguish cataloged, selected, downloading, downloaded, hash-verified, imported into a supported runtime and inference-ready. An Ollama-compatible artifact/import is one possible runtime path, not a guarantee for every Hub model. The 8 GB laptop's RAM/GPU/context budget must be checked; storing a large model on C: or G: does not make it runnable. A model archive folder can be browseable without ingesting binaries into the knowledge index.

After an actual import/readiness check, the existing local-model adapter may expose the runnable model in its catalog. Installing an inference service or enabling a hosted Hugging Face API needs its own adapter and sharing controls. Listing catalog entries or files must not call a billable generation endpoint.

## 3. Venice: hosted inference behind current sharing rules

Build an optional external provider adapter only after checking current official API documentation, endpoint/schema compatibility, model discovery, terms and usage reporting. Do not assume that generic OpenAI compatibility, a video model name or a subscription proves usable API access. Do not add its ID to selectable/Auto/Compare routing until the adapter and local configuration are implemented and verified.

Local setup must handle credentials, explicit enablement, permitted model IDs and request/usage limits. Apply the established per-question external-context permission, workspace filtering, local-only memory exclusions, cancellation and actual-provider result metadata. Changing models preserves permitted memory context; it does not send all memory or browser evidence to the new provider.

No silent hosted fallback when local inference fails. No automatic retries after an uncertain billable outcome. Report configured, API-auth verified, selected and generation-success states separately. App request limits are not a dollar spending cap; actual provider billing/account state needs separate evidence. Default connection state remains not enabled until owner setup is concrete and reviewed.

## Delivery order and checks

1. Retain truthful architecture/setup cards for all three (this slice).
2. Check the Windows Node version and prepare a compatible, pinned, isolated REA runtime; verify against disposable local browser/static fixtures before real targets.
3. Implement Hub metadata/model-asset records and download verification over current source/license/runtime information.
4. Implement Venice API contract/configuration and fixture-driven routing/sharing/usage tests before exposing it as an eligible provider.
5. Connect resulting evidence/model identities to the common memory, capability registry and assistant-status UI. Keep artifact save, index discovery, factual verification and provider sharing separate.

Acceptance includes zero network/file effects from connection inventory, no model call during status/catalog lookup, wrong-runtime rejection, exact target/origin capture limits, bounded artifacts, cancelled/uncertain operation handling, hash/license/runtime checks, no private-context leakage to disabled providers and truthful rendered readiness on desktop/phone. Installed software, downloaded weights and verified adapter execution must remain separate states.

## Implemented REA prerequisite inspection

The actual Nexus server Node version and fixed isolated package metadata can now be inspected explicitly under Connection activity. Exact pinned runtime ranges are checked without installation, subprocesses or browser attachment. Matching metadata is not package integrity or adapter execution verification; REA remains unconnected. See `nexus-rea-preflight.md`. The earlier cloud runtime observation remains historical; the new result reports the current host process rather than inferring Windows compatibility from a successful Next build.

Isolated package acquisition is now implemented by `Setup-Nexus-REA.cmd` using a separate reviewed-version dependency lock, archive-integrity pin and disabled lifecycle scripts. It refuses incompatible runtimes and preserves partial/foreign stages. This stages package files only; no REA setup, personal agent registration, MCP execution or browser attachment is supplied. See `nexus-rea-package-staging.md` for archive/layout verification evidence and remaining native/runtime acceptance limits.

The next runtime slice now supports explicit bounded MCP initialize/catalog verification with clean shutdown and current protocol-file hashes. The real pinned process passed compatible-runtime Linux and disposable production API checks; six reviewed candidate tool/schema identities are displayed without invoking them. Native Windows checks remain observable through the explicit control, and actual browser/target inspection is still unconnected. See `nexus-rea-protocol.md`.

REA execution continuation: [owned-browser self-test](nexus-rea-owned-browser-self-test.md) now exercises one real inspection against a fresh fixed loopback fixture, with evidence checks and owned-process cleanup. This does not enable arbitrary-site inspection or grant access to personal browser sessions.

Hub metadata continuation: [public model metadata](nexus-hub-model-metadata.md) now accepts explicit public repository/commit lookups, resolves main to an immutable commit and projects reported license, sizes and artifact identities with coverage. Fixture-driven transport/UI validation is implemented; live Hub API/docs probes remain blocked by cloud egress policy. Downloads, credentials, installation and inference are still unconnected, and the connector is not an eligible inference provider.

Model acquisition continuation: the first [reviewed archive transfer](nexus-hub-model-archive.md) now streams one bounded GGUF artifact into the private archive after fresh source/license/capacity checks, then verifies size/SHA-256 plus local readback and retains a create-only receipt. It neither imports nor activates a model. Live Hub/CDN acceptance, interrupted-run reconciliation/resume and broader asset lifecycle remain separate work.

Archive review continuation: [local archive inspection and recheck](nexus-hub-archive-review.md) now exposes retained transfer outcomes after refresh, current size/partial metadata and explicit read-only hashing of completed records. It sends no source/provider request, performs no import/activation and does not resolve live Hub/CDN acceptance. Receipt trust, current byte agreement and inference readiness remain separate states.

Uncertain archive publication now supports [source-bound local reconciliation](nexus-hub-archive-recovery.md) into separate recovery metadata. This records observed byte agreement without changing original receipts or performing a source request, download retry, partial resume or runtime activation.

Retained partials now support [explicit resume into a new archive run](nexus-hub-archive-resume.md) after renewed license/source/capacity checks. Exact remaining-byte responses and full new-file verification are required; originals remain unchanged. Live Hub/CDN range support and native Windows behavior remain unverified, and this does not enable model inference.

Runtime-review prerequisite: [local GGUF metadata inspection](nexus-gguf-metadata.md) now projects bounded declared model fields from an explicitly selected archived file. It does not import weights or establish hardware/runtime support. The official Venice documentation probe still returned HTTP 403 through this environment, so live API/schema verification and provider routing remain unimplemented.

Installed-runtime review continuation: [Ollama model details](nexus-local-model-details.md) now exposes bounded runtime-reported architecture, quantization, context and capabilities separately from archived GGUF declarations. It does not connect a Hub archive to a runtime model, import weights or verify runnable hardware fit.

Local inference acceptance continuation: [fixed installed-model diagnostic](nexus-local-model-check.md) now tests one explicit local model with no owner context and shared generation admission. Its single-test result is separate from metadata, archive import and broad hardware readiness. Venice's official specification request still returned HTTP 403 through this cloud environment; no hosted-provider enablement was inferred.

Archive-to-runtime continuation: [pre-import review](nexus-hub-import-review.md) now combines a fresh source-bound archive hash, declared metadata, reported local runtime version and host RAM snapshot. Runtime storage/capacity and import remain unimplemented; the review does not claim that an archived model is installed or runnable.

Runtime write continuation: [explicit local blob staging](nexus-runtime-blob-staging.md) now copies a reviewed archive into the local runtime's content-addressed blob store, with preserved originals and separate retained outcomes. A staged blob is not an imported/selected/runnable model. No Hub or hosted-inference request is used by staging.

Staging continuity: [current runtime blob presence checks](nexus-runtime-blob-check.md) now report explicit current HEAD observations against source/run-bound retained stages. They do not retry uploads or convert old uncertainty into success, and they do not create/import a model.

Creation continuation: [a separate explicit local model-creation action](nexus-runtime-model-create.md) is now implemented after current blob presence. It revalidates execution-time evidence and creates only a new generated alias, preserving the original selection/receipts. Model creation is runtime-reported; inference readiness and native real-model acceptance remain separate.

Created-model continuity: [current runtime model inspection](nexus-runtime-model-check.md) connects a retained creation run to fresh local catalog/metadata evidence and, when matched and completion-capable, a separate explicit diagnostic. Historical uncertainty is preserved; no creation retry, provider request or default-model change is added.

Inference-test continuity: [saved local diagnostics](nexus-local-model-check-history.md) preserve completed fixed-test metadata and provide explicit controller history/export after refresh. Historical results remain separate from current model identity/readiness; no runtime request, provider activation or model selection occurs when reading history.
