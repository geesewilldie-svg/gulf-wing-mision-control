"use client";
import { useWorkspaceContext } from "@/components/workspace-provider";
// Presentations use their own visual selection state and never mutate this workspace.
export function useWorkspace(_options: { readOnly?: boolean } = {}) {
  return useWorkspaceContext();
}
