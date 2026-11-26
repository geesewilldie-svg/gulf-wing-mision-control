import path from "node:path";
// A saved PID is a hint, not process identity: Windows can reuse it after an update.
export function serviceProcessPattern(service) {
  const values = [service.command, ...(service.args || [])];
  if (
    !service.command ||
    values.some(
      (value) =>
        typeof value !== "string" || !value.length || /["\r\n\0]/.test(value),
    )
  )
    return null;
  const quote = (value) => {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return `(?:"${escaped}"|${escaped})`;
  };
  return `^${values.map(quote).join("\\s+")}\\s*$`;
}
export const managedProcessIdentityScript = String.raw`
$ErrorActionPreference='Stop'
$item=Get-CimInstance Win32_Process -Filter ("ProcessId = " + [int]$env:NEXUS_LAUNCH_PID)
if(!$item) { Write-Output 'missing' }
elseif([string]::IsNullOrEmpty($item.CommandLine)) { Write-Output 'unknown' }
elseif($item.CommandLine -match $env:NEXUS_LAUNCH_PATTERN) { Write-Output 'match' }
else { Write-Output 'different' }
`;
export async function managedServiceProbe(service, entry, io) {
  const state = await io.health(service);
  if (state !== "down") return state;
  if (!entry || !Number.isSafeInteger(entry.pid) || entry.pid <= 0)
    return "down";
  const identity = await io.identity(service, entry.pid);
  return identity === true
    ? "pending"
    : identity === false
      ? "down"
      : "unverified";
}

// Platform-neutral orchestration, separated from Windows process launch for testing.
export async function startServices(services, io) {
  const results = [];
  for (const service of services) {
    const state = await io.probe(service);
    if (state === "ready" || state === "degraded") {
      io.log(
        `${service.name}: ${state === "ready" ? "already running" : "running, but capabilities need attention"}.`,
      );
      results.push({ id: service.id, state });
      continue;
    }
    if (state === "unverified") {
      io.log(
        `${service.name}: the saved process identity could not be verified. No duplicate was started; inspect the launcher logs or local process diagnostics.`,
      );
      results.push({ id: service.id, state: "blocked" });
      continue;
    }
    if (state === "pending") {
      if (io.waitExisting) {
        io.log(
          `${service.name}: an earlier owned launch is still starting; waiting for readiness…`,
        );
        let ready;
        try {
          ready = await io.waitExisting(service);
        } catch {
          ready = "failed";
        }
        if (!["ready", "degraded", "failed", "warming"].includes(ready))
          ready = "failed";
        io.log(
          `${service.name}: ${ready === "ready" ? "ready" : ready === "degraded" ? "running; check capabilities" : ready === "failed" ? "earlier launch exited before readiness; inspect the private launcher log" : "owned launch is still warming up; inspect the private launcher log"}.`,
        );
        results.push({ id: service.id, state: ready });
      } else {
        io.log(
          `${service.name}: a previous launch may still be warming up. No duplicate was started; check the launcher logs.`,
        );
        results.push({ id: service.id, state: "warming" });
      }
      continue;
    }
    if (state === "occupied") {
      io.log(
        `${service.name}: port ${service.port} is occupied by an unrecognized service. Nothing was stopped.`,
      );
      results.push({ id: service.id, state: "blocked" });
      continue;
    }
    if (!(await io.prepare(service))) {
      io.log(
        `${service.name}: setup files are missing. See docs/windows-launcher.md.`,
      );
      results.push({ id: service.id, state: "missing" });
      continue;
    }
    try {
      io.log(`${service.name}: starting in the background…`);
      const process = await io.start(service);
      const ready = await io.wait(service, process);
      io.log(
        `${service.name}: ${ready === "ready" ? "ready" : ready === "degraded" ? "running; check capabilities" : ready === "failed" ? "process exited before readiness; inspect the current timestamp in the private launcher log" : "still warming up; inspect the private launcher logs before retrying"}.`,
      );
      results.push({ id: service.id, state: ready });
    } catch {
      io.log(
        `${service.name}: could not start. Inspect the private launcher logs.`,
      );
      results.push({ id: service.id, state: "failed" });
    }
  }
  return results;
}

// Windowed Python avoids attaching the voice worker to a closing terminal console.
export async function backgroundVoicePython(scriptsDirectory, exists) {
  const windowed = path.join(scriptsDirectory, "pythonw.exe");
  return (await exists(windowed)) ? windowed : null;
}
