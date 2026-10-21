"use client";
import { useEffect, useState } from "react";
import { createWorkspace, parseWorkspace, STORAGE_KEY } from "@/lib/workspace";

export function useWorkspace() {
  const [workspace, setWorkspace] = useState(createWorkspace);
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState("");
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        try {
          setWorkspace(parseWorkspace(raw));
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
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }, [workspace, ready]);
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
