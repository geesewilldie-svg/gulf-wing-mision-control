export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NEXT_PHASE === "phase-production-build"
  )
    return;
  const { startCoordinator } = await import(
    "./lib/server/foundation/coordinator"
  );
  try {
    startCoordinator();
  } catch {
    console.warn(
      "Nexus foundation unavailable; dispatch remains stopped. Existing business data was not migrated.",
    );
  }
  const { buildMorning } = await import("./lib/server/morning-brief");
  const globalScheduler = globalThis as typeof globalThis & {
    nexusBriefTimer?: ReturnType<typeof setInterval>;
  };
  if (globalScheduler.nexusBriefTimer) return;
  const tick = () => {
    void buildMorning().catch(() => {
      console.warn(
        "Nexus morning brief unavailable; inspect settings and private storage.",
      );
    });
  };
  globalScheduler.nexusBriefTimer = setInterval(tick, 60_000);
  globalScheduler.nexusBriefTimer.unref();
  tick();
}
