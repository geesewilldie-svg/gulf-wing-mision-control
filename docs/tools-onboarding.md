# Finish local Nexus onboarding before connecting more products

## Current boundary

The repository provides a local-first Nexus router. Ollama is the default answering engine; imported knowledge and saved business records provide evidence. Optional provider adapters and public research are documented in [nexus-agent-router.md](nexus-agent-router.md). A downloaded application is not automatically an adapter, and its chat history is not automatically available to Nexus.

The Cursor, GrockBot, Manus and OpenClaw websites were supplied by the operator. Their current publisher claims, integration documentation, permissions and account costs could not be independently checked during this work because network access was unavailable. No plugin, remote skill, gateway, executable, subscription or account authorization was installed or enabled.

## 1. Finish the reviewed router update

Use the existing feature PR for `feat/nexus-agent-router`. Wait for GitHub checks, review, and merge manually. This onboarding work is on that same branch so it follows the router changes; do not merge an unrelated or older feature branch by accident.

After merging, update the Windows checkout through Setup & Diagnostics, rebuild, and restart Mission Control in its server tab. Leave the voice worker in its own tab. No setup command here stops processes, replaces a workspace, rotates the pairing code or changes services automatically. Keep `.gulf-wing` and existing private backups.

Once the reviewed files are on the laptop, run this in Setup & Diagnostics:

```powershell
npm.cmd run connections:check
```

This verifies that the local protected router route responds, that Ollama reports the configured model installed and that the voice worker reports its capabilities ready. It does not exercise inference/audio, import data, read provider keys, contact external accounts, spend credits or change settings. A nonzero exit means local setup needs attention. External configuration remains visible only through the paired browser's Connections view. Settings solely in `.env.local` are loaded by Next, not by this diagnostic; use Connections if the diagnostic cannot confirm the selected model or data directory.

## 2. Laptop acceptance checks

Open `http://localhost:3000/nexus`, pair as Controller if needed, and perform these separately:

1. Choose Knowledge only and ask about a harmless phrase from an imported document. Expand and inspect the actual source excerpt.
2. Choose Auto and ask a short question. Confirm local model attribution rather than interpreting a source excerpt as an AI answer.
3. Open recent request outcomes and confirm knowledge/local-model events. The original DEMO globe is separate.
4. Test one spoken question and spoken response. The readiness script does not prove microphone or speaker operation.
5. If testing Obsidian, use one synthetic note in a curated folder before selecting a real vault. No live vault path is assumed.

Do not interpret a green configured indicator as proof that an external provider account was tested. Continuous background voice still depends on the browser, laptop power and controller access; this does not install a Windows background service.

## 3. Cursor: development companion

In the already installed Cursor app, open **only** `C:\Users\geese\gulf-wing-mision-control`, rather than your entire user folder. The repository contains `.cursor/rules/nexus-project.mdc` and `.cursorignore` for development conventions and sensitive-directory indexing exclusions. Check the installed Cursor version recognizes those files.

The ignore file is not a security sandbox: terminal tools, extensions and integrations can have separate access. No extensions or MCP servers are provisioned by this repository. Keep one coding agent/editor making changes in this checkout at a time. Use feature branches, inspect diffs and tests, and review PRs. Do not let a second coding agent overwrite an in-progress change.

A suitable first task is: “Read AGENTS.md and README.md, explain how Nexus local search works, and make no changes.” This needs no customer records or provider credentials. Cursor is not presented as a routed model provider inside Nexus.

## 4. GrockBot: keep separate

`https://grockbot.fun/` is not the same domain as `https://grok.com/`. This is not proof of wrongdoing, and it is not proof of an xAI affiliation. No publisher or supported API has been independently verified. No GrockBot adapter is supplied. Keep it outside Nexus, business credentials, files and workflow permissions until independent verification establishes what it is.

## 5. Manus: public-information evaluation only

Before any task, inspect the account's actual terms, available credits and charges. If a no-charge evaluation is available and you choose to use it, test with public information only: “Compare three public property-turnover checklist examples; provide original source links, dates where available, and identify unsupported claims.” Check the sources yourself. Do not send private documents or enable business/account actions for this evaluation.

No Manus API or SDK was verified, so this phase does not invent an endpoint, credential setup or live connection. Keep any Manus output as a reviewable document; importing a checked output into Nexus knowledge is different from connecting Manus itself.

## 6. OpenClaw: verification before execution

Confirm the exact installed package/version, trusted publisher and supported gateway/permission documentation. Do not install arbitrary skills or give broad computer, email, file or account access to obtain a connection. No OpenClaw service, skill or credential is started by this repository. If a supported adapter is later verified, the first test should be read-only with synthetic data and no outbound actions. File access, outbound messages, spending and other actions each need an explicit authorized scope.

## Next activation decision

After local acceptance, choose one supported additional model/provider with verified access and acceptable costs. The existing router has adapters for OpenAI model APIs, Claude and Gemini; none is automatically enabled by this work. Keep request allowances and per-question sharing controls. Current chat subscriptions and downloaded apps do not establish API entitlement. Credentials belong on the laptop, never in chat or GitHub.

Microsoft Copilot remains optional and disconnected. It is not required for local Nexus search, voice, Ollama, Cursor development or these onboarding checks.
