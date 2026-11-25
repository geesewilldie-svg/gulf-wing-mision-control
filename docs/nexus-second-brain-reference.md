# Applied video and screenshot contract for Nexus memory

This document applies the owner's supplied video excerpt and four screenshots to the build. Source: [video and timestamped evidence](references/second-brain-video-owner-excerpt.md), [YouTube link](https://www.youtube.com/watch?v=xW77SSvuto0). Full-caption retrieval is blocked by the current workspace network policy; the source record distinguishes the supplied excerpt from an independently fetched transcript.

The owner wants one lasting second brain that permitted agents can read and improve, explored through a luminous, rotatable Galaxy of real files and notes. Changing an agent/model must not discard the work history. The latest explicit owner choices govern the interface: keep the original spiral, no drawn file connections, quiet names, fullscreen and free rotation.

## What the pictures mean for appearance

| Picture feature | Build requirement | Current gap or constraint |
| --- | --- | --- |
| Dark indigo/purple space, glowing lilac/white core and cyan/magenta outer arms | A deep luminous spiral with layered depth and soft glow, not a flat graph or a grid of cards. Retain the recognizable Nexus spiral geometry. | Current renderer uses the original blue/cyan holographic palette. Closer purple/white lighting, particle depth and arm glow need a dedicated visual refinement. |
| Bright individual points among faint background particles | Real notes/files have distinct selectable stars; ambient dust is decorative and never counted as stored memory. | Delivered distinction; coverage is bounded by the actual source view. |
| Only a handful of floating names | Default names appear on hover, focus or selected objects; show full names in an inspector/list, and offer an optional all-names switch. | Delivered by the latest label update; do not restore a label on every idle star. |
| Oblique perspective changes between screenshots | Free two-axis orbit/rotation, zoom and stable orientation during expansion; mobile drag and keyboard alternatives. | Rotation, zoom, persistent expansion and direct fullscreen delivered. Smooth target-to-target camera travel and richer depth remain refinements. |
| Explore/search and expand controls | Search should find a real record and focus it; fullscreen should keep the current selection and navigation. | Existing page/index name filters and list alternatives are delivered. Unified full-memory search-to-star focus is pending. |
| Graph groups and note edges in the first screenshot | Preserve real relationships as data and in the inspector: explicit links, folder membership, or separately verified semantic evidence. | Explicit wiki links and folder neighborhoods exist. Visible connecting lines remain off by the owner's explicit preference. |
| Memory/connection counts | Counts must describe current real records and verified links, with freshness/coverage limits. | Existing file counts are bounded source counts, not a complete global second-brain count. Verified global memory/link metrics are pending. |

Do not copy the video's brand, exact demo note titles, people, project names, or counts into the owner's data. Use the pictures as appearance and interaction evidence.

## What the transcript means for operation

1. **Model-independent durable memory.** Knowledge Markdown lives in the selected Obsidian-compatible vault. SQLite remains authoritative for owner facts/instructions, tasks, permissions and write receipts. Source notes remain knowledge evidence. This split prevents exported historical snapshots from silently becoming current owner truth.
2. **Agents retrieve relevant context.** A common memory access contract must select records by workspace, current access, relevance and freshness; return bounded text plus source IDs/revisions/hashes and verification state. This is retrieval, not model training. A model switch can reuse permitted history when its adapter supports the contract.
3. **Authorized work produces memory.** Preserve the already enabled completed-task journal. Extend permitted agent adapters to report their run/task identity, actions, artifact references, decisions and outcome through the same durable receipt process. Record unverified output as unverified; saving an agent answer does not establish a fact or execution success.
4. **Updates become discoverable.** A confirmed note save has a separate indexing/discovery result. Keep pending indexing visible; add the confirmed version to search/Galaxy when eligible. Current journal/save indexing already implements the first slice. A failed or uncertain save must not be silently replayed.
5. **Continuity must respect corrections.** Current task context can use live SQLite records. A synchronized current-note layer still needs stable IDs, conflict handling, supersession and correction/forgetting semantics. Retained snapshots and historical journal notes must not override current facts after edits or deletion.
6. **Permitted agents are real adapters.** Local Ollama retrieval is implemented; coding-worker and future agent memory access must use explicit adapter contracts. Chat subscriptions, a CLI sign-in or a selected vault do not prove a general connected agent. Preserve provider-sharing controls and local-only owner-memory exclusions.
7. **One shared workspace across devices.** A phone or ScreenPad navigates the laptop-hosted memory under its controller role. Other hosts and native phone storage need their own adapters. Fullscreen visuals do not expand authority.

