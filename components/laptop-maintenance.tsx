"use client";
import { useEffect, useState } from "react";
export default function LaptopMaintenance({ disabled }: { disabled: boolean }) {
  const [status, setStatus] = useState<{
    enabled: boolean;
    supported: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (disabled) return;
    const abort = new AbortController();
    fetch("/api/sync/maintenance", { signal: abort.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setStatus(d);
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setMessage("Maintenance status unavailable.");
      });
    return () => abort.abort();
  }, [disabled]);
  async function run(action: string) {
    setBusy(true);
    setMessage("Running on the laptop…");
    try {
      const r = await fetch("/api/sync/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setMessage(d.message);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="nexus-card" aria-label="Laptop maintenance">
      <h3>Laptop maintenance</h3>
      <p>
        Run approved local service operations without copying PowerShell
        commands. Paired controllers share this access; external contractor
        accounts are not supported.
      </p>
      <p>
        {status?.enabled
          ? "Locally enabled."
          : "Not enabled. On the Windows laptop, run Enable-Nexus-Maintenance.cmd once."}{" "}
        {status && !status.supported ? "This host is not Windows." : ""}
      </p>
      <button
        disabled={disabled || busy || !status?.enabled || !status.supported}
        onClick={() => run("check-connections")}
      >
        Check laptop services
      </button>
      <button
        disabled={disabled || busy || !status?.enabled || !status.supported}
        onClick={() => run("start-services")}
      >
        Start missing Nexus services
      </button>
      <p role="status">{message}</p>
      <p>
        This starts existing services only. No software installation, updates,
        process termination, administrator commands or unrestricted PowerShell
        access.
      </p>
    </section>
  );
}
