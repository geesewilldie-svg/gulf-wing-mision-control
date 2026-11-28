# REA prerequisite inspection

In **Connection activity → REA inspection prerequisites**, choose **Check REA prerequisites**. This reads the actual Node version of the running Nexus process and optional package metadata at the fixed private `tools/rea/node_modules/rea-agents/package.json` location. It never searches global agent profiles or accepts a caller-supplied filesystem path.

The pinned target remains `rea-agents@6.10.1`, reviewed source revision `0f4ec6231828ec0af1807f2d093d94e5d103a553`, Node engine range `^22.23.4 || ^24.22.1 || >=26.12.1`. Stable release comparison handles exact lower bounds, unsupported major releases and prereleases conservatively; a generic Node 24 or Node 26 label is not sufficient. A compatible range result says nothing about package installation, browser targets or runtime execution success.

Package status distinguishes missing, pinned name/version/engine metadata, different metadata and unavailable/unsafe metadata. Reads are bounded to 64 KB; root/managed directory/file symlinks are rejected, directory identity is rechecked, and opened-file identity/size is checked. The response discloses no absolute path, arbitrary package contents or credentials. Metadata equality is not integrity verification or a package audit.

This is an explicit controller-only same-origin POST accepting only `action: rea-preflight`. Opening the activity panel does not trigger a check. Private results are cleared on retry/error or when the parent loses its authenticated status. There is no network request, dependency installation/update, subprocess, CLI/MCP registration, browser attachment, model generation or source-file scan. A pinned package's lifecycle scripts are never executed by inspection.

**Adapter ready remains no in every result.** An isolated installer with package integrity verification, compatible runtime, scoped browser target/permissions, bounded evidence adapter and actual acceptance tests are still required. This preflight does not connect REA or establish general browser/computer control. The existing planned connection inventory remains metadata-only and performs no preflight automatically.

A separate **Test REA protocol without browser** control now starts a checked, short-lived MCP catalog exchange on a compatible server runtime. It is not performed by this metadata preflight and does not enable browser tools. See `nexus-rea-protocol.md` for bounds, source checks, cleanup and execution evidence.


**Check REA prerequisites** now exposes this read-only observation through Auto/Local conversation. Metadata discovery still launches no process or installation; the separate **Test REA protocol** command explicitly runs the existing bounded process check. See [conversational checks](nexus-conversation-rea-checks.md).
