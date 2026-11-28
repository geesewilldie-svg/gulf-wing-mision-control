"use client";
import LocalModelDetails from "./local-model-details";
import { useEffect, useRef, useState } from "react";
import type { LocalModelCatalog as Catalog } from "@/lib/local-model-catalog";
export default function LocalModelCatalog({
  initialResult,
}: { initialResult?: Catalog } = {}) {
  const [data, setData] = useState<Catalog | null>(initialResult || null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function inspect() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setData(null);
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/sync/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "local-model-catalog" }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw Error(result.error || "Local model catalog unavailable.");
      setData(result);
    } catch (failure) {
      if (!controller.signal.aborted) setError((failure as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <details
      className="nexus-local-model-catalog"
      open={initialResult ? true : undefined}
    >
      <summary>Installed local models</summary>
      <p>
        Inspect Ollama's local model list. This does not run a model or change
        your selection.
      </p>
      <div className="nexus-actions">
        <button disabled={busy} onClick={() => void inspect()}>
          Inspect installed local models
        </button>
      </div>
      {busy && <p role="status">Reading local catalog…</p>}
      {error && <p role="status">{error}</p>}
      {data && (
        <section aria-label="Local model catalog results">
          <p>{data.notice}</p>
          <p>
            Configured: {data.configuredModel || "Not recorded"} ·{" "}
            {data.configuredListed === null
              ? "Selection unknown"
              : data.configuredListed
                ? "Listed by Ollama"
                : "Not in current Ollama list"}
          </p>
          <p>
            {data.uniqueModels} unique reported models · {data.omitted} omitted
            from display · {data.rejectedEntries} invalid entries withheld ·
            Checked {data.checkedAt}
          </p>
          {!data.models.length && <p>No valid local models reported.</p>}
          <ul>
            {data.models.map((model) => (
              <li className="nexus-card" key={model.name + model.digest}>
                <strong>{model.name}</strong> ·{" "}
                {model.bytes === null ? "Size unknown" : `${model.bytes} bytes`}
                <p style={{ overflowWrap: "anywhere" }}>
                  Reported digest: {model.digest || "Not supplied"} · Modified:{" "}
                  {model.modifiedAt || "Not supplied"}
                </p>
                <LocalModelDetails model={model} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </details>
  );
}
