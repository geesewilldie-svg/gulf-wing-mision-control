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

Before a prompt adapter is enabled, verify the exact pinned CLI's empty-tool visibility/deny semantics, disabled built-in and custom MCP discovery, clean profile state, bounded output and cancellation, per-question external permission, allowance accounting and durable no-retry behavior on unknown effects. No private source, repo or owner conversation should be sent by a synthetic acceptance check. There is no browser inference endpoint. The separate fixed public diagnostic below is the only prompt path added after isolated sign-in.

## Fixed public model-access diagnostic

After native isolated sign-in, run Test-Nexus-Copilot.cmd locally. It shows the exact fixed prompt and asks Y/N before dispatch: “Reply with exactly NEXUS_COPILOT_OK and nothing else. Do not use tools.” Selecting N sends nothing. Selecting Y may consume the GitHub plan allowance; the command supplies --max-ai-credits 1, which is a session AI-credit setting, not a dollar or account-wide spending cap. No Nexus files, memories, private snippets or recent conversation are attached. CLI/runtime metadata and provider processing remain governed by Copilot's own behavior/terms.

The fixed prompt uses the prepared profile and an empty temporary work directory outside the checkout. Additional settings.json, mcp-config.json, providers.json, hooks/plugins/skills/agents or execution-related configuration keys cause refusal; existing files are not removed. The runner requests an empty --available-tools list, adds read/write/shell/memory/url deny rules, disables built-in MCP servers, custom instructions, experimental mode and history sync. These are requested CLI restrictions, not proof of a Windows security boundary or unrestricted account safety. Exact native flag acceptance and model/tool behavior still need verification; a matching phrase alone does not attest tool isolation.

A local copilot-access-check-YYYY-MM-DD.json is exclusively created before dispatch. Only one reserved attempt per UTC day is allowed, including failed/uncertain attempts. Reading/rerunning does not silently trigger another request. No automatic retry or fallback model exists. Results are verified (exact phrase matched), unexpected-reply, or unconfirmed. Verified applies only to the fixed response, not private source access, code generation/testing, tools or normal Nexus routing. Raw provider response and diagnostic text are not saved or printed. Do not delete a reservation just because a process timed out. Inspect the actual laptop/account state before any later test.

Subprocess output is capped at 64 KiB combined; execution is capped at 60 seconds. Interrupt, termination, timeout or output overflow attempts process-tree cleanup, with a four-second uncertainty deadline. A power loss/hard process kill can leave the prewritten reservation unconfirmed; it is never treated as completed or replayable. The adapter does not know whether the provider consumed usage after an uncertain result.
