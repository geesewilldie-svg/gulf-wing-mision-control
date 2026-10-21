"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { usePathname } from "next/navigation";
import { useLocalWorkspace } from "@/hooks/use-local-workspace";
import {
  createWorkspace,
  parseWorkspace,
  type Workspace,
} from "@/lib/workspace";

type Snapshot = { revision: number; workspace: Workspace };
type Role = "controller" | "display";
type Mode = "checking" | "local" | "shared";
const PENDING_KEY = "gulf-wing.pending-shared.v1";
function snapshot(value: unknown): Snapshot {
  const data = value as Snapshot;
  if (!data || !Number.isSafeInteger(data.revision) || data.revision < 0)
    throw new Error("The laptop sent an invalid revision.");
  return {
    revision: data.revision,
    workspace: parseWorkspace(JSON.stringify(data.workspace)),
  };
}
async function json(response: Response) {
  const value = await response.json();
  if (!response.ok && response.status !== 409)
    throw Object.assign(
      new Error(value.error || "The laptop is unavailable."),
      { status: response.status },
    );
  return value;
}
function useCoordinator() {
  const local = useLocalWorkspace({ readOnly: usePathname() === "/display" });
  const [mode, setMode] = useState<Mode>("checking");
  const [enabled, setEnabled] = useState(false);
  const [role, setRole] = useState<Role>("controller");
  const [shared, setShared] = useState(createWorkspace);
  const [status, setStatus] = useState("Checking connection");
  const [error, setError] = useState("");
  const [pendingCacheFailed, setPendingCacheFailed] = useState(false);
  const [conflict, setConflict] = useState<Snapshot | null>(null);
  const [needsPair, setNeedsPair] = useState(false);
  const sharedRef = useRef(shared),
    revision = useRef(0),
    dirty = useRef(false),
    sending = useRef(false),
    active = useRef(false),
    roleRef = useRef<Role>("controller"),
    conflictRef = useRef<Snapshot | null>(null);
  const cachePending = useCallback(() => {
    try {
      sessionStorage.setItem(
        PENDING_KEY,
        JSON.stringify({
          revision: revision.current,
          workspace: sharedRef.current,
        }),
      );
      setPendingCacheFailed(false);
    } catch {
      setPendingCacheFailed(true);
    }
  }, []);
  const clearPending = () => {
    setPendingCacheFailed(false);
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch {}
  };
  const adopt = useCallback((next: Snapshot) => {
    revision.current = next.revision;
    sharedRef.current = next.workspace;
    setShared(next.workspace);
  }, []);
  const flush = useCallback(async () => {
    if (
      !active.current ||
      !dirty.current ||
      sending.current ||
      conflictRef.current ||
      roleRef.current !== "controller"
    )
      return;
    sending.current = true;
    setStatus("Saving to laptop");
    try {
      while (active.current && dirty.current && !conflictRef.current) {
        const sent = sharedRef.current;
        const response = await fetch("/api/sync/workspace", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: revision.current, workspace: sent }),
        });
        const next = snapshot(await json(response));
        if (!active.current) break;
        if (response.status === 409) {
          conflictRef.current = next;
          setConflict(next);
          setStatus("Conflicting edits need a decision");
          break;
        }
        revision.current = next.revision;
        if (sharedRef.current === sent) {
          dirty.current = false;
          clearPending();
          setStatus("Synced with laptop");
          setError("");
        } else cachePending();
      }
    } catch (failure) {
      if ((failure as Error & { status?: number }).status === 401)
        setNeedsPair(true);
      setStatus("Offline — edits waiting on this device");
      setError((failure as Error).message);
    } finally {
      sending.current = false;
    }
  }, [cachePending]);
  const connect = useCallback(
    async (identity: { role: Role }) => {
      const retained = dirty.current
        ? { revision: revision.current, workspace: sharedRef.current }
        : null;
      const next = snapshot(
        await json(await fetch("/api/sync/workspace", { cache: "no-store" })),
      );
      setNeedsPair(false);
      roleRef.current = identity.role;
      setRole(identity.role);
      adopt(next);
      dirty.current = false;
      if (identity.role === "controller" && retained) {
        adopt(retained);
        dirty.current = true;
      } else if (identity.role === "controller") {
        try {
          const pending = sessionStorage.getItem(PENDING_KEY);
          if (pending) {
            adopt(snapshot(JSON.parse(pending)));
            dirty.current = true;
          }
        } catch {
          clearPending();
          setError(
            "Unsent edits could not be restored. The laptop’s saved version is displayed.",
          );
        }
      }
      active.current = true;
      setMode("shared");
      setStatus(
        dirty.current ? "Reconnecting unsent edits" : "Synced with laptop",
      );
      void flush();
    },
    [adopt, flush],
  );
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const result = await json(
          await fetch("/api/sync/session", { cache: "no-store" }),
        );
        if (!mounted) return;
        setEnabled(result.enabled);
        if (result.paired) await connect({ role: result.role });
        else {
          setMode("local");
          setStatus(
            result.enabled
              ? "Local only — ready to pair"
              : "Local only — host setup needed",
          );
        }
      } catch {
        if (mounted) {
          setMode("local");
          setStatus("Local only");
          setError(
            "The sync service could not be reached. Local workspace is still available.",
          );
        }
      }
    })();
    return () => {
      mounted = false;
      active.current = false;
    };
  }, [connect]);
  useEffect(() => {
    if (mode !== "shared") return;
    let running = false,
      stopped = false;
    const poll = async () => {
      if (running || sending.current || conflictRef.current) return;
      if (dirty.current) {
        void flush();
        return;
      }
      running = true;
      try {
        const next = snapshot(
          await json(await fetch("/api/sync/workspace", { cache: "no-store" })),
        );
        if (stopped || dirty.current || sending.current) return;
        if (next.revision !== revision.current) adopt(next);
        setStatus("Synced with laptop");
        setError("");
      } catch (failure) {
        if (!stopped) {
          if ((failure as Error & { status?: number }).status === 401)
            setNeedsPair(true);
          setStatus("Laptop connection interrupted");
          setError((failure as Error).message);
        }
      } finally {
        running = false;
      }
    };
    const interval = setInterval(() => void poll(), 1500);
    const online = () => void poll();
    window.addEventListener("online", online);
    window.addEventListener("focus", online);
    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener("online", online);
      window.removeEventListener("focus", online);
    };
  }, [mode, adopt, flush]);
  const setWorkspace = (update: SetStateAction<Workspace>) => {
    if (mode !== "shared") {
      local.setWorkspace(update);
      return;
    }
    if (roleRef.current !== "controller") {
      setError("This device is paired for display only.");
      return;
    }
    const next =
      typeof update === "function" ? update(sharedRef.current) : update;
    sharedRef.current = next;
    dirty.current = true;
    setShared(next);
    cachePending();
    void flush();
  };
  const pair = async (code: string, access: Role) => {
    setError("");
    setStatus("Pairing device");
    try {
      const identity = await json(
        await fetch("/api/sync/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, role: access }),
        }),
      );
      setEnabled(true);
      await connect(identity);
    } catch (failure) {
      setError((failure as Error).message);
      setStatus("Device not paired");
      throw failure;
    }
  };
  const disconnect = async () => {
    if (
      dirty.current &&
      !window.confirm(
        "Leave shared mode and discard this device’s unsent edits?",
      )
    )
      return;
    if (sending.current) {
      setError("Wait for the current save to finish before disconnecting.");
      return;
    }
    try {
      await json(await fetch("/api/sync/session", { method: "DELETE" }));
      active.current = false;
      dirty.current = false;
      conflictRef.current = null;
      setConflict(null);
      clearPending();
      setMode("local");
      setStatus("Local only");
      setError("");
    } catch (failure) {
      setError((failure as Error).message);
    }
  };
  const resolveConflict = (keepDevice: boolean) => {
    const latest = conflictRef.current;
    if (!latest) return;
    if (keepDevice) {
      revision.current = latest.revision;
      cachePending();
    } else {
      dirty.current = false;
      clearPending();
      adopt(latest);
      setStatus("Synced with laptop");
      setError("");
    }
    conflictRef.current = null;
    setConflict(null);
    if (keepDevice) void flush();
  };
  const reconnect = async () => {
    setStatus("Checking laptop connection");
    try {
      const identity = await json(
        await fetch("/api/sync/session", { cache: "no-store" }),
      );
      setEnabled(identity.enabled);
      if (identity.paired) await connect({ role: identity.role });
      else {
        setStatus(
          identity.enabled
            ? "Local only — ready to pair"
            : "Local only — host setup needed",
        );
        setError("");
      }
    } catch (failure) {
      setStatus("Local only");
      setError((failure as Error).message);
    }
  };
  const publishLocal = () => {
    if (
      mode === "shared" &&
      role === "controller" &&
      window.confirm(
        "Replace the laptop’s shared workspace with this browser’s local workspace? Other paired devices will receive this change.",
      )
    )
      setWorkspace(local.workspace);
  };
  return {
    workspace: mode === "shared" ? shared : local.workspace,
    setWorkspace,
    ready: local.ready && mode !== "checking",
    resetWorkspace: () =>
      mode === "shared"
        ? setWorkspace(createWorkspace())
        : local.resetWorkspace(),
    storageMessage: mode === "shared" ? "" : local.storageMessage,
    sync: {
      mode,
      enabled,
      role,
      status,
      error: [
        pendingCacheFailed
          ? "This browser cannot retain unsent edits after reload. Keep this tab open until it reconnects."
          : "",
        error,
      ]
        .filter(Boolean)
        .join(" "),
      conflict: !!conflict,
      pair,
      disconnect,
      resolveConflict,
      publishLocal,
      reconnect,
      hasPending: dirty.current,
      needsPair,
    },
  };
}
type Coordinator = ReturnType<typeof useCoordinator>;
const Context = createContext<Coordinator | null>(null);
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const value = useCoordinator();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorkspaceContext() {
  const value = useContext(Context);
  if (!value) throw new Error("WorkspaceProvider missing");
  return value;
}
