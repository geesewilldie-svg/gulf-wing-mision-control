# Bounded REA protocol verification

**Connection activity → REA inspection prerequisites → Test REA protocol without browser** runs an explicit initialize/catalog check against the fixed staged package. It starts a short-lived local REA MCP process, sends only `initialize`, `notifications/initialized` and `tools/list`, closes stdin and requires a zero exit before reporting success. It never sends `tools/call`, browser targets, prompts, task files or account data. The API accepts only a fixed action, not caller-selected executables, RPC methods or parameters.

## Admission and verification

The actual Nexus server Node runtime must satisfy the pinned REA range. Fixed managed directories must pass the existing prerequisite check. The staged receipt, original lock contents and archive SRI must match the committed pin. Before launch, 121 pinned protocol/bootstrap/catalog/package files (about 22 MB) are checked by SHA-256 against a manifest captured from the integrity-verified archive. Symlinked/changed/oversized checked files or directories stop verification. File reads and catalogs are bounded. External dependency archives remain governed by the lock/npm staging checks; their current files are not independently rehashed by this 121-file manifest.

These checks detect changes to the declared pin set before launch; they are not an OS sandbox or a guarantee against an uncooperative writer changing files after checks. The stage remains private owner-managed code. No installation, download, update, personal agent registration or system Node replacement occurs through this API.

The child receives a small environment allowlist plus fixed `REA_MCP_TOOL_FAMILIES=browser`; Nexus/provider credentials, external agent configuration and Node loader overrides are not forwarded. The fixed entrypoint uses stdio, not HTTP. Working directory is the isolated stage. The pinned upstream's deferred startup advertises catalog data before materializing target/tool execution.

## Results and cleanup

The protocol must negotiate `2025-06-18` and report `rea` version `6.10.1`. The browser family advertises 12 upstream operations; Nexus exposes names and input-schema SHA-256 values only for the six reviewed candidates: `list_browser_targets`, `inspect_web_page`, `capture_web_screenshot`, `analyze_web_bundle`, `observe_web_session` and `compare_web_captures`. This does not enable any of them for invocation. Untrusted descriptions, prompts and server instructions are not sent to a model.

The exchange has a 20-second deadline, 1.5 MB total stdout limit, 64 KB stderr limit and at most 100 listed tools. It rejects unknown messages, caller requests, wrong versions, pagination, malformed catalogs and missing/duplicate reviewed names. UTF-8 may span chunks. No raw stderr is returned. Cancellation/failure requests termination of the exact owned process, then forces termination if necessary. Readiness is never reported before a clean close. Unconfirmed cleanup returns failure and retains the process-local slot until close; it is not silently retried. Only one protocol process per server process is admitted. Filesystem latency before launch is not covered by the protocol deadline.

Results distinguish **protocolVerified** from **browserReady**. The latter stays false: real site inspection, browser launching/attachment, target/origin authorization, bounded evidence receipts and runtime tool invocation remain subsequent work. The check runs only on an explicit button click and clears on retry/denial/unmount. Global connection inventory remains planned/unconnected.

## Execution evidence

An official Node 24.22.1 Linux runtime was downloaded into disposable storage and matched against the official `nodejs.org` SHA-256 manifest (`6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6` for the Linux x64 archive). System Node was unchanged. The pinned real REA process negotiated the expected version, listed the 12 browser-family descriptions and exited zero without stderr. No browser tool was invoked. The shipped server still uses its own admitted Node binary; the disposable test runtime is not a production runtime override.

Fixture tests cover exact outbound methods, split UTF-8, catalog/source-version errors, oversized output, cancellation/owned-process close, incompatible-runtime rejection, controller/origin/extra-RPC denial and explicit desktop/mobile UI. A real compatible-runtime fixture repeats the exchange using the actual pinned REA process. Native Windows execution remains separately observable through the explicit control; Linux evidence is not a claim of completed Windows site inspection.

## Build-time tracing boundary

The private installed tool is read at runtime. Narrow `turbopackIgnore` annotations prevent expansion of the manifest's dynamic file expression into a package-wide build glob; the committed hash/lock JSON imports remain application inputs. These annotations affect build analysis only and do not skip runtime file validation. Reproduction with the full installed tree matched the owner's 14,472-file warning before the fix; the final Turbopack build omitted that warning, and compiled-route success/tampered-source rejection were both rechecked. Normal explicit child-process dependency tracing can still apply when packaging a deployment.
