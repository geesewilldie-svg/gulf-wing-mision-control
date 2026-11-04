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
    if (state === "pending") {
      io.log(
        `${service.name}: a previous launch may still be warming up. No duplicate was started; check the launcher logs.`,
      );
      results.push({ id: service.id, state: "warming" });
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
        `${service.name}: ${ready === "ready" ? "ready" : ready === "degraded" ? "running; check capabilities" : "not ready yet; inspect the private launcher logs before retrying"}.`,
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
