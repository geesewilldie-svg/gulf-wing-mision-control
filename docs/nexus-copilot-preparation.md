# Isolated GitHub Copilot preparation

This stage prepares a separate local CLI profile. It does not send prompts, connect Copilot to Nexus answers, enable tools, install packages or change the owner's plan. Microsoft 365/consumer Copilot is unchanged.

## Windows setup

With the previously installed @github/copilot 1.0.114, run Setup-Nexus-Copilot.cmd. It locates the standard per-user npm entry point under APPDATA/npm/node_modules/@github/copilot/npm-loader.js, verifies package identity/version/bin metadata and launches Node with a literal argument array and shell:false. A custom npm prefix can be accommodated by explicitly setting GW_NEXUS_COPILOT_ENTRYPOINT to that installed npm-loader.js before local setup; paths from browser requests are never accepted. There is no remote setup endpoint.

The script uses the configured local data directory (normally .gulf-wing), creates copilot-profile and copilot-work and points COPILOT_CACHE_HOME at copilot-cache. copilot-adapter.json records only version, CLI version, entry point and stage:prepared. An existing unreadable configuration or a different entry point is preserved and rejected. This file is preparation metadata, not an execution grant. Actual native version output still needs review.

Then run Sign-In-Nexus-Copilot.cmd for explicit browser OAuth using the same isolated profile. The owner's earlier normal-profile login is not treated as proof of this profile's state. The CLI handles credential storage; its help reports system credential-store storage with possible plaintext fallback under its profile if that store fails. Nexus does not copy tokens from the ordinary profile or inspect stored token values. Share only success/error messages, never authorization codes or tokens.

Only Windows process-launch essentials are inherited. GitHub/provider tokens, provider key commands, Node injection variables, tool/skill/instruction overrides and OpenTelemetry exporters are not inherited. COPILOT_HOME and COPILOT_CACHE_HOME are separate; automatic CLI/plugin updates and plugin auto-discovery, inherited login-shell environment, indexed search startup, client telemetry, desktop notifications and MCP tool cache are disabled for these launches. These controls do not constitute an operating-system sandbox, disable server telemetry or prove eventual model-tool isolation. No model process is launched by this stage.

## Status and limits

Show my connections reports Profile prepared — model adapter pending only when saved metadata matches the pinned installed package. It does not spawn Copilot, check sign-in, query quota or contact GitHub. A missing setup stays Integration not built; changed/unreadable setup is disclosed. Microsoft Copilot remains a separate unbuilt adapter.

The pinned package entry point was checked against registry metadata at https://registry.npmjs.org/@github%2fcopilot/1.0.114: bin.copilot is npm-loader.js. The owner supplied matching native --version, --help, help permissions and help environment output. No runtime package was downloaded or executed by cloud tests. Metadata validation is not proof of executable integrity or account entitlement.

Before a prompt adapter is enabled, verify the exact pinned CLI's empty-tool visibility/deny semantics, disabled built-in and custom MCP discovery, clean profile state, bounded output and cancellation, per-question external permission, allowance accounting and durable no-retry behavior on unknown effects. No private source, repo or owner conversation should be sent by a synthetic acceptance check. This stage deliberately has no inference endpoint.
