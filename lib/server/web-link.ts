import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { reviewedWebLink } from "../web-link";
import { SyncError } from "./sync-store";
import {
  claimLaptopOperation,
  finishLaptopOperation,
} from "./laptop-operations";
const root = () =>
  path.resolve(
    process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
  );
export async function linkOpeningEnabled() {
  try {
    const config = JSON.parse(
      await fs.readFile(path.join(root(), "link-opening.json"), "utf8"),
    );
    if (config.version !== 1 || typeof config.enabled !== "boolean")
      throw Error();
    return config.enabled as boolean;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new SyncError(
      503,
      "Link-opening settings cannot be read. No browser request was started.",
    );
  }
}
export async function webLinkProposal(value: unknown, requestId: unknown) {
  const key = requestId === undefined ? randomUUID() : requestId;
  if (typeof key !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(key))
    throw new SyncError(400, "Invalid link request reference.");
  let link;
  try {
    link = reviewedWebLink(value);
  } catch (error) {
    throw new SyncError(400, (error as Error).message);
  }
  const supported = process.platform === "win32",
    enabled = await linkOpeningEnabled();
  return {
    engine: "Nexus link review",
    answer:
      "Review this link before opening it on your laptop. Your normal browser may use its existing signed-in profile. Nexus will not read or click the page.",
    sources: [],
    warnings: [],
    linkPreview: {
      ...link,
      requestId: key,
      supported,
      enabled,
    },
    routing: {
      mode: "local",
      selected: [],
      reason:
        "Preview only. No browser, model or external request was started.",
    },
  };
}
export function webLinkLaunchPlan(
  value: string,
  windowsRoot = process.env.SystemRoot || "C:\\Windows",
) {
  const link = reviewedWebLink(value);
  if (!path.win32.isAbsolute(windowsRoot))
    throw new SyncError(503, "The Windows directory could not be resolved.");
  return {
    command: path.win32.join(windowsRoot, "explorer.exe"),
    args: [link.url],
  };
}
export function handLinkToWindows(url: string): Promise<void> {
  const plan = webLinkLaunchPlan(url);
  return new Promise((resolve, reject) => {
    const child = spawn(plan.command, plan.args, {
      shell: false,
      detached: true,
      windowsHide: true,
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
export async function openReviewedWebLink(
  input: unknown,
  signal?: AbortSignal,
  dispatch: (url: string) => Promise<void> = handLinkToWindows,
) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new SyncError(400, "Review a link first.");
  const data = input as Record<string, unknown>;
  if (
    Object.keys(data).sort().join(",") !== "confirmed,requestId,url" ||
    data.confirmed !== true ||
    typeof data.requestId !== "string"
  )
    throw new SyncError(
      400,
      "Opening a link requires its reviewed address, request reference and explicit confirmation.",
    );
  let link;
  try {
    link = reviewedWebLink(data.url);
  } catch (error) {
    throw new SyncError(400, (error as Error).message);
  }
  signal?.throwIfAborted();
  if (process.platform !== "win32")
    throw new SyncError(409, "Link opening must run on the Windows laptop.");
  if (!(await linkOpeningEnabled()))
    throw new SyncError(
      403,
      "Enable link opening locally on the laptop first.",
    );
  const hash = createHash("sha256").update(link.url).digest("hex");
  const claimed = claimLaptopOperation(
    "open-web-link",
    data.requestId,
    10000,
    hash,
  );
  if (!claimed.execute) return claimed.receipt;
  let dispatched = false;
  try {
    if (!(await linkOpeningEnabled()))
      throw new SyncError(403, "Link opening was disabled before dispatch.");
    signal?.throwIfAborted();
    dispatched = true;
    await dispatch(link.url);
    return finishLaptopOperation(
      claimed.receipt.id,
      "complete",
      "The open request was handed to Windows. Page display, load and account state have not been verified.",
    );
  } catch (error) {
    try {
      finishLaptopOperation(
        claimed.receipt.id,
        dispatched ? "unknown" : "not-started",
        dispatched
          ? "The browser handoff could not be confirmed. Inspect the laptop before making a new request."
          : "No browser request was started; permission or cancellation changed.",
      );
    } catch {}
    throw error;
  }
}
