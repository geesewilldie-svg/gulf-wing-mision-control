"use client";
import { useState } from "react";
import { type BusinessState, type Service, businessId } from "@/lib/business";
export default function ServiceCatalog({
  state,
  save,
  disabled,
}: {
  state: BusinessState;
  save: (state: BusinessState) => Promise<boolean>;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState<Service>({
    id: "",
    name: "",
    description: "",
    active: true,
  });
  const [baseline, setBaseline] = useState("");
  const [message, setMessage] = useState("");
  const editing = Boolean(draft.id);
  return (
    <details className="business-services">
      <summary>
        Service catalog · {state.services.filter((s) => s.active).length} active
      </summary>
      <p>
        Starter service descriptions are templates for review. They are not
        approved prices or customer commitments. Deactivate a service to retain
        its history.
      </p>
      <ul className="nexus-records">
        {state.services.map((s) => (
          <li key={s.id}>
            <strong>
              {s.name} · {s.active ? "Active" : "Inactive"}
            </strong>
            <p>{s.description}</p>
            <div className="nexus-buttons">
              <button
                disabled={disabled}
                onClick={() => {
                  setDraft({ ...s });
                  setBaseline(JSON.stringify(s));
                  setMessage("");
                }}
              >
                Edit service · {s.name}
              </button>
              <button
                disabled={disabled}
                onClick={() =>
                  void save({
                    ...state,
                    services: state.services.map((item) =>
                      item.id === s.id
                        ? { ...item, active: !item.active }
                        : item,
                    ),
                  })
                }
              >
                {s.active ? "Deactivate" : "Activate"} · {s.name}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            editing &&
            JSON.stringify(state.services.find((s) => s.id === draft.id)) !==
              baseline
          ) {
            setMessage(
              "This service changed. Cancel and reopen the latest version.",
            );
            return;
          }
          const next = { ...draft, id: draft.id || businessId() };
          if (
            await save({
              ...state,
              services: editing
                ? state.services.map((s) => (s.id === draft.id ? next : s))
                : [...state.services, next],
            })
          )
            setDraft({ id: "", name: "", description: "", active: true });
        }}
      >
        <fieldset disabled={disabled}>
          <label>
            Service name
            <input
              required
              maxLength={160}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Service scope
            <textarea
              maxLength={2000}
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </label>
          <div className="nexus-buttons">
            <button>{editing ? "Save service changes" : "Add service"}</button>
            {editing && (
              <button
                type="button"
                onClick={() =>
                  setDraft({ id: "", name: "", description: "", active: true })
                }
              >
                Cancel service edit
              </button>
            )}
          </div>
        </fieldset>
      </form>
      <p role="status">{message}</p>
    </details>
  );
}
