# Connection setup visibility

Ask Nexus **Show my connections** or **Show connection setup** using Auto or Local routing. Cards distinguish saved setup from live health. The command does not change settings, send model prompts, refresh tokens, fetch Google events/files, start workers or contact providers.

- Ollama and private ChatGPT/Claude/Gemini cards reuse current provider configuration checks, including external enablement and request-allowance gates. A configured API still requires per-question sharing; a web chat subscription is not API setup.
- Gemini Public has its own card. Public-question enablement does not enable private-context Gemini. Its separate confirmation and public-only policy remain unchanged.
- Obsidian comes from selected-folder settings, not imported snapshots or the older environment variable. Use Show my source map for current file coverage.
- Codex workshop shows local enablement only; executable readiness, login, candidate tests and deployment remain separate evidence.
- Google cards count locally saved Calendar/Drive scopes without exposing emails or tokens. Existing encrypted credentials are read locally through the established status helper; no token refresh is performed. Remote revocation, expiry, snapshot freshness and event availability are not validated.
- GitHub Copilot and Microsoft Copilot remain separate unbuilt adapter targets. Microsoft Graph alone is not Microsoft Copilot integration.

Settings failures are isolated and labelled Settings unavailable, never converted to a connected status. Raw errors, keys, account emails and absolute vault paths are excluded from the returned cards. Existing settings are preserved. This read uses existing same-origin/controller and local-mode boundaries. No new grant, migration or remote setup endpoint is added.

Connected work, visible remains a request-activity display rather than a complete inventory. Its Obsidian node now recognizes selected Obsidian roots. Ask the connection command for setup details; neither display proves live readiness.
