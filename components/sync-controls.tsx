"use client";
import { useState } from "react";
import { Link2, Unplug } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
export default function SyncControls({
  displayOnly = false,
}: {
  displayOnly?: boolean;
}) {
  const { sync } = useWorkspace();
  const [code, setCode] = useState(""),
    [busy, setBusy] = useState(false);
  const pairingForm = (label: string) => (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await sync.pair(code, displayOnly ? "display" : "controller");
          setCode("");
        } catch {
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="pairing-code">Laptop pairing code</label>
      <div className="sync-pair-fields">
        <input
          id="pairing-code"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
          maxLength={100}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button type="submit" disabled={busy || !code.trim()}>
          {busy ? "Pairing…" : label}
        </button>
      </div>
    </form>
  );
  return (
    <details className="sync-controls">
      <summary>
        <Link2 size={15} /> Connect devices <span>{sync.status}</span>
      </summary>
      <section className="sync-content" aria-label="Device synchronization">
        <h2>Your laptop. Every screen.</h2>
        <p>
          Pair your Android phone, Windows laptop, and presentation screens to
          the same laptop-hosted workspace.
        </p>
        {sync.mode === "shared" ? (
          <>
            <p className="sync-connected">
              Connected ·{" "}
              {sync.role === "controller"
                ? "Controller access"
                : "Display-only access"}{" "}
              · {sync.status}
            </p>
            {sync.conflict && (
              <div
                className="sync-conflict"
                role="alert"
                aria-label="Sync conflict"
              >
                <strong>Another device saved a different version.</strong>
                <p>
                  Your edits are retained on this device. Choose which workspace
                  to use.
                </p>
                <button onClick={() => sync.resolveConflict(false)}>
                  Use laptop’s latest version
                </button>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "Replace the shared workspace with this device’s edits?",
                      )
                    )
                      sync.resolveConflict(true);
                  }}
                >
                  Keep this device’s edits
                </button>
              </div>
            )}
            {sync.needsPair && (
              <div className="sync-repair">
                <p>
                  Your pairing expired or was reset. Re-pair here to retain and
                  retry unsent edits.
                </p>
                {pairingForm("Re-pair this device")}
              </div>
            )}
            <div className="sync-actions">
              {sync.role === "controller" && (
                <button onClick={sync.publishLocal}>
                  Publish this browser’s local workspace
                </button>
              )}
              <button onClick={() => void sync.disconnect()}>
                <Unplug size={13} /> Disconnect this device
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              On your ASUS Windows laptop, run <code>npm run sync:setup</code>,
              then start Gulf Wing. Open the laptop’s private Wi-Fi address on
              each device. The setup command shows your private pairing code in
              that laptop’s terminal.
            </p>
            <button type="button" onClick={() => void sync.reconnect()}>
              Check laptop connection
            </button>
            {pairingForm(displayOnly ? "Pair display" : "Pair and join")}
            <p className="sync-note">
              Joining opens the laptop’s workspace; your browser-only workspace
              stays saved. Use your trusted private network. No Apple products,
              cloud service, or paid API is needed.
            </p>
          </>
        )}
        {sync.error && (
          <p
            className="storage-warning"
            role="alert"
            aria-label="Device synchronization error"
          >
            {sync.error}
          </p>
        )}
      </section>
    </details>
  );
}
