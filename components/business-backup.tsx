"use client";
import { useState } from "react";
import { type BusinessState, validBusiness } from "@/lib/business";
export default function BusinessBackup({
  state,
  save,
  disabled,
}: {
  state: BusinessState;
  save: (state: BusinessState) => Promise<boolean>;
  disabled: boolean;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<ReturnType<
    typeof validBusiness
  > | null>(null);
  return (
    <details>
      <summary>Private business backup and restore</summary>
      <p>
        Export records, contacts, checklists, services and estimates before
        major edits. Store the file privately. It excludes pairing codes, voice
        models and the separate knowledge index. Restore replaces the current
        business records and proposed marketing allocation.
      </p>
      <button
        disabled={disabled}
        onClick={() => {
          const url = URL.createObjectURL(
            new Blob(
              [
                JSON.stringify(
                  {
                    format: "gulf-wing-business-v1",
                    exportedAt: new Date().toISOString(),
                    business: state,
                  },
                  null,
                  2,
                ),
              ],
              { type: "application/json" },
            ),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download =
            "gulf-wing-business-" +
            new Date().toISOString().slice(0, 10) +
            ".json";
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          setMessage(
            "Backup download requested. Check your browser downloads.",
          );
        }}
      >
        Export private business backup
      </button>
      <label>
        Restore business backup
        <input
          disabled={disabled}
          type="file"
          accept=".json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            setPending(null);
            if (!file) return;
            try {
              if (file.size > 1900000)
                throw Error("Use a backup below 1.9 MB.");
              const raw = JSON.parse(await file.text());
              if (raw.format !== "gulf-wing-business-v1")
                throw Error("Choose a Gulf Wing business backup.");
              setPending(validBusiness(raw.business));
              setMessage("");
            } catch (err) {
              setMessage((err as Error).message);
            }
          }}
        />
      </label>
      {pending && (
        <div role="alert">
          <p>
            Ready to restore {pending.records.length} records,{" "}
            {pending.quotes.length} estimates and {pending.services.length}{" "}
            services. This replaces the saved business data.
          </p>
          <button
            disabled={disabled}
            onClick={async () => {
              if (
                window.confirm(
                  "Replace current business records with this backup? Export a current backup first.",
                )
              ) {
                if (
                  await save({
                    ...pending,
                    revision: state.revision,
                    audit: state.audit,
                  })
                ) {
                  setPending(null);
                  setMessage("Business backup restored.");
                }
              }
            }}
          >
            Confirm business restore
          </button>
          <button onClick={() => setPending(null)}>Cancel restore</button>
        </div>
      )}
      <p role="status">{message}</p>
    </details>
  );
}
