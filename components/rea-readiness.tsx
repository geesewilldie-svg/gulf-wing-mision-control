"use client";
import { useEffect, useRef, useState } from "react";
import type { ReaReadiness as Status } from "@/lib/rea-readiness";
export default function ReaReadiness() {
  const [data, setData] = useState<Status | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [protocol, setProtocol] = useState<{
    serverVersion: string;
    tools: { name: string; schemaSha256: string }[];
    checkedAt: string;
    notice: string;
  } | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function inspect(testProtocol = false) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setData(null);
    setProtocol(null);
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/sync/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: testProtocol ? "rea-protocol-check" : "rea-preflight",
        }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(result.error || "REA prerequisite check unavailable.");
      if (testProtocol) setProtocol(result);
      else setData(result);
    } catch (failure) {
      if (!controller.signal.aborted) setError((failure as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <details>
      <summary>REA inspection prerequisites</summary>
      <p>
        Inspect Nexus's Node runtime and the fixed isolated tool metadata. This
        does not install or run REA.
      </p>
      <button disabled={busy} onClick={() => void inspect()}>
        Check REA prerequisites
      </button>
      <p>
        The protocol test starts a short-lived local REA process and reads its
        catalog. No browser is attached and no inspection tool is called.
      </p>
      <button disabled={busy} onClick={() => void inspect(true)}>
        Test REA protocol without browser
      </button>
      {busy && (
        <button
          onClick={() => {
            pending.current?.abort();
            setBusy(false);
            setError(
              "REA check cancelled; process cleanup may still be finishing.",
            );
          }}
        >
          Cancel REA check
        </button>
      )}
      {busy && <p role="status">Checking REA…</p>}
      {protocol && (
        <section aria-label="REA protocol results">
          <p>{protocol.notice}</p>
          <p>
            Protocol server version: {protocol.serverVersion}. Checked{" "}
            {protocol.checkedAt}.
          </p>
          <ul>
            {protocol.tools.map((tool) => (
              <li key={tool.name} style={{ overflowWrap: "anywhere" }}>
                {tool.name} · Schema SHA-256: {tool.schemaSha256}
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && <p role="status">{error}</p>}
      {data && (
        <section aria-label="REA prerequisite results">
          <p>
            Node {data.nodeVersion} ·{" "}
            {data.runtimeCompatible
              ? "Meets pinned runtime range"
              : "Does not meet pinned runtime range"}
          </p>
          <p>
            Expected {data.expected.package}@{data.expected.version} · Node
            range: {data.expected.engines}
          </p>
          <p>
            Isolated package:{" "}
            {data.packageState === "missing"
              ? "Not installed at the managed location"
              : data.packageState === "pinned-metadata"
                ? "Pinned metadata found; integrity/execution unverified"
                : data.packageState === "different-metadata"
                  ? "Different package metadata; not accepted"
                  : "Unavailable or unsafe metadata; not accepted"}
          </p>
          <p>{data.notice}</p>
          <p>Checked {data.checkedAt}. Adapter ready: no.</p>
        </section>
      )}
    </details>
  );
}
