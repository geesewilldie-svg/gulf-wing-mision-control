"use client";
import { useEffect, useState } from "react";
type Status = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  scope: string;
  redirect: string;
  accounts: { id: string; email: string; calendar: boolean; drive: boolean }[];
};
export default function GoogleCalendar({ disabled }: { disabled: boolean }) {
  const [status, setStatus] = useState<Status | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load(signal?: AbortSignal) {
    const r = await fetch("/api/sync/google", { signal });
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setStatus(d);
  }
  useEffect(() => {
    if (disabled) {
      setStatus(null);
      return;
    }
    const abort = new AbortController();
    load(abort.signal).catch((e) => {
      if (e.name !== "AbortError") setMessage(e.message);
    });
    const result = new URLSearchParams(window.location.search).get("google");
    if (result)
      setMessage(
        result === "connected"
          ? "Google account connected. Refresh connection status; calendar grants can feed the morning snapshot."
          : "Google connection failed or was cancelled. Check OAuth setup, then try again.",
      );
    return () => abort.abort();
  }, [disabled]);
  async function check() {
    setBusy(true);
    try {
      const r = await fetch("/api/sync/google/events");
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setMessage(
        `Read ${d.events.length} calendar items over the next seven days. ${d.warnings.join(" ")}`,
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(
    disconnect = false,
    accountId?: string,
    features: "calendar" | "drive" | "both" = "calendar",
  ) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/sync/google", {
        method: disconnect ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features, ...(accountId ? { accountId } : {}) }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (disconnect) {
        await load();
        setMessage(
          "Disconnected locally. Other accounts stay connected when you disconnect one account. Drive snapshots were cleared; refresh remaining selected files. Remove Nexus access in Google too to revoke the grant.",
        );
      } else window.location.assign(d.url);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="nexus-card" aria-label="Google Calendar connection">
      <h3>Google Calendar</h3>
      <p>
        Read-only calendar access for morning meetings, attendees, preparation
        notes and conflict checks. Email delivery and calendar changes are not
        enabled.
      </p>
      {disabled ? (
        <p>Pair this browser as a Controller to connect Google.</p>
      ) : (
        <>
          <p>
            {status?.connected
              ? "Connected account: " + status.email
              : status?.configured
                ? "Ready for Google sign-in."
                : status
                  ? "One-time Google OAuth setup required on the laptop. Run Setup-Google-Calendar.cmd after creating and downloading your Google web-client JSON."
                  : "Checking Google connection…"}
          </p>
          <p>
            Reads the selected calendar IDs (primary by default) from each
            connected Calendar account. Shared invitations are counted once.
            Connect on the laptop using http://localhost:3000/nexus. Access is
            shared with trusted paired controllers, not isolated customer
            accounts.
          </p>
          <button
            disabled={busy || !status?.configured}
            onClick={() => action()}
          >
            {status?.connected
              ? "Add another Google Calendar"
              : "Connect Google Calendar"}
          </button>
          <button
            disabled={busy || !status?.accounts.length}
            onClick={() => {
              if (
                window.confirm(
                  "Disconnect all Google accounts locally and clear Drive snapshots?",
                )
              )
                void action(true);
            }}
          >
            Disconnect all Google accounts
          </button>
          <button disabled={busy || !status?.connected} onClick={check}>
            Check calendar access
          </button>
          <ul>
            {status?.accounts.map((account) => (
              <li key={account.id}>
                <strong>{account.email}</strong> · Calendar{" "}
                {account.calendar ? "connected" : "not granted"} · Drive{" "}
                {account.drive ? "connected" : "not granted"}
                <button
                  disabled={busy}
                  onClick={() => action(false, account.id, "calendar")}
                >
                  Reconnect Calendar · {account.email}
                </button>
                <button
                  disabled={busy}
                  onClick={() => action(false, account.id, "drive")}
                >
                  {account.drive ? "Reconnect" : "Add"} Drive access ·{" "}
                  {account.email}
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Disconnect " +
                          account.email +
                          " locally? Other accounts remain; all Drive snapshots will need refreshing.",
                      )
                    )
                      void action(true, account.id);
                  }}
                >
                  Disconnect account · {account.email}
                </button>
              </li>
            ))}
          </ul>
          <p>
            Drive read-only permission allows seeing and downloading all files
            in the chosen account; Nexus indexes only files you select below. Up
            to four Google accounts. No Gmail inbox access is granted.
          </p>
          <button
            disabled={busy || !status?.configured}
            onClick={() => action(false, undefined, "both")}
          >
            Connect Calendar and Drive account
          </button>
          <button
            disabled={busy}
            onClick={() => load().catch((e) => setMessage(e.message))}
          >
            Refresh Google status
          </button>
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
