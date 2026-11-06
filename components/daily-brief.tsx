"use client";
import { useEffect, useState } from "react";
import { composeBrief, type BriefSettings } from "@/lib/daily-brief";

export default function DailyBrief({ disabled }: { disabled: boolean }) {
  const [settings, setSettings] = useState<BriefSettings | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (disabled) return;
    const abort = new AbortController();
    fetch("/api/sync/brief", { signal: abort.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setSettings(d);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setMessage(e.message);
      });
    return () => abort.abort();
  }, [disabled]);
  async function save() {
    if (!settings) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/sync/brief", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setSettings(d);
      setMessage("Saved on your laptop. Scheduled email is not enabled.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="glass-panel" aria-label="Daily brief and real tasks">
      <h2>Daily brief · real tasks</h2>
      <p>
        Target: weekdays at 5 a.m., with a Monday–Sunday view on Mondays. Google
        Calendar, email delivery and automatic scheduling are not connected yet.
      </p>
      <p>
        Real tasks are stored privately on the laptop and shared with trusted
        controllers. Sample DEMO missions are excluded. These are not separate
        employee accounts.
      </p>
      {disabled ? (
        <p>Connect with controller access to manage private tasks.</p>
      ) : settings ? (
        <fieldset disabled={busy}>
          <legend>Brief preferences and tasks</legend>
          <label>
            Company{" "}
            <input
              value={settings.company}
              maxLength={100}
              onChange={(e) =>
                setSettings({ ...settings, company: e.target.value })
              }
            />
          </label>
          <label>
            Timezone{" "}
            <input
              value={settings.timezone}
              onChange={(e) =>
                setSettings({ ...settings, timezone: e.target.value })
              }
            />
          </label>
          <label>
            Deep work starts{" "}
            <input
              type="time"
              value={settings.deepStart}
              onChange={(e) =>
                setSettings({ ...settings, deepStart: e.target.value })
              }
            />
          </label>
          <label>
            Deep work ends{" "}
            <input
              type="time"
              value={settings.deepEnd}
              onChange={(e) =>
                setSettings({ ...settings, deepEnd: e.target.value })
              }
            />
          </label>
          <p>
            Co-hosting deep work: scoped owner proposals and job
            profitability/capacity reviews. Routine inbox handling, receipts and
            nonurgent scheduling are admin. Calendar changes will be proposals.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim() || settings.tasks.length >= 100) return;
              setSettings({
                ...settings,
                tasks: [
                  ...settings.tasks,
                  {
                    id: crypto.randomUUID(),
                    title: title.trim(),
                    due: "",
                    priority: "Normal",
                    done: false,
                  },
                ],
              });
              setTitle("");
              setPreview("");
            }}
          >
            <label>
              New real task{" "}
              <input
                required
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <button type="submit">Add task</button>
          </form>
          {settings.tasks.map((t) => (
            <div key={t.id}>
              <label>
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      tasks: settings.tasks.map((x) =>
                        x.id === t.id ? { ...x, done: e.target.checked } : x,
                      ),
                    })
                  }
                />
                {t.title}
              </label>
              <label>
                Due for {t.title}
                <input
                  type="date"
                  value={t.due}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      tasks: settings.tasks.map((x) =>
                        x.id === t.id ? { ...x, due: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Priority for {t.title}
                <select
                  value={t.priority}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      tasks: settings.tasks.map((x) =>
                        x.id === t.id
                          ? {
                              ...x,
                              priority: e.target.value as "Normal" | "High",
                            }
                          : x,
                      ),
                    })
                  }
                >
                  <option>Normal</option>
                  <option>High</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() =>
                  setSettings({
                    ...settings,
                    tasks: settings.tasks.filter((x) => x.id !== t.id),
                  })
                }
              >
                Remove {t.title}
              </button>
            </div>
          ))}
          <button type="button" onClick={save}>
            Save tasks and preferences
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                setPreview(
                  composeBrief(
                    settings,
                    [],
                    new Date(),
                    [],
                    [
                      "Google Calendar is not connected. This manual preview uses only the tasks shown here; save changes to keep them.",
                    ],
                  ).text,
                );
              } catch {
                setMessage("Check your timezone and deep-work times.");
              }
            }}
          >
            Preview task brief
          </button>
        </fieldset>
      ) : (
        <p>Loading private tasks…</p>
      )}
      <p role="status">{message}</p>
      {preview && (
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {preview}
        </pre>
      )}
    </section>
  );
}