## Target data flow (not a claim that all adapters are connected)

```mermaid
flowchart LR
    Notes["Current Markdown knowledge"] --> Broker["Scoped, version-checked memory service"]
    State["SQLite facts, tasks and policy"] --> Broker
    Broker -->|"Bounded permitted context"| Agents["Permitted agent adapters"]
    Agents -->|"Authorized task/run outcomes"| Receipts["Durable work-note receipts"]
    Receipts -->|"Provenance-bearing notes"| Notes
    Notes --> Catalog["Search and real Galaxy stars"]
```

Historical snapshots are separately identified and excluded from automatic context where required. Provider permissions still decide which portions, if any, can leave the host. The diagram describes the target integration; the delivery sequence below and existing memory documentation distinguish current slices.

## Keep storage navigation separate from assistant memory

The owner also requested Computer → Drive → Folder → File access. Browse-only drive/common-folder grants and the Storage galaxy supply that separate navigation layer. Displaying a drive, Downloads item or picture must not index its body, save it as an owner fact, send it to an agent, or create a note automatically. Knowledge stars and Storage galaxy may share the visual language while preserving their distinct coverage and permissions.

## Delivery sequence from the reference

| Stage | Concrete deliverable | Completion evidence |
| --- | --- | --- |
| 1. Governing reference | Record the source excerpt, screenshot interpretation, owner overrides and delivered/pending distinctions. | This document and the linked source record; full transcript remains unavailable pending network access. |
| 2. Visual match | Refine the existing spiral's indigo/purple atmosphere, white/lilac center, cyan outer arms and depth, keeping quiet labels, no connections, selection and fullscreen. | Desktop/mobile captures compared to the supplied pictures, reduced-motion checks, contrast/touch checks and no regressions in real file opening. Do not substitute a new flat graph. |
| 3. Shared memory service | One adapter-facing retrieval envelope and work-note write receipt contract with workspace/current-version checks. | Two permitted adapter fixtures reuse the same current work note; denied scopes/providers cannot receive it; model identity changes without losing source provenance. |
| 4. Current-note lifecycle | Stable note identity, revisions, external-edit conflict detection and explicit supersession/correction/forgetting behavior. | Restart, external edit, conflict, delete/correct and uncertain-write tests; historical snapshots remain visibly historical. |
| 5. Search and scale | Search-to-star focus and actual memory/link metrics; bounded layouts/clustering for large collections. | Counts match the current catalog; omitted/offline records are disclosed; no fake stars, relations or “all memory” claims beyond coverage. |

These are implementation requirements, not permission to enable providers, change billing, send messages or rewrite owner-created notes. Existing authorized journal behavior continues; this reference adds no new runtime grant.

## Acceptance scenarios

- An authorized agent completes work; its confirmed, provenance-bearing note becomes discoverable. A second permitted adapter can retrieve the current relevant note after restart. Nothing implies the new model was trained on it.
- An owner correction or deletion takes precedence over older snapshots; stale notes do not reintroduce forgotten owner facts into automatic answers.
- A file star can be found, focused, orbited around and explicitly opened while preserving identity/version checks and fullscreen state. Focusing performs no content-read or provider request.
- The default scene reads as the supplied glowing spiral at laptop and phone sizes; labels do not obscure the arms. There are no visible file-connection lines.
- A browse-only folder can be explored and an original opened without being added to the knowledge index or model context.
- Unsupported, denied, removed, changed or offline resources have an honest result; a saved integration setting is not shown as verified cross-agent readiness.
