"use client";
import { useCallback, useEffect, useRef, useState } from "react";
type Status = {
  state: "ready" | "disabled" | "not-configured" | "unavailable";
  label?: string;
  folder?: string;
};
export default function MemoryVaultStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async (disable = false) => {
    const current = ++generation.current;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/sync/foundation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: disable ? "memory.vault.disable" : "memory.vault.status",
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error || "Vault status is unavailable.");
      if (current !== generation.current) return;
      setStatus(data);
      if (disable)
        setMessage(
          "Future vault saves are disabled. Existing notes remain. A save already being dispatched may finish; check the vault if needed.",
        );
    } catch (error) {
      if (current === generation.current) {
        setStatus(null);
        setMessage((error as Error).message);
      }
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  return (
    <section aria-label="Obsidian vault save connection" className="nexus-card">
      <h4>Obsidian vault saves</h4>
      {status?.state === "ready" && (
        <p>
          <strong>Ready for reviewed saves</strong> · {status.label} /{" "}
          {status.folder}
        </p>
      )}
      {status?.state === "disabled" && (
        <p>
          <strong>Vault saves disabled</strong>. Run
          Setup-Nexus-Memory-Vault.cmd on the laptop to re-enable your
          configured vault.
        </p>
      )}
      {status?.state === "not-configured" && (
        <p>
          Not set up. Run Setup-Nexus-Memory-Vault.cmd on the laptop and select
          an Obsidian vault.
        </p>
      )}
      {status?.state === "unavailable" && (
        <p>
          Configured vault or settings unavailable. Check the selected folder on
          the laptop, then refresh status. This view does not repair or replace
          settings.
        </p>
      )}
      <p>
        Access: create new notes only, after review and confirmation. Existing
        notes are not overwritten. Automatic synchronization and new provider
        sharing are not enabled. Folder checks do not guarantee the next write
        will succeed.
      </p>
      <div className="foundation-actions">
        <button disabled={busy} onClick={() => void load()}>
          Refresh vault status
        </button>
        {status && ["ready", "unavailable"].includes(status.state) && (
          <button disabled={busy} onClick={() => void load(true)}>
            Disable future vault saves
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
