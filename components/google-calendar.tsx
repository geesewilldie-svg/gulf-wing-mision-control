"use client";
import { useEffect, useState } from "react";
type Status = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  scope: string;
  redirect: string;
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
          ? "Google Calendar connected. Your next morning snapshot can use calendar events."
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
  async function action(disconnect = false) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/sync/google", {
        method: disconnect ? "DELETE" : "POST",
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (disconnect) {
        await load();
        setMessage(
          "Disconnected locally. Remove Nexus access in your Google account too if you want to revoke the grant.",
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
            Starts with your primary calendar. Connect on the laptop using
            http://localhost:3000/nexus. Access is shared with trusted paired
            controllers, not isolated customer accounts.
          </p>
          <button
            disabled={busy || !status?.configured}
            onClick={() => action()}
          >
            {status?.connected
              ? "Reconnect Google Calendar"
              : "Connect Google Calendar"}
          </button>
          <button
            disabled={busy || !status?.connected}
            onClick={() => action(true)}
          >
            Disconnect Google Calendar
          </button>
          <button disabled={busy || !status?.connected} onClick={check}>
            Check calendar access
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
