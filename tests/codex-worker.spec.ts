import { test, expect } from "@playwright/test";
import {
  mkdtemp,
  writeFile,
  mkdir,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateCandidate } from "../lib/foundation/candidate";
import {
  codexWorkerStatus,
  runCodexWorker,
} from "../lib/server/foundation/codex-worker";
import {
  createTask,
  changeTask,
  claimNext,
  snapshot,
  hasWorkerConsent,
  beginWorkerRun,
  recoverTasks,
  acknowledgeWorker,
  saveMemory,
  withStore,
} from "../lib/server/foundation/store";
import {
  workerEnvironment,
  commandFor,
} from "../lib/server/foundation/codex-process";
import { coordinatorTick } from "../lib/server/foundation/coordinator";
import { fixtureRole } from "./helpers/access";
async function isolated(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "nexus-code-worker-")),
    old = process.env.GW_SYNC_DATA_DIR;
  const keys = [
    "OPENAI_API_KEY",
    "CODEX_API_KEY",
    "GW_SECRET_SENTINEL",
  ] as const;
  const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const key of keys)
    process.env[key] = "synthetic-private-environment-value";
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    await fn(dir);
  } finally {
    if (old === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = old;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await rm(dir, { recursive: true, force: true });
  }
}
async function fakeCli(dir: string) {
  const entrypoint = path.join(dir, "synthetic-cli.mjs");
  await mkdir(path.join(dir, "codex-worker-home"), { recursive: true });
  await writeFile(
    entrypoint,
    `
import fs from 'node:fs/promises';import path from 'node:path';
const args=process.argv.slice(2),home=process.env.CODEX_HOME;
if(args.includes('--version'))console.log('codex-cli 0.163.0');
else if(args.includes('--help'))console.log('--ignore-user-config --ignore-rules --ephemeral --output-schema');
else if(args.includes('login')){let api=false;try{await fs.access(path.join(home,'api-mode'));api=true;}catch{}console.log(api?'Logged in using an API key - synthetic-secret-never-return':'Logged in using ChatGPT');}
else{
if(!args.includes('read-only')||!args.includes('shell_tool')||!args.includes('plugins')||!args.includes('--ignore-user-config')||!args.includes('--ignore-rules')||!args.includes('forced_login_method="chatgpt"'))process.exit(2);
let input='';for await(const chunk of process.stdin)input+=chunk;
await fs.writeFile(path.join(home,'received.json'),JSON.stringify({input,apiKey:process.env.OPENAI_API_KEY||null,secret:process.env.GW_SECRET_SENTINEL||null}));
console.log(JSON.stringify({type:'turn.started'}));console.log(JSON.stringify({type:'item.completed',item:{text:'untrusted-event-payload-do-not-persist'}}));
const task=JSON.parse(input);
if(task.objective==='hang'){setInterval(()=>{},1000);}
else {await fs.writeFile(args[args.indexOf('--output-last-message')+1],JSON.stringify({summary:'Synthetic candidate',files:[{path:'src/greeting.ts',content:'export const greeting = "Hello";'}],testNotes:'No tests were executed.'}));console.log(JSON.stringify({type:'turn.completed'}));}
}
`,
  );
  await writeFile(
    path.join(dir, "codex-worker.json"),
    JSON.stringify({ version: 1, enabled: true, entrypoint }),
  );
  return entrypoint;
}
function queued(request = "Synthetic code candidate", allowWorker = true) {
  const id = createTask({ request, scope: "Personal", mode: "development" });
  changeTask({ id, revision: 0, action: "queue", allowWorker });
  return id;
}
test("candidate validation rejects traversal, executable files, hidden paths and duplicate Windows names", () => {
  const good = {
    summary: "Candidate",
    files: [{ path: "src/tool.ts", content: "export const value = 1;" }],
    testNotes: "Not run",
  };
  expect(validateCandidate(good).files).toHaveLength(1);
  for (const p of [
    "../outside.ts",
    "src/../outside.ts",
    "src/tool.exe",
    "C:/outside.ts",
    "src/CON.ts",
    "src//tool.ts",
    "src/.git/config.ts",
  ])
    expect(() =>
      validateCandidate({ ...good, files: [{ path: p, content: "text" }] }),
    ).toThrow();
  expect(() =>
    validateCandidate({
      ...good,
      files: [good.files[0], { path: "src/TOOL.ts", content: "text" }],
    }),
  ).toThrow();
  expect(() => commandFor("codex.cmd")).toThrow();
});
test("worker uses one-use consent, isolates prompts, strips API fallback and returns an unpromoted candidate", async () =>
  isolated(async (dir) => {
    await fakeCli(dir);
    saveMemory({
      kind: "fact",
      scope: "Personal",
      content: "private-memory-sentinel",
    });
    const id = queued();
    expect((await codexWorkerStatus()).ready).toBe(true);
    await coordinatorTick();
    const t = snapshot().tasks.find((t) => t.id === id)!;
    expect(t.state).toBe("waiting");
    expect(t.reason).toContain("candidate ready");
    const artifact = JSON.parse(t.output);
    expect(artifact.validation.tests).toBe("not-run");
    expect(artifact.validation.promotion).toBe("not-approved");
    expect(snapshot().skills[0].status).toBe("draft");
    const run = snapshot().workerRuns![0];
    expect(run.state).toBe("candidate-ready");
    expect(run.progress).toBe(3);
    expect(run.pid).toBeGreaterThan(0);
    expect(JSON.stringify(run)).not.toContain("untrusted-event-payload");
    const received = JSON.parse(
      await readFile(
        path.join(dir, "codex-worker-home", "received.json"),
        "utf8",
      ),
    );
    expect(received.input).not.toContain("private-memory-sentinel");
    expect(received.apiKey).toBeNull();
    expect(received.secret).toBeNull();
    expect(await readdir(path.join(dir, "development-workspaces"))).toEqual([
      run.id,
    ]);
  }));
