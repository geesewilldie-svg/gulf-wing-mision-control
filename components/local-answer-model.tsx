"use client";
import { useEffect, useRef, useState } from "react";
export default function LocalAnswerModel({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [models, setModels] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function inspect() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setModels([]);
    setMessage("");
    onChange("");
    try {
      const response = await fetch("/api/sync/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "local-model-catalog" }),
        signal: request.signal,
      });
      const data = await response.json();
      if (request.signal.aborted) return;
      if (!response.ok) throw Error(data.error || "Local catalog unavailable.");
      setModels(data.models.map((model: { name: string }) => model.name));
      setMessage(
        `${data.uniqueModels} unique models reported; ${data.omitted} outside this list. Installed is not proof of hardware fit or inference readiness.`,
      );
    } catch (error) {
      if (!request.signal.aborted) setMessage((error as Error).message);
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => void inspect()}
      >
        Load local answer models
      </button>
      <label>
        Local model for next typed answer
        <select
          value={value}
          disabled={disabled || busy}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Saved default</option>
          {models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </label>
      <p>
        One typed Local Ollama answer only. Task planning, voice sessions and
        the saved default keep their configured model. No model is downloaded;
        an unavailable choice fails without cloud fallback.
      </p>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
