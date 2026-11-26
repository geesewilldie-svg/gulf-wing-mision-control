# Isolated pinned REA package staging

`Setup-Nexus-REA.cmd` stages the reviewed `rea-agents@6.10.1` package under the private `tools/rea` directory. It does not run REA, REA setup, an MCP server, a CLI version probe, browser attachment or model inference. It does not register tools in Codex/Claude or edit personal agent profiles. Existing Nexus services/models keep running.

## Admission and package verification

The installer first checks its actual Node runtime against the pinned engine range. An incompatible runtime stops before filesystem/download actions; Node is not upgraded automatically. A compatible installer runtime does not prove that an independently launched Nexus process uses the same Node binary. Connection activity's preflight still reports the server process separately.

A separate committed package manifest/lock contains 175 dependency entries. Validation checks the exact REA version/archive SRI, registry-only tarball sources and integrity-bearing entries before installation. The pinned root integrity remains `sha512-3AWrfFEXppvC98FWhZR2Tzulnqs5xJQrSKmAub6+QME/I58Pr3h8pHqqwM30z2DvlnIx/8Hsu8woMngfi4SNyg==`. A lock is not a full source/security audit of every transitive dependency.

On a new stage, official npm beside the current Node binary runs `ci` with lifecycle scripts disabled, strict engine admission, fixed public registry, isolated user/global npm configuration and private cache. Inherited npm configuration/token/Node loader overrides are removed from that child environment. No shell command is formed from user/package values. npm verifies locked tarball integrities. The root archive reports about 186 MB unpacked before additional dependency/cache space; this is a real package download, not a model-weight download.

The installer checks unchanged lock bytes, pinned package/engine metadata, and regular CLI/MCP compiled entry files before writing a local `staged` receipt. This records archive/layout staging; it does not independently rehash every installed file or prove runtime execution. Disabled lifecycle scripts may leave optional native capabilities unavailable. Adapter ready remains false.

## Existing, failed and interrupted stages

An exclusive private installer lock prevents cooperating concurrent installers. A leftover lock is not automatically reclaimed. Existing matching staged metadata/receipt is checked and reused without a second download. Other/partial installations are preserved and are not overwritten or replayed. A first stage reserves its own directory exclusively and records preparing state before package work. Failures retain partial files; no success receipt is written and no tool is enabled. There is no general repair/uninstall/rollback workflow in this slice.

The command does not restart or update Nexus itself; first acquire the new command through the normal updater. No remote browser/API operation triggers installation. Future execution still requires a compatible runtime, integrity/current-file checks appropriate to execution, an isolated browser target, explicit task/origin/tool allowlists, bounded evidence, cancellation/uncertain-state handling and actual runtime acceptance tests.

## Verification and limits

Cloud verification resolved the separate lock and successfully unpacked the pinned package in disposable storage through `npm ci --ignore-scripts` for archive/layout inspection. This metadata acquisition explicitly ignored engine admission because no REA code was executed; the shipped installer keeps strict admission and correctly refused the cloud's Node 24.19.0 before any installation. The expected launcher and compiled MCP entry files were present. No REA command, lifecycle script, agent registration or browser session was run.

Six workflow scenarios cover exact lock/integrity sources, incompatible-runtime zero effects, verification-before-receipt, idempotent existing-stage handling, retained install/verification failures and modified-lock rejection. Browser tests cover shared prerequisite metadata and existing connection/model behavior. The native Windows compatible-runtime installation path remains unexecuted by cloud fixtures and is not labelled verified REA operation.