test("missing or stale consent cannot start a worker and API-key sign-in is rejected", async () =>
  isolated(async (dir) => {
    await fakeCli(dir);
    queued("No consent", false);
    const t = claimNext()!;
    expect(hasWorkerConsent(t)).toBe(false);
    expect(() => beginWorkerRun(t)).toThrow();
    await writeFile(
      path.join(dir, "codex-worker-home", "api-mode"),
      "synthetic",
    );
    const status = await codexWorkerStatus();
    expect(status.ready).toBe(false);
    expect(status.state).toBe("needs-sign-in");
    expect(JSON.stringify(status)).not.toContain("synthetic-secret");
    const entry = path.join(dir, "synthetic-cli.mjs");
    await writeFile(
      entry,
      (await readFile(entry, "utf8")).replace(
        "codex-cli 0.163.0",
        "codex-cli 0.999.0",
      ),
    );
    expect((await codexWorkerStatus()).ready).toBe(false);
    const env = workerEnvironment(path.join(dir, "codex-worker-home"));
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.CODEX_API_KEY).toBeUndefined();
  }));
test("cancelling an owned worker ends the process and consumes consent without promoting code", async () =>
  isolated(async (dir) => {
    await fakeCli(dir);
    queued("hang");
    const t = claimNext()!,
      abort = new AbortController();
    const running = runCodexWorker(t, abort.signal);
    await expect
      .poll(() => snapshot().workerRuns?.[0]?.pid, { timeout: 10000 })
      .toBeGreaterThan(0);
    const pid = snapshot().workerRuns![0].pid!;
    abort.abort();
    await expect(running).rejects.toThrow();
    expect(snapshot().workerRuns![0].state).toBe("cancelled");
    expect(hasWorkerConsent(t)).toBe(false);
    expect(() => process.kill(pid, 0)).toThrow();
    expect(snapshot().skills).toHaveLength(0);
  }));
test("restart fences uncertain worker attempts until an explicit owner acknowledgement", async () =>
  isolated(async () => {
    queued();
    const t = claimNext()!;
    beginWorkerRun(t);
    recoverTasks();
    const run = snapshot().workerRuns![0];
    expect(run.state).toBe("interrupted");
    expect(snapshot().tasks[0].state).toBe("paused");
    const id = queued("Second request");
    const next = claimNext()!;
    expect(next.id).toBe(id);
    expect(() => beginWorkerRun(next)).toThrow();
    expect(() =>
      acknowledgeWorker({ id: run.id, confirmStopped: false }),
    ).toThrow();
    acknowledgeWorker({ id: run.id, confirmStopped: true });
    expect(() => beginWorkerRun(next)).not.toThrow();
  }));
test("v1 database is backed up and migrated without changing existing owner tasks", async () =>
  isolated(async (dir) => {
    createTask({
      request: "Retained legacy objective",
      scope: "Personal",
      mode: "plan",
    });
    withStore((db) => {
      db.exec(
        "DROP TABLE candidate_reviews; DROP TABLE worker_runs; DROP TABLE worker_grants; PRAGMA user_version=1;",
      );
    });
    expect(snapshot().tasks[0].request).toBe("Retained legacy objective");
    expect(
      (await readdir(path.join(dir, "foundation-backups"))).some((n) =>
        n.startsWith("before-schema-2-"),
      ),
    ).toBe(true);
    expect(
      withStore(
        (db) => (db.prepare("PRAGMA user_version").get() as any).user_version,
      ),
    ).toBe(3);
  }));
test("worker status and interruption controls require controller identity and origin checks", async ({
  context,
}) => {
  const request = context.request;
  expect((await request.get("/api/sync/worker")).status()).toBe(401);
  await fixtureRole(context, "display");
  expect((await request.get("/api/sync/worker")).status()).toBe(403);
  await fixtureRole(context);
  expect(await (await request.get("/api/sync/worker")).json()).toMatchObject({
    enabled: false,
    ready: false,
  });
  expect(
    (
      await request.post("/api/sync/foundation", {
        headers: { Origin: "https://untrusted.example" },
        data: { op: "worker.acknowledge" },
      })
    ).status(),
  ).toBe(403);
});

test("development consent starts unchecked and is sent only for the selected task revision", async ({
  page,
  context,
}) => {
  await fixtureRole(context);
  await page.goto("/nexus");
  await page.getByRole("button", { name: "Foundation", exact: true }).click();
  await page
    .getByLabel("Task objective", { exact: true })
    .fill("Synthetic consent UI " + test.info().project.name);
  await page.getByLabel("Work type").selectOption("development");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  const card = page.getByRole("article", {
    name: "Task: Synthetic consent UI " + test.info().project.name,
  });
  const consent = card.getByRole("checkbox");
  await expect(consent).not.toBeChecked();
  await consent.check();
  const pending = page.waitForRequest(
    (r) =>
      r.url().endsWith("/api/sync/foundation") &&
      r.method() === "POST" &&
      r.postDataJSON()?.op === "task.change",
  );
  await card.getByRole("button", { name: "Queue work", exact: true }).click();
  expect((await pending).postDataJSON().allowWorker).toBe(true);
  // The server fixture has no enabled worker, so no provider is contacted.
  await expect(
    card.getByText("Coding worker unavailable or interrupted.", {
      exact: false,
    }),
  ).toBeVisible({ timeout: 15000 });
  await expect(card.getByRole("checkbox")).not.toBeChecked();
});
