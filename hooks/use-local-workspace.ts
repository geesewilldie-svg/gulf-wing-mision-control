"use client";
import { useEffect, useRef, useState } from "react";
import { createWorkspace, parseWorkspace, STORAGE_KEY } from "@/lib/workspace";

export function useLocalWorkspace({
  readOnly = false,
}: { readOnly?: boolean } = {}) {
  const [workspace, setWorkspace] = useState(createWorkspace);
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState("");
  const [saveError, setSaveError] = useState(false);
  const lastSaved = useRef<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        try {
          setWorkspace(parseWorkspace(raw));
          lastSaved.current = raw;
        } catch {
          setWarning(
            "Saved demo data was invalid or from an unsupported version. Demo defaults have been restored.",
          );
        }
      }
    } catch {
      setWarning(
        "Browser storage is unavailable. Changes will only last until you refresh.",
      );
    }
    const receive = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      try {
        const next =
          event.newValue === null
            ? createWorkspace()
            : parseWorkspace(event.newValue);
        lastSaved.current = JSON.stringify(next);
        setWorkspace(next);
        setWarning("");
      } catch {
        setWarning(
          "A shared workspace update could not be read. The last valid view is still displayed.",
        );
      }
    };
    window.addEventListener("storage", receive);
    setReady(true);
    return () => window.removeEventListener("storage", receive);
  }, []);
  useEffect(() => {
    if (!ready || readOnly) return;
    const serialized = JSON.stringify(workspace);
    if (serialized === lastSaved.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      lastSaved.current = serialized;
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }, [workspace, ready, readOnly]);
  const resetWorkspace = () => {
    setWorkspace(createWorkspace());
    setWarning("");
  };
  return {
    workspace,
    setWorkspace,
    ready,
    resetWorkspace,
    storageMessage: saveError
      ? "Could not save in this browser. Changes will only last until you refresh."
      : warning,
  };
}
