"use client";
import { useEffect, useState } from "react";
import {
  scopes,
  type Scope,
  type MemoryRecord,
  type FoundationSnapshot,
} from "@/lib/foundation/contracts";
export default function NexusFoundation({ disabled }: { disabled: boolean }) {
  const [data, setData] = useState<FoundationSnapshot | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [request, setRequest] = useState(""),
    [workspace, setWorkspace] = useState<Scope>("Personal"),
    [mode, setMode] = useState("plan");
  const [content, setContent] = useState(""),
    [kind, setKind] = useState("fact"),
    [memoryScope, setMemoryScope] = useState<Scope>("Personal"),
    [editing, setEditing] = useState<MemoryRecord | null>(null);
  const [search, setSearch] = useState(""),
    [matches, setMatches] = useState("");
  useEffect(() => {
    if (disabled) {
      setData(null);
      return;
    }
    const abort = new AbortController();
    const load = () =>
      fetch("/api/sync/foundation", { signal: abort.signal })
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw Error(d.error);
          setData(d);
        })
        .catch((e) => {
          if (e.name !== "AbortError") setMessage(e.message);
        });
    void load();
    const t = setInterval(load, 5000);
    return () => {
      abort.abort();
      clearInterval(t);
    };
  }, [disabled]);
  async function mutate(body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/sync/foundation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (d.schemaVersion) setData(d);
      setMessage(
        d.filename
          ? "Foundation backup saved privately: " + d.filename
          : "Saved locally.",
      );
      return d;
    } catch (e) {
      setMessage((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  function download(text: string, name: string) {
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (disabled)
    return (
      <section className="nexus-card">
        <h2>Nexus foundation</h2>
        <p>Pair as a Controller to manage private tasks, memory and policy.</p>
      </section>
    );
  return (
    <section className="nexus-foundation" aria-label="Nexus durable foundation">
      <h2>Nexus foundation</h2>
      <p>
        Persistent tasks, local-only owner memory and a controlled development
        path. This is one trusted-controller installation; workspace scopes are
        not separate company accounts.
      </p>
      <p role="status">{message}</p>
      {!data ? (
        <p>Loading private foundation…</p>
      ) : (
        <>
          <section className="nexus-card">
            <h3>Owner policy</h3>
            <p>
              Local planning dispatch:{" "}
              <strong>
                {data.policy.planningEnabled ? "Enabled" : "Paused"}
              </strong>{" "}
              · revision {data.policy.revision}. Shell, browser actions, sending
              messages and payments are not available to this coordinator.
            </p>
            <button
              disabled={busy}
              onClick={() =>
                mutate({
                  op: "policy.set",
                  revision: data.policy.revision,
                  enabled: !data.policy.planningEnabled,
                })
              }
            >
              {data.policy.planningEnabled
                ? "Pause all planning"
                : "Enable local planning"}
            </button>
            <button
              disabled={busy}
              onClick={() => mutate({ op: "backup.create" })}
            >
              Back up foundation database
            </button>
            <p>
              Backup covers this SQLite foundation only. Existing business
              files, models and credentials need their own backup.
            </p>
          </section>
          <section className="nexus-card">
            <h3>Durable work</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await mutate({
                    op: "task.create",
                    request,
                    scope: workspace,
                    mode,
                  })
                )
                  setRequest("");
              }}
            >
              <label>
                Task objective
                <textarea
                  required
                  maxLength={2000}
                  value={request}
                  onChange={(e) => setRequest(e.target.value)}
                />
              </label>
              <label>
                Task workspace
                <select
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value as Scope)}
                >
                  {scopes.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Work type
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="plan">
                    Prepare a local plan — no external execution
                  </option>
                  <option value="development">
                    Prepare a development handoff — worker not connected
                  </option>
                </select>
              </label>
              <button disabled={busy} type="submit">
                Save task
              </button>
            </form>
            {data.tasks.length === 0 && (
              <p>
                No real tasks saved here. DEMO board missions are not imported.
              </p>
            )}
            {data.tasks.map((t) => (
              <article
                className="foundation-task"
                key={t.id}
                aria-label={"Task: " + t.request}
              >
                <h4>{t.request}</h4>
                <p>
                  {t.scope} · <strong>{t.state}</strong> · revision {t.revision}
                </p>
                <p>{t.reason}</p>
                <div className="foundation-actions">
                  {["accepted", "paused", "failed", "waiting"].includes(
                    t.state,
                  ) && (
                    <button
                      disabled={busy || !data.policy.planningEnabled}
                      onClick={() =>
                        mutate({
                          op: "task.change",
                          id: t.id,
                          revision: t.revision,
                          action: "queue",
                        })
                      }
                    >
                      Queue work
                    </button>
                  )}
                  {[
                    "accepted",
                    "queued",
                    "running",
                    "verifying",
                    "waiting",
                  ].includes(t.state) && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        mutate({
                          op: "task.change",
                          id: t.id,
                          revision: t.revision,
                          action: "pause",
                        })
                      }
                    >
                      Pause task
                    </button>
                  )}
                  {!["completed", "cancelled"].includes(t.state) && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        mutate({
                          op: "task.change",
                          id: t.id,
                          revision: t.revision,
                          action: "cancel",
                        })
                      }
                    >
                      Cancel task
                    </button>
                  )}
                  {!["queued", "running", "verifying"].includes(t.state) && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        mutate({
                          op: "task.delete",
                          id: t.id,
                          revision: t.revision,
                        })
                      }
                    >
                      Delete task
                    </button>
                  )}
                </div>
                {!["completed", "cancelled"].includes(t.state) && (
                  <details>
                    <summary>Correct objective</summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void mutate({
                          op: "task.change",
                          id: t.id,
                          revision: t.revision,
                          action: "steer",
                          request: f.get("objective"),
                        });
                      }}
                    >
                      <label>
                        Revised objective
                        <textarea
                          name="objective"
                          required
                          maxLength={2000}
                          defaultValue={t.request}
                        />
                      </label>
                      <button disabled={busy}>Save correction and pause</button>
                    </form>
                  </details>
                )}
                {t.output && (
                  <details>
                    <summary>Saved artifact</summary>
                    <pre>{t.output}</pre>
                    <button
                      onClick={() =>
                        download(
                          t.output,
                          "nexus-" +
                            t.id +
                            (t.mode === "development" ? ".json" : ".md"),
                        )
                      }
                    >
                      Download artifact
                    </button>
                  </details>
                )}
              </article>
            ))}
          </section>
          <section className="nexus-card">
            <h3>Owner memory and instructions</h3>
            <p>
              Explicit owner records only. Instructions guide local responses
              but cannot grant execution authority. Personal records apply
              across task workspaces. No automatic inference or external
              sharing.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await mutate({
                    op: "memory.save",
                    content,
                    kind,
                    scope: memoryScope,
                    ...(editing
                      ? { id: editing.id, revision: editing.revision }
                      : {}),
                  })
                ) {
                  setContent("");
                  setEditing(null);
                }
              }}
            >
              <label>
                Memory text
                <textarea
                  required
                  maxLength={1000}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </label>
              <label>
                Memory category
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="fact">Fact</option>
                  <option value="preference">Preference</option>
                  <option value="instruction">
                    Owner instruction (guidance)
                  </option>
                </select>
              </label>
              <label>
                Memory workspace
                <select
                  value={memoryScope}
                  onChange={(e) => setMemoryScope(e.target.value as Scope)}
                >
                  {scopes.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <button disabled={busy}>
                {editing ? "Save memory correction" : "Save owner memory"}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setContent("");
                  }}
                >
                  Cancel correction
                </button>
              )}
            </form>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await mutate({
                  op: "memory.search",
                  scope: memoryScope,
                  query: search,
                });
                if (r) setMatches(JSON.stringify(r.context, null, 2));
              }}
            >
              <label>
                Search owner memory
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  required
                  maxLength={2000}
                />
              </label>
              <button disabled={busy}>Search memory</button>
            </form>
            {matches && <pre>{matches}</pre>}
            <button
              onClick={() =>
                download(
                  JSON.stringify(data.memory, null, 2),
                  "nexus-owner-memory.json",
                )
              }
            >
              Export visible owner memory
            </button>
            {data.memory.map((m) => (
              <article key={m.id} className="foundation-memory">
                <p>{m.content}</p>
                <small>
                  {m.scope} · {m.kind} · owner-stated · local-only · revision{" "}
                  {m.revision}
                </small>
                <div className="foundation-actions">
                  <button
                    disabled={busy}
                    onClick={() => {
                      setEditing(m);
                      setContent(m.content);
                      setKind(m.kind);
                      setMemoryScope(m.scope);
                    }}
                  >
                    Correct memory
                  </button>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await mutate({
                          op: "memory.delete",
                          id: m.id,
                          revision: m.revision,
                        })
                      ) {
                        setMatches("");
                        if (editing?.id === m.id) {
                          setEditing(null);
                          setContent("");
                        }
                      }
                    }}
                  >
                    Delete memory
                  </button>
                </div>
              </article>
            ))}
          </section>
          <section className="nexus-card">
            <h3>Capabilities and learning</h3>
            <details>
              <summary>Registered capability contracts</summary>
              <pre>{JSON.stringify(data.capabilities || [], null, 2)}</pre>
            </details>
            <ul>
              <li>
                Local planning: installed; requires a ready local Ollama model.
              </li>
              <li>
                Development handoff: installed; authenticated Codex/Claude
                execution is not connected.
              </li>
              <li>Memory retrieval: local SQLite full-text search.</li>
              <li>
                Google Calendar and maintenance retain their separate
                Connections controls.
              </li>
              <li>No generated skill is automatically activated.</li>
            </ul>
            {data.skills.map((s) => (
              <p key={s.id}>Draft skill · {s.description}</p>
            ))}
          </section>
          <details className="nexus-card">
            <summary>Foundation activity</summary>
            {data.events.map((e) => (
              <p key={e.id}>
                <time>{e.at}</time> · {e.type} · {e.detail}
              </p>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
