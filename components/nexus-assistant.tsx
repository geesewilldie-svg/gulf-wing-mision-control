"use client";
import LocalModelCheck from "./local-model-check";
import type { LocalModelCheck as ModelCheck } from "@/lib/local-model-check";
import ReaSelfTestHistory from "./rea-self-test-history";
import type { ReaSelfTestHistory as ReaHistory } from "@/lib/rea-self-test-history";
import LocalModelCheckHistory from "./local-model-check-history";
import type { LocalModelCheckHistory as ModelHistory } from "@/lib/local-model-check-history";
import LocalModelDetails from "./local-model-details";
import type { LocalModelDetails as ModelDetails } from "@/lib/local-model-details";
import LocalModelCatalog from "./local-model-catalog";
import type { LocalModelCatalog as ModelCatalog } from "@/lib/local-model-catalog";
import { currentRecordIntent } from "@/lib/current-record-intent";
import type { CurrentRecordInspection } from "@/lib/current-record-search";
import CurrentRecordSearch from "./current-record-search";
import type { CurrentRecordSearch as RecordResults } from "@/lib/current-record-search";
import LocalAnswerModel from "./local-answer-model";
import OriginalFileLinks from "./original-file-links";
import JournalReceipt from "./journal-receipt";
import type { JournalReceiptView } from "@/lib/work-journal";
import { NexusSourceMap } from "./nexus-source-map";
import type { SourceMap } from "../lib/source-map";
import type { LaptopOperationFeedback } from "../lib/laptop-operation-feedback";
import { useEffect, useState, useRef, createContext, useContext } from "react";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/hooks/use-workspace";
import type { KnowledgeDocument } from "@/lib/nexus";
import type { ProviderStatus, AgentResult } from "@/lib/agent-router";
import type { ConversationTurn } from "@/lib/conversation";
import { scopes, type Scope } from "@/lib/foundation/contracts";
import NexusVoice from "./nexus-voice";
import AssistantDrafts from "./assistant-drafts";
import NexusLinkReview, { type LinkPreview } from "./nexus-link-review";
const AssistantContext = createContext({
  conversationActive: false,
  openAssistant: () => {},
});
export const useNexusAssistant = () => useContext(AssistantContext);
type Answer = {
  localModels?: ModelCatalog;
  localModelCheck?: ModelCheck;
  reaHistory?: ReaHistory;
  localModelHistory?: ModelHistory;
  localModelDetails?: ModelDetails;
  recordSearch?: RecordResults;
  recordInspection?: CurrentRecordInspection;
  engine: string;
  journalEntries?: JournalReceiptView[];
  journalEntry?: JournalReceiptView;
  workReferences?: {
    reference: string;
    id: string;
    revision: number;
    workspace: string;
    state: string;
    request: string;
    updatedAt: string;
  }[];
  linkPreview?: LinkPreview;
  capabilities?: {
    effects?: string;
    verification?: string;
    id: string;
    name: string;
    status: string;
    detail: string;
    authorization: string;
  }[];
  sourceMap?: SourceMap;
  operationId?: string;
  operationChoices?: ({
    id: string;
    label: string;
  } & Partial<LaptopOperationFeedback>)[];
  operationDetail?: LaptopOperationFeedback;
  fileChoices?: { id: string; hash: string; name: string }[];
  fileRead?: {
    name?: string;
    id: string;
    hash: string;
    part: number;
    totalParts: number;
  } | null;
  memory?: { id: string; revision: number; scope: string };
  memoryChoices?: {
    id: string;
    revision: number;
    scope: string;
    kind: string;
    content: string;
  }[];
  task?: { id: string; scope: string; revision: number };
  taskChoices?: {
    id: string;
    scope: string;
    revision: number;
    request: string;
    state: string;
  }[];
  taskDetail?: {
    request: string;
    state: string;
    reason: string;
    output: string;
    updatedAt: string;
  };
  answer: string;
  sources: KnowledgeDocument[];
  warnings?: string[];
  agents?: AgentResult[];
  routing?: { reason: string };
};
export default function NexusAssistant({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sync } = useWorkspace();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const tab = "Assistant";
  const presentation =
    pathname === "/display" || pathname.startsWith("/estimate/");
  const [workspaceScope, setWorkspaceScope] = useState<Scope>("Personal");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("auto");
  const [localModel, setLocalModel] = useState("");
  const [allowExternal, setAllowExternal] = useState(false);
  const [publicQuery, setPublicQuery] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingAnswer = useRef<AbortController | null>(null);
  const taskContext = useRef<Answer["task"]>(undefined);
  const recordSearchReference = useRef<string | undefined>(undefined);
  const memoryReference = useRef<Answer["memory"]>(undefined);
  const workStamp = useRef<string | undefined>(undefined);
  const contextRevision = useRef<number | undefined>(undefined);
  useEffect(() => {
    recordSearchReference.current = undefined;
    taskContext.current = undefined;
    memoryReference.current = undefined;
    workStamp.current = undefined;
    setAnswer((current) => (current?.recordSearch ? null : current));
    window.dispatchEvent(new Event("nexus:context-reset"));
  }, [workspaceScope]);
  useEffect(() => () => pendingAnswer.current?.abort(), []);
  useEffect(() => {
    const clear = () => {
      recordSearchReference.current = undefined;
    };
    window.addEventListener("nexus:record-search-changed", clear);
    return () =>
      window.removeEventListener("nexus:record-search-changed", clear);
  }, []);
  const [conversationActive, setConversationActive] = useState(false);
  const [message, setMessage] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const feedbackRegion = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!conversationActive && (answer || message))
      feedbackRegion.current?.scrollIntoView({ block: "nearest" });
  }, [answer, message, conversationActive]);
  const [status, setStatus] = useState<{
    sections: number;
    sources: string[];
    localModel: boolean;
    providers?: ProviderStatus[];
    obsidian?: boolean;
    webProvider?: string;
  } | null>(null);
  const disabled =
    presentation ||
    sync.mode !== "shared" ||
    sync.role === "display" ||
    sync.needsPair;
  useEffect(() => {
    if (disabled) {
      setStatus(null);
      return;
    }
    const abort = new AbortController();
    fetch("/api/sync/nexus", { signal: abort.signal })
      .then(async (r) => {
        if (r.ok) setStatus(await r.json());
      })
      .catch(() => {});
    return () => abort.abort();
  }, [disabled]);
  useEffect(() => {
    if (disabled) {
      pendingAnswer.current?.abort();
      recordSearchReference.current = undefined;
      setAnswer(null);
      taskContext.current = undefined;
      memoryReference.current = undefined;
      contextRevision.current = undefined;
      workStamp.current = undefined;
      setQuery("");
      setLastQuestion("");
      setMessage("");
      setAllowExternal(false);
      setPublicQuery("");
    }
  }, [disabled]);
  const ask = async (
    text: string,
    history: ConversationTurn[] = [],
    signal?: AbortSignal,
    displayText?: string,
  ) => {
    const recordKind = currentRecordIntent(text)?.kind;
    const inspectingRecord = recordKind === "inspect" || recordKind === "page";
    const selectedRecords = inspectingRecord
      ? recordSearchReference.current
      : undefined;
    if (!inspectingRecord) recordSearchReference.current = undefined;
    const controller = signal ? null : new AbortController();
    if (controller) pendingAnswer.current = controller;
    const requestSignal = signal || controller!.signal;
    setBusy(true);
    setLastQuestion(displayText || text.trim());
    setAnswer(null);
    setMessage("");
    setAllowExternal(false);
    setPublicQuery("");
    setLocalModel("");
    try {
      const r = await fetch("/api/sync/nexus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: text,
          requestId: globalThis.crypto?.randomUUID?.(),
          taskContext: taskContext.current,
          memoryReference: memoryReference.current,
          recordSearchReference: selectedRecords,
          contextRevision: contextRevision.current,
          workContextStamp: workStamp.current,
          voiceConversation: Boolean(signal),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          workspaceScope,
          mode,
          localModel:
            !signal && mode === "local" && localModel ? localModel : undefined,
          history,
          allowExternal,
          publicQuery,
        }),
        signal: requestSignal,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (requestSignal.aborted)
        throw new DOMException("Stopped", "AbortError");
      if (Number.isSafeInteger(data.contextRevision))
        contextRevision.current = data.contextRevision;
      if (typeof data.workContextStamp === "string")
        workStamp.current = data.workContextStamp;
      if (data.resetHistory)
        window.dispatchEvent(new Event("nexus:context-reset"));
      if (data.clearRecordReferences === true) {
        taskContext.current = undefined;
        memoryReference.current = undefined;
      }
      if (data.memoryChoices || data.memoryCleared)
        memoryReference.current = undefined;
      if (data.memory) memoryReference.current = data.memory;
      if (data.taskChoices) taskContext.current = undefined;
      if (data.task) taskContext.current = data.task;
      recordSearchReference.current =
        typeof data.recordSearchReference === "string"
          ? data.recordSearchReference
          : undefined;
      setAnswer(data);
      return data.answer as string;
    } catch (e) {
      if (inspectingRecord) recordSearchReference.current = undefined;
      if ((e as Error).name !== "AbortError") setMessage((e as Error).message);
      throw e;
    } finally {
      if (controller && pendingAnswer.current === controller)
        pendingAnswer.current = null;
      setBusy(false);
    }
  };
  return (
    <AssistantContext.Provider
      value={{ conversationActive, openAssistant: () => setOpen(true) }}
    >
      <div
        className={
          "nexus-app-frame" +
          (pathname === "/" ? " nexus-route-dashboard" : "") +
          (open && !presentation ? " assistant-is-open" : "")
        }
      >
        {children}
        <aside
          className="nexus-assistant-drawer nexus-card"
          aria-label="Nexus personal assistant"
          hidden={!open || presentation}
        >
          <header className="assistant-title">
            <div>
              <span className="assistant-eyebrow">PERSONAL ASSISTANT</span>
              <h2>
                Nexus<span>●</span>
              </h2>
            </div>
            <button
              type="button"
              disabled={disabled || (busy && !conversationActive)}
              onClick={() =>
                window.dispatchEvent(
                  new Event(
                    conversationActive
                      ? "nexus:voice-mute"
                      : "nexus:voice-start",
                  ),
                )
              }
            >
              {conversationActive ? "Mute voice" : "Start voice"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Minimize Nexus assistant"
            >
              −
            </button>
          </header>
          <p className="assistant-presence">
            {conversationActive
              ? "Voice session active · mute below"
              : "Ready when you are · microphone off"}
          </p>
          <p className="assistant-hint">
            Talk or type while you work. Start voice for a hands-free
            conversation.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(query).catch(() => {});
            }}
          >
            <label htmlFor="nexus-assistant-question">Ask Nexus</label>
            <textarea
              id="nexus-assistant-question"
              aria-label="Ask Nexus"
              required
              maxLength={2000}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What would you like to work on?"
            />
            <button disabled={disabled || busy || conversationActive}>
              {busy ? "Working…" : "Ask Nexus"}
            </button>
            {busy && !conversationActive && (
              <button
                type="button"
                onClick={() => pendingAnswer.current?.abort()}
              >
                Cancel answer
              </button>
            )}
            <details className="assistant-settings">
              <summary>Answer settings and sharing</summary>{" "}
              <label>
                Routing
                <select
                  aria-label="Routing"
                  disabled={conversationActive}
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value);
                    setLocalModel("");
                  }}
                >
                  <option value="auto">
                    Auto — local first, permitted agents only
                  </option>
                  <option value="knowledge">Knowledge only — no model</option>
                  <option value="local">Choose agent — local Ollama</option>
                  <option value="compare">
                    Compare answers — up to two permitted models
                  </option>
                  {(status?.providers ?? [])
                    .filter((p) => p.external)
                    .map((p) => (
                      <option key={p.id} value={p.id} disabled={!p.configured}>
                        {p.name}
                        {p.configured ? "" : " — disabled"}
                      </option>
                    ))}
                </select>
              </label>
              {mode === "local" && !disabled && (
                <LocalAnswerModel
                  value={localModel}
                  onChange={setLocalModel}
                  disabled={busy || conversationActive}
                />
              )}
              <label className="nexus-sharing">
                <input
                  type="checkbox"
                  checked={allowExternal}
                  disabled={busy || conversationActive}
                  onChange={(e) => setAllowExternal(e.target.checked)}
                />
                Allow configured external models to receive my question,
                selected private excerpts and recent conversation for the next
                answer. Provider billing may apply. Off by default.
              </label>
              <label>
                Optional public research terms
                <input
                  maxLength={300}
                  value={publicQuery}
                  disabled={busy || conversationActive}
                  onChange={(e) => setPublicQuery(e.target.value)}
                  placeholder="Public terms only — sent to the research source when you ask"
                />
              </label>
              <p className="nexus-router-note">
                Research source:{" "}
                {status?.webProvider || "English Wikipedia (encyclopedia only)"}
                . Leave blank to avoid public research requests. External
                sharing and public terms reset after each question.
              </p>
            </details>{" "}
          </form>
          <div ref={feedbackRegion} className="nexus-request-feedback">
            {lastQuestion && (
              <p>
                <strong>Your request:</strong> {lastQuestion}
              </p>
            )}
            {message && <p role="status">{message}</p>}
            {answer && (
              <article className="nexus-answer">
                <h3>{answer.engine}</h3>
                <p>{answer.answer}</p>
                {answer.localModelCheck && (
                  <LocalModelCheck
                    key={answer.localModelCheck.runId}
                    model={answer.localModelCheck.model}
                    digest={answer.localModelCheck.digest}
                    initialResult={answer.localModelCheck}
                  />
                )}
                {answer.reaHistory && (
                  <ReaSelfTestHistory
                    key={answer.reaHistory.readAt}
                    initialResult={answer.reaHistory}
                  />
                )}
                {answer.localModelHistory && (
                  <LocalModelCheckHistory
                    key={answer.localModelHistory.readAt}
                    initialResult={answer.localModelHistory}
                  />
                )}
                {answer.localModelDetails && (
                  <LocalModelDetails
                    key={
                      answer.localModelDetails.model +
                      answer.localModelDetails.digest +
                      answer.localModelDetails.checkedAt
                    }
                    initialResult={answer.localModelDetails}
                    model={{
                      name: answer.localModelDetails.model,
                      digest: answer.localModelDetails.digest,
                    }}
                  />
                )}
                {answer.localModels && (
                  <LocalModelCatalog
                    key={answer.localModels.checkedAt}
                    initialResult={answer.localModels}
                  />
                )}
                {answer.recordSearch && (
                  <CurrentRecordSearch
                    key={answer.recordSearch.stamp + answer.recordSearch.readAt}
                    initialResult={answer.recordSearch}
                    initialInspection={answer.recordInspection}
                    enabled={!disabled}
                  />
                )}
                {answer.sourceMap && (
                  <NexusSourceMap
                    map={answer.sourceMap}
                    disabled={disabled || busy}
                    onRead={(id, hash, name) =>
                      void ask(
                        `Read laptop file ${id}@${hash}`,
                        [],
                        undefined,
                        `Read file: ${name}`,
                      ).catch(() => {})
                    }
                  />
                )}
                {answer.linkPreview && (
                  <NexusLinkReview
                    key={answer.linkPreview.requestId}
                    preview={answer.linkPreview}
                    disabled={disabled}
                  />
                )}
                {answer.capabilities && (
                  <div className="nexus-capability-list">
                    {answer.capabilities.map((capability) => (
                      <section
                        className="nexus-draft-file"
                        aria-label={capability.name}
                        key={capability.id}
                      >
                        <h4>{capability.name}</h4>
                        <p className="nexus-draft-meta">{capability.status}</p>
                        <p>{capability.detail}</p>
                        {capability.effects && (
                          <p>
                            <strong>Effects: </strong>
                            {capability.effects}
                          </p>
                        )}
                        {capability.verification && (
                          <p>
                            <strong>Evidence and limits: </strong>
                            {capability.verification}
                          </p>
                        )}
                        <p className="nexus-router-note">
                          {capability.authorization}
                        </p>
                      </section>
                    ))}
                  </div>
                )}
                {answer.operationDetail && (
                  <section
                    className="nexus-draft-file"
                    aria-label="Saved operation result"
                  >
                    <h4>{answer.operationDetail.name}</h4>
                    <p>
                      <strong>{answer.operationDetail.status}</strong>
                    </p>
                    <p>{answer.operationDetail.detail}</p>
                    <p>{answer.operationDetail.nextStep}</p>
                    <details>
                      <summary>Operation reference</summary>
                      <p>{answer.operationDetail.id}</p>
                    </details>
                  </section>
                )}
                {!!answer.operationChoices?.length && (
                  <div className="nexus-capability-list">
                    {answer.operationChoices?.map((operation) => (
                      <section className="nexus-draft-file" key={operation.id}>
                        <h4>{operation.name || operation.label}</h4>
                        {operation.status && <p>{operation.status}</p>}
                        <div className="nexus-draft-actions">
                          <button
                            disabled={disabled || busy}
                            aria-label={`View result: ${operation.label}`}
                            onClick={() =>
                              void ask(
                                `Show laptop operation ${operation.id}`,
                              ).catch(() => {})
                            }
                          >
                            View result
                          </button>
                        </div>
                      </section>
                    ))}
                  </div>
                )}
                {answer.operationId && (
                  <button
                    disabled={disabled || busy}
                    onClick={() =>
                      void ask(
                        `Show laptop operation ${answer.operationId}`,
                      ).catch(() => {})
                    }
                  >
                    View saved operation status
                  </button>
                )}
                {answer.fileChoices?.map((file) => (
                  <button
                    key={file.id}
                    disabled={disabled || busy}
                    onClick={() =>
                      void ask(
                        `Read laptop file ${file.id}@${file.hash}`,
                        [],
                        undefined,
                        `Read file: ${file.name}`,
                      ).catch(() => {})
                    }
                  >
                    Read file: {file.name}
                  </button>
                ))}
                {answer.fileRead && (
                  <OriginalFileLinks
                    id={answer.fileRead.id}
                    hash={answer.fileRead.hash}
                    name={answer.fileRead.name}
                  />
                )}
                {answer.fileRead &&
                  answer.fileRead.part < answer.fileRead.totalParts && (
                    <button
                      disabled={disabled || busy}
                      onClick={() =>
                        void ask(
                          `Read laptop file ${answer.fileRead!.id}@${answer.fileRead!.hash} part ${answer.fileRead!.part + 1}`,
                          [],
                          undefined,
                          "Read next part",
                        ).catch(() => {})
                      }
                    >
                      Next part
                    </button>
                  )}
                {answer.memoryChoices?.map((memory) => (
                  <button
                    key={memory.id}
                    disabled={disabled || busy}
                    onClick={() => {
                      memoryReference.current = {
                        id: memory.id,
                        revision: memory.revision,
                        scope: memory.scope,
                      };
                      setMessage(
                        `Selected memory: ${memory.content}. Say “Correct that memory to…” or “Forget that memory”.`,
                      );
                    }}
                  >
                    Select memory: {memory.kind} · {memory.content} ·{" "}
                    {memory.id.slice(0, 8)}
                  </button>
                ))}
                {answer.memory && (
                  <p>
                    Memory reference: {answer.memory.id}. Review saved memory in
                    Foundation.
                  </p>
                )}
                {answer.journalEntries?.map((entry) => (
                  <JournalReceipt
                    key={entry.reference}
                    entry={entry}
                    busy={disabled || busy}
                    view={() => {
                      void ask(`Show journal entry ${entry.reference}`).catch(
                        () => {},
                      );
                    }}
                    open={() => {}}
                  />
                ))}
                {answer.journalEntry && (
                  <JournalReceipt
                    entry={answer.journalEntry}
                    detail
                    busy={disabled || busy}
                    view={() => {}}
                    open={() => {
                      const file = answer.journalEntry!.indexedFile!;
                      void ask(
                        `Read laptop file ${file.id}@${file.hash} part 1`,
                        [],
                        undefined,
                        "Open indexed journal note",
                      ).catch(() => {});
                    }}
                  />
                )}
                {!!answer.taskChoices?.length && (
                  <p>Select a task below before saying “that task”.</p>
                )}
                {answer.taskChoices?.map((task) => (
                  <button
                    key={task.id}
                    disabled={disabled || busy}
                    onClick={() => {
                      taskContext.current = {
                        id: task.id,
                        revision: task.revision,
                        scope: task.scope,
                      };
                      setMessage(
                        `Selected: ${task.request}. Say or type “Pause that task”, “Resume that task”, “Cancel that task” or “Show that task”.`,
                      );
                    }}
                  >
                    Select task: {task.request} · {task.state} ·{" "}
                    {task.id.slice(0, 8)}
                  </button>
                ))}
                {answer.taskDetail && (
                  <details>
                    <summary>Saved task progress and output</summary>
                    <p>{answer.taskDetail.reason}</p>
                    <p>Updated: {answer.taskDetail.updatedAt}</p>
                    <p>{answer.taskDetail.output || "No saved output yet."}</p>
                  </details>
                )}
                {answer.task && (
                  <p>
                    Task reference: {answer.task.id}. Manage it under Nexus →
                    Foundation.
                  </p>
                )}
                {answer.agents?.length ? (
                  <p className="nexus-router-note">
                    Answered by:{" "}
                    {answer.agents
                      .filter((a) => a.answer)
                      .map((a) => a.name)
                      .join(", ")}
                    . Verify generated claims against the sources.
                  </p>
                ) : null}
                {answer.routing && (
                  <p className="nexus-router-note">{answer.routing.reason}</p>
                )}
                {!!answer.agents?.some((agent) => agent.answer) && (
                  <details>
                    <summary>Model response details</summary>
                    <p>
                      Requested model comes from this request's configuration.
                      Reported model is response metadata from the provider, not
                      independent identity verification.
                    </p>
                    {answer.agents
                      .filter((agent) => agent.answer)
                      .map((agent) => (
                        <p key={agent.provider}>
                          {agent.name} · Requested:{" "}
                          {agent.requestedModel || "Not recorded"} · Provider
                          reported: {agent.reportedModel || "Not supplied"}
                        </p>
                      ))}
                  </details>
                )}
                {answer.warnings?.map((w) => (
                  <p className="nexus-router-note" key={w}>
                    {w}
                  </p>
                ))}
                {answer.agents && answer.agents.length > 1 && (
                  <details>
                    <summary>Individual agent responses</summary>
                    {answer.agents.map((a) => (
                      <section key={a.provider}>
                        <h4>{a.name}</h4>
                        <p>{a.answer || a.error}</p>
                      </section>
                    ))}
                  </details>
                )}
                {!!answer.workReferences?.length && (
                  <section aria-label="Saved work used in this answer">
                    <h4>Saved work used locally</h4>
                    <p>
                      Unverified task history. Review full artifacts in
                      Foundation; these excerpts do not prove external work.
                    </p>
                    {answer.workReferences.map((work) => (
                      <p key={work.id}>
                        [{work.reference}] {work.request} · {work.workspace} ·{" "}
                        {work.state} · revision {work.revision} · task {work.id}
                      </p>
                    ))}
                  </section>
                )}
                {!!answer.sources.length && (
                  <h4>
                    Retrieved sources · verify generated claims against these
                    passages
                  </h4>
                )}
                {answer.sources.map((source, i) => (
                  <details key={source.id}>
                    <summary>
                      [{i + 1}] {source.source} · {source.location}
                    </summary>
                    {/^(https?:)\/\//.test(source.location) && (
                      <a
                        href={source.location}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open public source ↗
                      </a>
                    )}
                    <p>{source.text}</p>
                  </details>
                ))}
              </article>
            )}
            <AssistantDrafts
              text={answer?.answer || ""}
              scope={workspaceScope}
              disabled={disabled}
              sourceBusy={busy}
            />
          </div>
          <NexusVoice
            disabled={disabled}
            section={tab}
            answer={answer?.answer ?? ""}
            onTranscript={setQuery}
            onAsk={(text, history, signal) => {
              setQuery(text);
              if (
                /\b(read|give|show|what)\b.*\b(morning|daily) brief\b/i.test(
                  text,
                )
              ) {
                return fetch("/api/sync/brief/morning", { signal }).then(
                  async (r) => {
                    const d = await r.json();
                    if (!r.ok) throw Error(d.error);
                    return (
                      d.brief?.text ||
                      "No saved morning brief is available. Enable local weekday briefs in Daily brief settings."
                    );
                  },
                );
              }
              return ask(text, history, signal);
            }}
            onConversationActive={setConversationActive}
          />
          <details>
            <summary>Memory workspace</summary>
            <label>
              Owner memory workspace{" "}
              <select
                disabled={conversationActive || busy}
                value={workspaceScope}
                onChange={(e) => setWorkspaceScope(e.target.value as Scope)}
              >
                {scopes.map((scope) => (
                  <option key={scope}>{scope}</option>
                ))}
              </select>
            </label>
          </details>
          {disabled && (
            <p>
              Connect this device as a controller to use private assistant
              features.
            </p>
          )}
        </aside>
        {!presentation && (
          <button
            className={
              "nexus-assistant-launcher" +
              (conversationActive ? " is-listening" : "")
            }
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {conversationActive ? "● Nexus · Voice active" : "✦ Talk to Nexus"}
            {open ? " · Minimize" : ""}
          </button>
        )}
      </div>
    </AssistantContext.Provider>
  );
}
