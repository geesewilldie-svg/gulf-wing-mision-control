import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { createHash } from "node:crypto";
import { reaTarget, reaRuntimeCompatible } from "../rea-readiness";
import { inspectReaReadiness } from "./rea-readiness";
import { SyncError } from "./sync-store";
import hashes from "../../scripts/rea-runtime/protocol-hashes.json";
import lock from "../../scripts/rea-runtime/package-lock.json";
const permitted = [
  "list_browser_targets",
  "inspect_web_page",
  "capture_web_screenshot",
  "analyze_web_bundle",
  "observe_web_session",
  "compare_web_captures",
];
export type OwnedReaInspection = {
  endpoint: string;
  targetId: string;
  url: string;
  origin: string;
  title: string;
};
export function ownedInspectionArguments(inspection: OwnedReaInspection) {
  return {
    cdp_endpoint: inspection.endpoint,
    target_id: inspection.targetId,
    allowed_origins: [inspection.origin],
    discovery_timeout_ms: 2000,
    command_timeout_ms: 3000,
    observation_ms: 100,
    include_accessibility_text: true,
    include_console_text: false,
    include_json_body_shapes: false,
    include_websocket_shapes: false,
    include_storage_keys: false,
    include_storage_fingerprints: false,
    include_script_sources: false,
  };
}
export function ownedInspectionEvidence(
  result: any,
  expected: OwnedReaInspection,
) {
  const data = result?.structuredContent;
  const target = data?.normalized_result?.target;
  const parameters = data?.parameters;
  const expectedParameters = ownedInspectionArguments(expected);
  if (
    result?.isError ||
    Object.entries(expectedParameters).some(
      ([key, value]) =>
        JSON.stringify(parameters?.[key]) !== JSON.stringify(value),
    ) ||
    data?.predicate_type !== "rea.web-page-inspection" ||
    data?.operation !== "inspect_web_page" ||
    data?.provider?.id !== "rea-cdp-browser" ||
    target?.target_id !== expected.targetId ||
    target?.url !== expected.url ||
    target?.origin !== expected.origin ||
    target?.title !== expected.title ||
    data?.subject?.identity?.url !== expected.url ||
    !/^ev_[a-f0-9]{64}$/.test(data?.evidence_id || "")
  )
    throw Error("Owned fixture evidence does not match");
  return {
    evidenceId: data.evidence_id as string,
    evidenceSha256: createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex"),
    completeness: String(
      data.normalized_result?.completeness?.status || "unknown",
    ).slice(0, 80),
  };
}
export function reaCatalogExchange(
  child: ChildProcessWithoutNullStreams,
  signal: AbortSignal,
  inspection?: OwnedReaInspection,
) {
  return new Promise<{
    serverVersion: string;
    tools: { name: string; schemaSha256: string }[];
    inspection?: ReturnType<typeof ownedInspectionEvidence>;
  }>((resolve, reject) => {
    const decoder = new StringDecoder("utf8");
    let failure: string | null = null;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    let buffer = "",
      bytes = 0,
      stderr = 0,
      stage = 0,
      result: {
        serverVersion: string;
        tools: { name: string; schemaSha256: string }[];
        inspection?: ReturnType<typeof ownedInspectionEvidence>;
      } | null = null,
      ended = false;
    const fail = (message: string) => {
      if (ended || failure) return;
      failure = message;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      child.stdin.destroy();
      child.kill();
      killTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
      cleanupTimer = setTimeout(() => {
        ended = true;
        clearTimeout(killTimer);
        reject(
          new SyncError(
            503,
            message +
              " Process cleanup could not be confirmed; no readiness was recorded.",
          ),
        );
      }, 5000);
    };
    const abort = () =>
      fail("REA protocol check cancelled. No browser tool was called.");
    const timer = setTimeout(
      () =>
        fail(
          "REA protocol check timed out; shutdown of its owned process was requested.",
        ),
      20000,
    );
    const send = (message: unknown) =>
      child.stdin.write(JSON.stringify(message) + "\n");
    signal.addEventListener("abort", abort, { once: true });
    child.on("error", () =>
      fail("REA process could not start. No browser tool was called."),
    );
    child.stdin.on("error", () =>
      fail("REA protocol input closed unexpectedly."),
    );
    child.stdout.on("error", () =>
      fail("REA protocol output closed unexpectedly."),
    );
    child.stderr.on("data", (chunk: Buffer) => {
      if (ended || failure) return;
      stderr += chunk.length;
      if (stderr > 64000) fail("REA diagnostic output exceeded its limit.");
    });
    child.stdout.on("data", (chunk: Buffer) => {
      if (ended || failure) return;
      bytes += chunk.length;
      if (bytes > 1500000) {
        fail("REA catalog exceeded its byte limit.");
        return;
      }
      buffer += decoder.write(chunk);
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0 && !ended && !failure) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          if (message.jsonrpc !== "2.0" || message.error || message.method)
            throw Error();
          if (stage === 0 && message.id === 1) {
            if (
              message.result?.serverInfo?.name !== "rea" ||
              message.result?.serverInfo?.version !== reaTarget.version ||
              message.result?.protocolVersion !== "2025-06-18"
            )
              throw Error();
            stage = 1;
            send({ jsonrpc: "2.0", method: "notifications/initialized" });
            send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
          } else if (stage === 1 && message.id === 2) {
            const tools = message.result?.tools;
            if (
              !Array.isArray(tools) ||
              tools.length > 100 ||
              message.result.nextCursor
            )
              throw Error();
            const found = permitted.map((name) => {
              const matches = tools.filter((tool: any) => tool.name === name);
              if (
                matches.length !== 1 ||
                matches[0].inputSchema?.type !== "object"
              )
                throw Error();
              return {
                name,
                schemaSha256: createHash("sha256")
                  .update(JSON.stringify(matches[0].inputSchema))
                  .digest("hex"),
              };
            });
            result = { serverVersion: reaTarget.version, tools: found };
            stage = 2;
            if (inspection) {
              send({
                jsonrpc: "2.0",
                id: 3,
                method: "tools/call",
                params: {
                  name: "inspect_web_page",
                  arguments: ownedInspectionArguments(inspection),
                },
              });
            } else {
              stage = 3;
              child.stdin.end();
            }
          } else if (stage === 2 && inspection && message.id === 3 && result) {
            result.inspection = ownedInspectionEvidence(
              message.result,
              inspection,
            );
            stage = 3;
            child.stdin.end();
          } else throw Error();
        } catch {
          fail(
            "REA returned an unsupported protocol/catalog response. No browser tool was called.",
          );
        }
      }
    });
    child.on("close", (code, exitSignal) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      clearTimeout(cleanupTimer);
      signal.removeEventListener("abort", abort);
      if (failure) {
        reject(new SyncError(503, failure));
        return;
      }
      if (
        code === 0 &&
        !exitSignal &&
        stage === 3 &&
        result &&
        !buffer.trim() &&
        !decoder.end().trim()
      )
        resolve(result);
      else
        reject(
          new SyncError(
            503,
            "REA protocol process did not close cleanly. No browser tool was called.",
          ),
        );
    });
    if (signal.aborted) {
      abort();
      return;
    }
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "nexus-protocol-check", version: "1" },
      },
    });
  });
}
let running = false;
export async function inspectReaProtocol(
  signal: AbortSignal,
  inspection?: OwnedReaInspection,
) {
  if (running)
    throw new SyncError(429, "A REA protocol check is already running.");
  running = true;
  let launched = false;
  try {
    if (!reaRuntimeCompatible(process.version))
      throw new SyncError(
        409,
        "The Nexus server Node runtime does not meet the pinned REA range. No process was launched.",
      );
    const status = await inspectReaReadiness();
    if (status.packageState !== "pinned-metadata")
      throw new SyncError(
        409,
        "Stage the pinned isolated REA package first. No process was launched.",
      );
    const root = path.resolve(
        process.env.GW_SYNC_DATA_DIR || path.join(process.cwd(), ".gulf-wing"),
      ),
      target = path.join(root, "tools", "rea"),
      pkg = path.join(target, "node_modules", "rea-agents");
    // The managed install is a runtime resource. Trace the committed pin data,
    // not a broad filesystem glob over the installed package.
    const read = async (filename: string, limit: number) => {
      const stat = await fs.lstat(/* turbopackIgnore: true */ filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit)
        throw Error("Unsafe file");
      const handle = await fs.open(/* turbopackIgnore: true */ filename, "r");
      try {
        const opened = await handle.stat();
        if (
          opened.ino !== stat.ino ||
          opened.dev !== stat.dev ||
          opened.size !== stat.size
        )
          throw Error("File changed");
        const buffer = Buffer.alloc(stat.size + 1);
        const read = await handle.read(buffer, 0, buffer.length, 0);
        const after = await handle.stat();
        if (
          read.bytesRead !== stat.size ||
          after.size !== stat.size ||
          after.mtimeMs !== stat.mtimeMs
        )
          throw Error("File changed");
        return buffer.subarray(0, read.bytesRead);
      } finally {
        await handle.close();
      }
    };
    const receipt = JSON.parse(
      (await read(path.join(target, ".nexus-rea-install.json"), 5000)).toString(
        "utf8",
      ),
    );
    if (
      receipt.state !== "staged" ||
      receipt.archiveIntegrity !== reaTarget.archiveIntegrity ||
      receipt.lockSha256 !==
        createHash("sha256")
          .update(await read(path.join(target, "package-lock.json"), 500000))
          .digest("hex")
    )
      throw Error("Stage changed");
    const installed = JSON.parse(
      (await read(path.join(target, "package-lock.json"), 500000)).toString(
        "utf8",
      ),
    );
    if (JSON.stringify(installed) !== JSON.stringify(lock))
      throw Error("Lock changed");
    for (const [relative, expected] of Object.entries(hashes)) {
      signal.throwIfAborted();
      let folder = pkg;
      for (const segment of relative.split("/").slice(0, -1)) {
        folder = path.join(folder, segment);
        const stat = await fs.lstat(folder);
        if (!stat.isDirectory() || stat.isSymbolicLink())
          throw Error("Unsafe directory");
      }
      if (
        createHash("sha256")
          .update(
            await read(
              path.join(
                /* turbopackIgnore: true */ pkg,
                ...relative.split("/"),
              ),
              10000000,
            ),
          )
          .digest("hex") !== expected
      )
        throw Error("Pinned protocol files changed");
    }
    signal.throwIfAborted();
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "production",
      ...Object.fromEntries(
        Object.entries(process.env).filter(([name]) =>
          [
            "PATH",
            "SystemRoot",
            "WINDIR",
            "TEMP",
            "TMP",
            "LANG",
            "LC_ALL",
            "HOME",
            "USERPROFILE",
          ].includes(name),
        ),
      ),
    };
    environment.REA_MCP_TOOL_FAMILIES = "browser";
    const child = spawn(
      process.execPath,
      [path.join(pkg, "scripts", "rea.mjs"), "mcp"],
      { cwd: target, env: environment, stdio: "pipe", windowsHide: true },
    );
    launched = true;
    child.once("close", () => {
      running = false;
    });
    const result = await reaCatalogExchange(child, signal, inspection);
    return {
      ...result,
      checkedAt: new Date().toISOString(),
      protocolVerified: true,
      toolsCalled: inspection ? 1 : 0,
      browserReady: false,
      notice: inspection
        ? "Owned local fixture inspected and REA closed cleanly. No personal profile, account or external site was inspected."
        : "REA initialize/catalog exchange and clean shutdown verified. No tool was called, no browser attached, and no model contacted. Site inspection remains unconnected.",
    };
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError(
      503,
      "REA protocol verification stopped. Staging metadata or pinned files may have changed; no successful readiness was recorded.",
    );
  } finally {
    if (!launched) running = false;
  }
}
