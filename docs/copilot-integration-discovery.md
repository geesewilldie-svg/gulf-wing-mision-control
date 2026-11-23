# Copilot integration discovery — November 23, 2026

Status: official-interface discovery completed; no Copilot adapter, package, sign-in, provider call or entitlement check performed. Owner wants both GitHub Copilot and Microsoft Copilot, and selected “Not sure—check locally first” for existing access. Keep these separate.

## Recommended next step

Inspect the Windows laptop for an existing Copilot CLI and PowerShell 7 without invoking either, installing software, reading credentials or generating prompts. Absence of a command is not proof that the account lacks Copilot entitlement. Next, verify the owner's existing GitHub plan/account before choosing a pinned SDK/CLI release and local sign-in path. Do not infer entitlement from this cloud workspace's gh login or the owner's ChatGPT subscription.

## GitHub Copilot coding path

The official CLI README supports Windows and lists PowerShell 6+ plus active Copilot access. Organization policies may block CLI access. The official SDK supports programmatic agent sessions, user authentication, tool-selection controls and permission handlers. The retrieved SDK README reports a transition from GitHub Copilot SDK to Microsoft Copilot SDK; it links the microsoft/copilot-sdk repository and documents @microsoft/copilot-sdk. Verify an immutable release and its runtime contracts before implementation rather than copying historical package names or installing latest.

The SDK overview states that standard use requires Copilot access (including a limited free tier), while BYOK uses separately configured provider access. Prompt usage counts against the applicable allowance. BYOK is not an assumption of free service or authorization to use an existing unrelated API key. Account plan, remaining usage, policy and billing remain unverified. No licensing redistribution/commercial-hosting rights have been established by this discovery.

The SDK exposes built-in tools by default. A Nexus prototype must explicitly restrict tools and deny unapproved effects; do not adopt approveAll/allow-all examples. Begin with one explicitly approved prompt using public synthetic text, no private sources, repo access, terminal tools, MCP servers or network tools. Add durable request IDs, exact response capture, cancellation/timeout handling, allowance checks and model-output verification. A paid provider call must not be auto-retried after an uncertain outcome. Candidate authoring must preserve existing workshop isolation, parent revisions, owner context revisions and independent verification before use. This is a design requirement, not implemented behavior.

## Microsoft 365 Copilot work-data path

The official Microsoft 365 Chat API overview is marked preview. It provides multi-turn text with work/web grounding, and requires a Microsoft 365 Copilot add-on license. It states no extra Chat API charge for those licensed users; this does not make the license free or establish that the owner has one. The overview lists an eligible Microsoft 365 subscription (E3/E5 or equivalent).

The create/continue endpoint permission tables support delegated work/school accounts only. Personal Microsoft accounts and application permissions are not supported for these endpoints. They list all of Sites.Read.All, Mail.Read, People.Read.All, OnlineMeetingTranscript.Read.All, Chat.Read, ChannelMessage.Read.All and ExternalItem.Read.All. These broad scopes require a separate reviewed tenant/account-consent design; existing Google authorizations cannot supply them. No tenant registration or consent is initiated here.

The Chat API returns text and does not create files, send mail, schedule meetings or support long-running agent tasks. Web grounding is on by default and must be disabled on each turn if unwanted. Generic Graph data access alone is not a Copilot agent connection. A consumer Copilot browser/app subscription is not proof of eligibility for this work-account API. Consumer Copilot app automation is not an implemented or verified fallback.

The SDK naming transition does not establish Microsoft 365 tenant access or consumer-app delegation. Those are separate product/account surfaces. Both inventory cards remain Integration not built.

## Evidence and limits

Official docs.github.com and learn.microsoft.com URLs returned proxy tunnel 403 errors in this environment. The official GitHub-hosted documentation sources below returned HTTP 200 and were read instead. The Microsoft repository README identifies it as the source for Learn's Microsoft 365 Copilot extensibility documentation. Live main-branch content is mutable; these hashes record the retrieved text, not an immutable release guarantee. No account, native CLI, model, latency, provider quota, Windows runtime or billing was tested.

| Source | Retrieved text SHA-256 |
| --- | --- |
| [Copilot SDK overview](https://raw.githubusercontent.com/github/copilot-sdk/main/README.md) | `6078f988c374e630058c977fea9c2f3f5211b18f415dd570c72bddce757023e5` |
| [SDK authentication](https://raw.githubusercontent.com/github/copilot-sdk/main/docs/auth/authenticate.md) | `c6073cf694cd92786fe47a683250bbf0b8db87e19a64244c6b411b9c28e98e7e` |
| [SDK Node reference](https://raw.githubusercontent.com/github/copilot-sdk/main/nodejs/README.md) | `9be533cc40ef60598dfb820e1e5ea70a96d5a6cd8f5d0a4c586b3cc31960f2ff` |
| [GitHub Copilot CLI](https://raw.githubusercontent.com/github/copilot-cli/main/README.md) | `8b1a33b43bd12dcc8262c620341cf9113ee75928dcbc90b1197d37b7e70de284` |
| [Microsoft 365 API overview](https://raw.githubusercontent.com/MicrosoftDocs/m365copilot-docs/main/docs/copilot-apis-overview.md) | `46f1c4d1c9004bcfcd9c43c33fd6541efd92abfc29a3aa21fb1ec6b52106826f` |
| [Microsoft 365 Chat overview](https://raw.githubusercontent.com/MicrosoftDocs/m365copilot-docs/main/docs/api/ai-services/chat/overview.md) | `9ee730b9ab5883321689fe49e7b1c0cf5e227999b377fe0bf02f62d1303a6a8d` |
| [Microsoft 365 create conversation](https://raw.githubusercontent.com/MicrosoftDocs/m365copilot-docs/main/docs/api/ai-services/chat/copilotroot-post-conversations.md) | `b3a26d862d36470f818763e64f3668a0babbe252968d2a4b17a884577897f774` |
| [Microsoft 365 continue chat](https://raw.githubusercontent.com/MicrosoftDocs/m365copilot-docs/main/docs/api/ai-services/chat/copilotconversation-chat.md) | `7af142da936d9d5288f55dc88b6a790f89813af48fdef056c38db2f29f467e15` |
