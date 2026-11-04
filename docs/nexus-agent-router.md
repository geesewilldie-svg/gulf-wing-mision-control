# Nexus unified search and agent routing

## What is implemented

Ask Nexus or use existing voice controls at `/nexus`. One request searches imported business documents/notes, saved Co-hosting records, saved venture records, and an optional read-only Obsidian vault. Results include source names and locations. Lexical ranking weights distinctive terms and source/location matches; this is not an embedding index or model training. At most five passages go into the response, so results are not exhaustive.

Routing choices:

- **Auto:** local Ollama first. If the operator grants external sharing for this question and a matching configured specialist is available, document/review/research questions can select Claude and Google/image questions can select Gemini. No external fallback occurs silently after a failure.
- **Knowledge only:** source excerpts, no model inference.
- **Choose agent:** explicitly select Ollama, OpenAI/ChatGPT API models, Claude or Gemini. An unavailable/disallowed selection fails clearly rather than substituting another provider.
- **Compare:** at most two permitted model calls, sequentially. If two respond and Ollama is configured, a further local call summarizes agreement/disagreement. Individual responses remain available. Without a local summary, answers are shown with attribution. Agreement is not proof; verify claims against the sources. One configured model produces one answer and a clear warning, not a fabricated comparison.

External model calls require a server opt-in, model identifier, credential, positive request allowance and the **per-question sharing checkbox**. That checkbox authorizes sending the question, recent conversation and selected private excerpts. The checkbox and public research terms reset after each request; continuous voice remains local by default. Keep Auto/local for ongoing hands-free conversations. No credentials are entered through the UI or exposed in agent status.

## Start without paid services

Your existing Ollama setup continues working. No cloud account, key or subscription is added by this change. Choose Auto or Knowledge only. In Connections, unavailable providers remain Not connected. Existing consumer chat subscriptions do not necessarily include API access, and this app does not read chat history from other products.

The original GPT/Claude/Hermes/Codex dashboard stays labeled DEMO. A separate **Nexus request activity** globe on Mission Control and Nexus shows real knowledge/model/research events. Configured nodes are not a health check. Gray nodes lack configuration; completed requests highlight briefly, failures differ visually, and recent outcomes are listed. Events contain provider IDs, timing and states only, not questions/documents/answers. They are bounded in process memory and expire after 15 minutes/restart. Fast requests may complete between 1.5-second UI refreshes. Reduced-motion preferences disable moving paths. This is not an immutable audit trail.

## Optional Obsidian connection (host configuration)

On the laptop, set `GW_NEXUS_OBSIDIAN_VAULT` to the absolute vault folder in the server environment or a private, untracked `.env.local`, then restart the Next server. Do not share this file. Choose a curated vault suitable for all trusted controllers. Markdown is read afresh per question; the vault is never written. Existing imported snapshots are retained. There is no watcher, two-way editing or conversation-memory autosave.

The scan skips hidden files/directories and symbolic links, and is bounded to 100 Markdown notes, 2 MB, 100 KB per note, depth 8 and 2,000 entries. Limits produce a partial-results warning. Unreadable vaults produce a warning while other search sources remain usable. Not every file in a large vault is indexed. Credentials, private employee records and unrelated personal notes should not be placed in the selected knowledge vault. Any external sharing consent includes retrieved vault passages.

## Optional public research

Enter **public terms** in the separate field; they are sent only when Ask Nexus is submitted. Nexus does not automatically forward your private question as a search query. Blank means no research request.

Without other configuration, research uses English Wikipedia's public API. Results are encyclopedia excerpts with page URLs and retrieval timestamps, not a comprehensive or verified current web search. Availability and rate limits depend on Wikipedia; no paid API is used. Query terms are still disclosed to that service.

For broader web search, a separately installed local SearXNG service can be selected with `GW_NEXUS_SEARXNG_PORT` (1024–65535). Nexus contacts only `127.0.0.1:<port>/search` with `format=json`; configure JSON support in that service. Public terms are forwarded by SearXNG to its configured search engines. No SearXNG instance or Docker installation is added automatically. Returned snippets have source links and retrieval dates, but destination pages are not fetched or independently verified. Model-generated URLs and document instructions cannot redirect research fetches. No autonomous browsing/action tools are provided.

## Optional external provider configuration — disabled by default

Only do this after separately deciding on provider access, costs and data-sharing requirements. Do not paste API keys into chat, GitHub, public files or browser code. Keep `.env.local` and `.gulf-wing` private. Never store credentials in the Obsidian vault.

Server variable names (no keys or provider plans are supplied):

- `GW_NEXUS_ALLOW_EXTERNAL=1` and `GW_NEXUS_MAX_EXTERNAL_PER_DAY` from 1–100, **plus**:
- OpenAI: `GW_NEXUS_OPENAI_KEY`, `GW_NEXUS_OPENAI_MODEL`
- Claude: `GW_NEXUS_ANTHROPIC_KEY`, `GW_NEXUS_ANTHROPIC_MODEL`
- Gemini: `GW_NEXUS_GEMINI_KEY`, `GW_NEXUS_GEMINI_MODEL`

Use a model that the account actually supports. No model names or prices are assumed. ChatGPT is a UI label for the OpenAI model API adapter, not access to the ChatGPT website or your chats. Protocols: OpenAI Chat Completions, Anthropic Messages (`anthropic-version: 2023-06-01`), Gemini generateContent. Fixed HTTPS endpoints, redirects rejected, output limits and bounded response reads are used. Other agents/services (Codex, Hermes, Copilot, OpenClaw, Workspace, Ads) still need their own supported authenticated adapters; they are not secretly proxied through these model APIs.

The allowance counts attempted external calls across controllers on this **single laptop process**, not dollars. Reservations are written atomically to `.gulf-wing/agent-allowance.json` and survive restart, resetting at UTC midnight. Failures/cancellations can consume an attempt. Corrupt allowance storage blocks external calls. Set provider-side billing/quota controls as well: token caps and request counts are not a monetary guarantee. Removing the allowance file resets protection; back it up with private configuration. Keep one Next server against the data directory. No distributed-server support.

## Validation and remaining activation

Automated tests use synthetic HTTP transport and disposable files, not paid providers or real private vaults. Verify a harmless local question, then a synthetic vault note, then public research before enabling any external provider. Inspect the displayed route and source links. Native voice/Windows/Android/ScreenPad acceptance remains a laptop check after merging and updating.

Run `npm run build`, `npm run typecheck`, `npm test`, `npm run test:nexus-setup`, and `npm run test:nexus-runtime`. No external provider credentials are needed for tests. Existing pairing/controller rules apply; display-only devices cannot access request activity or submit questions. This phase does not add a persistent Windows service, global hotkey, OS replacement, account integrations, paid subscriptions, general internet access to local models, or automatic spending/outreach.

Reference protocols: https://platform.openai.com/docs/api-reference/chat, https://docs.anthropic.com/en/api/messages, https://ai.google.dev/api/generate-content, https://www.mediawiki.org/wiki/API:Search, https://docs.searxng.org/dev/search_api.html.
