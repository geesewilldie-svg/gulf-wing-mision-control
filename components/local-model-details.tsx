"use client";
import LocalModelCheck from "./local-model-check";
import { useEffect, useRef, useState } from "react";
import {
  localDetailModel,
  type LocalModelDetails as Details,
} from "@/lib/local-model-details";
export default function LocalModelDetails({
  model,
}: {
  model: { name: string; digest: string | null };
}) {
  const [result, setResult] = useState<Details | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function inspect() {
    if (busy || !model.digest || !localDetailModel(model.name)) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/sync/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "local-model-details",
          model: model.name,
          digest: model.digest,
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw Error(data.error || "Model details unavailable.");
      if (data.model !== model.name || data.digest !== model.digest)
        throw Error(
          "The model identity changed. Inspect the local catalog again.",
        );
      setResult(data);
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section aria-label={`Installed model details ${model.name}`}>
      <div className="nexus-actions">
        <button
          disabled={busy || !model.digest || !localDetailModel(model.name)}
          onClick={() => void inspect()}
        >
          Inspect model details · {model.name}
        </button>
        {busy && (
          <button
            onClick={() => {
              pending.current?.abort();
              setBusy(false);
              setError("Model detail inspection cancelled.");
            }}
          >
            Cancel model detail inspection
          </button>
        )}
      </div>
      {(!model.digest || !localDetailModel(model.name)) && (
        <p>
          Details require a reported digest and a simple local model name. Cloud
          selectors and namespaced models are outside this inspection slice.
        </p>
      )}
      {busy && <p role="status">Reading runtime-reported metadata…</p>}
      {error && <p role="status">{error}</p>}
      {result && (
        <section
          className="nexus-hub-result"
          aria-label={`Runtime model result ${model.name}`}
        >
          <h4>Runtime-reported model details</h4>
          <p>{result.notice}</p>
          <dl className="nexus-source-metadata">
            {[
              ["Format", result.format],
              ["Family", result.family],
              ["Architecture", result.architecture],
              ["Parameter size", result.parameterSize],
              ["Parameter count", result.parameterCount],
              ["Quantization", result.quantization],
              ["Declared context length", result.contextLength],
              ["Embedding length", result.embeddingLength],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value ?? "Unknown"}</dd>
              </div>
            ))}
            <div>
              <dt>Reported capabilities</dt>
              <dd>
                {result.capabilities.length
                  ? result.capabilities.join(", ")
                  : result.capabilitiesKnown
                    ? "None reported"
                    : "Unknown"}
                {!result.capabilitiesKnown && result.capabilities.length
                  ? " (partial or unsupported coverage)"
                  : ""}
                {result.capabilitiesOmitted
                  ? ` · ${result.capabilitiesOmitted} omitted`
                  : ""}
              </dd>
            </div>
          </dl>
          <p>
            Checked {result.checkedAt}. Metadata alone does not test inference
            readiness or hardware fit.
          </p>
          {result.capabilitiesKnown &&
            result.capabilities.includes("completion") && (
              <LocalModelCheck model={result.model} digest={result.digest} />
            )}
        </section>
      )}
    </section>
  );
}
