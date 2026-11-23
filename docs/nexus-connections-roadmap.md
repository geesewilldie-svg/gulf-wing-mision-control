# Retained connections and local-file search requirements

Operator request, November 7, 2026. Keep these requirements while finishing the Co-hosting workflow; the request did not cancel that work. These are delivery targets, not connected-account claims.

## Next delivery priority

1. Accept the selected-folder/Obsidian local-search pilot on the Windows laptop, then add a relationship graph based on real indexed sources. See [local file search](local-file-search.md).
2. Accept the [Gemini Public free-tier setup](gemini-public.md) on the Windows laptop. The operator deferred paid/private Gemini; keep public-only isolation until a separately reviewed paid upgrade.
3. Evaluate supported GitHub Copilot coding integration; evaluate Microsoft 365 Copilot/Graph separately for authorized work-account data. Existing chat subscriptions do not establish API entitlement or an installed adapter.
4. Verify DeepAI's official supported API, current costs, data handling and commercial/subscription terms before implementation or enablement.
5. Add Google connectors according to real business workflows, with account authorization and reviewed writes rather than one indiscriminate permission grant.

## Current code

Gemini has an external-model adapter gated by `GW_NEXUS_ALLOW_EXTERNAL`, configured key/model, positive daily allowance and per-question sharing. The new Gemini Public endpoint uses a separate encrypted Windows setup and fresh public question only; native acceptance is pending. The operator chose unpaid use, so the public-only policy blocks private-context Gemini. A read-only Obsidian Markdown scanner supports a locally configured vault, currently capped at 100 notes, 2 MB, depth eight and 2,000 entries. Imported PDF/XLSX/Markdown/text snapshots already support document search. Google Calendar was verified on the operator laptop. Multi-account Calendar and selected read-only Drive/Docs/Sheets snapshots are implemented in the [Google Workspace increment](google-workspace.md); new account consent and native Drive acceptance remain pending. Copilot and DeepAI are not connected. Selected-folder indexing is implemented for Markdown/text/PDF/XLSX (Obsidian: Markdown only), with local Windows folder selection, refresh/removal, controller-only source previews, content-change withholding, and visible coverage limits. Native Windows acceptance is pending; whole-laptop indexing and the relationship graph are not implemented.

## Google connector catalog requested

- Drive: permitted business documents and source metadata.
- Docs and Sheets: document/workbook retrieval, followed by reviewed creation or edits where required.
- Gmail: briefing/draft workflows and eventual approved outreach; sender/opt-out/delivery evidence remain distinct requirements.
- Calendar, Tasks and Contacts: schedule, priorities and customer/contact context under appropriate scopes.
- Forms: potential intake source with validated, deduplicated records.
- Ads, Analytics, Search Console and Business Profile: marketing/website/listing insights; no campaign spending or publishing merely from connection.
- Maps where useful: service geography and routing, after verifying current API costs and requirements.

Each integration needs its actual supported interface, account permissions, costs/terms and scope-specific tests. Do not treat a browser tab, installed app, video demonstration or provider logo as a functioning connector. No new credential, account access, message, payment, ad budget or external data sharing is authorized by an entry in this catalog alone.

## Laptop files and relationship graph

The requested graph should show real indexed documents/notes, companies, jobs and connected agents, with clickable sources and search. Start with operator-selected folders such as business Documents, approved projects and the Obsidian vault. Use a read-only local index with explicit boundaries, exclusions, supported parsers, refresh/removal controls and source freshness. Respect Windows file permissions, links/junctions and file-size limits; report inaccessible/unsupported/scanned files rather than implying complete coverage. Scanned PDFs need OCR and spreadsheet cached formula values may be incomplete. Do not silently send the entire index to external models.

Read access, local search, source preview, agent sharing, editing, moving/deleting files and command execution are different capabilities and approvals. A graph does not supply those permissions. Broader folder coverage and reviewed file actions can follow a tested read-only pilot. The cloud coding workspace cannot directly access the operator's laptop or phone; installation/configuration and native acceptance remain necessary.

## Owner clarification — November 21, 2026

The owner explicitly wants both GitHub Copilot for coding and Microsoft Copilot for work/everyday tasks. Retain these as separate adapter discovery targets alongside Gemini, Codex and Claude. This clarification does not replace the architecture sequence or establish account access, API entitlement, supported unattended delegation or a live connection. Verify each product's official supported interface and account requirements before implementation; Microsoft Graph data access alone is not a Copilot agent integration.

## Selected-source pilot update — November 23, 2026

The owner verified selected-folder/Obsidian status, refresh, search and part-by-part PDF reading on Windows. Show my source map adds folder-to-file membership navigation for current validated index entries. This is the initial source-map slice; semantic cross-document relationships and entity/agent graphs are still unbuilt. Existing selected-folder authorization and content-version checks govern Read file.

The next source-map increment resolves supported literal wiki links between current indexed notes in one selected Obsidian vault, with direct version-bound reading. This supplies explicit note-to-note edges, not inferred company/job/person relationships or proof of any agent connection. Native note-link acceptance remains pending.

## Current configuration visibility — November 23, 2026

The owner verified explicit linked-note navigation on the selected Windows vault. Show my connections provides configuration-only cards, including disabled APIs and unbuilt GitHub/Microsoft Copilot targets. Connected work remains a request-activity visualization; its Obsidian flag now comes from selected-vault settings. Setup is not live readiness, a current token grant is not proved by a saved authorization, and Codex workshop enablement does not prove CLI sign-in. No new agent integration is introduced by the inventory.

## Copilot supported-interface discovery — November 23, 2026

See [official-source findings](copilot-integration-discovery.md). Evaluate the GitHub coding SDK/CLI path first after read-only Windows prerequisites and account entitlement checks. SDK naming is transitioning, so choose an immutable supported release before implementation. Microsoft 365 Chat API is a separate licensed work/school preview surface with delegated scopes and text-only results; consumer Copilot is not thereby connected. The owner requested local checking first, with no known account plan. Both integrations remain unbuilt.

The owner installed CLI 1.0.114 and reported normal-profile OAuth completed on a GitHub Copilot Free account. Separate-profile preparation is implemented; Setup-Nexus-Copilot.cmd validates local package metadata and Sign-In-Nexus-Copilot.cmd explicitly signs in that profile. Neither supplies a model adapter or confirms generation entitlement. Native isolated setup and restricted prompt execution remain separate pending gates.
