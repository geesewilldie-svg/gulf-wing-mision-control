export type TaskIntent =
  | { kind: "create"; request: string }
  | { kind: "list" }
  | {
      kind: "control";
      action: "pause" | "resume" | "cancel" | "steer" | "status";
      target: string;
      request?: string;
    };
export function taskIntent(query: string): TaskIntent | null {
  const text = query
    .trim()
    .replace(/^(?:hey\s+)?nexus[, ]+/i, "")
    .replace(/^please\s+/i, "");
  if (
    /^(?:show|list)(?: me)? my tasks[.!?]*$/i.test(text) ||
    /^what are my tasks[?!.]*$/i.test(text)
  )
    return { kind: "list" };
  const match =
    /^(?:create|add|save) (?:a )?task(?:\s+to\s+|\s*:\s*|\s+)([\s\S]+)$/i.exec(
      text,
    );
  if (match) return { kind: "create", request: match[1].trim() };
  const command = text.replace(/[.!?]+$/, "").trim();
  const change =
    /^(?:change|update) (?:task (.+?)|(it|that task|this task)) to ([\s\S]+)$/i.exec(
      command,
    );
  if (change)
    return {
      kind: "control",
      action: "steer",
      target: change[1] || "last",
      request: change[3].trim(),
    };
  const action =
    /^(pause|resume|cancel) (?:task (.+)|(it|that task|this task)|(.+?) task)$/i.exec(
      command,
    );
  if (action)
    return {
      kind: "control",
      action: action[1].toLowerCase() as "pause" | "resume" | "cancel",
      target: action[2] || action[4] || "last",
    };
  const status =
    /^(?:show (?:the )?status of|what(?:'s| is) the status of|status of|show) (?:task (.+)|(it|that task|this task)|(.+?) task)$/i.exec(
      command,
    );
  if (status)
    return {
      kind: "control",
      action: "status",
      target: status[1] || status[3] || "last",
    };
  return null;
}
