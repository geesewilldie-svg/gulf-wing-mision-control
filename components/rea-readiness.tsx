"use client";
import { useEffect, useRef, useState } from "react";
import type { ReaReadiness as Status } from "@/lib/rea-readiness";
export default function ReaReadiness() {
  const [data, setData] = useState<Status | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function inspect() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setData(null);
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/sync/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rea-preflight" }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(result.error || "REA prerequisite check unavailable.");
      setData(result);
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
      {busy && <p role="status">Reading prerequisite metadata…</p>}
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
