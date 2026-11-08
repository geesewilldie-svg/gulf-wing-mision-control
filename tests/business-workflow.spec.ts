import { test, expect } from "@playwright/test";
import {
  emptyBusiness,
  validBusiness,
  jobChecklist,
  type BusinessState,
  type BusinessRecord,
} from "../lib/business";
import {
  applyBusinessWorkflow,
  acceptanceRecorded,
  reviewAccepted,
} from "../lib/business-workflow";
function commit(
  current: BusinessState,
  incoming: BusinessState,
  restore = false,
): BusinessState {
  return {
    ...applyBusinessWorkflow(
      current,
      validBusiness(incoming),
      "2026-11-10T12:00:00.000Z",
      restore,
    ),
    revision: current.revision + 1,
    audit: current.audit,
  };
}
function draft() {
  let s = emptyBusiness();
  s = commit(s, {
    ...s,
    records: [
      {
        id: "site",
        kind: "Property",
        name: "Test property",
        status: "Planned",
        notes: "Agreed turnover clean",
        contact: "Test owner",
        address: "TEST address",
        serviceId: "turnover",
        isTest: true,
        parentId: "",
      },
    ],
    quotes: [
      {
        id: "quote",
        name: "Turnover",
        hours: 2,
        wage: 22,
        burden: 18.65,
        materials: 20,
        margin: 30,
        scope: "Agreed turnover clean",
        serviceId: "turnover",
        recordId: "site",
        status: "Draft",
      },
    ],
  });
  return s;
}
function accepted() {
  const s = draft();
  return commit(s, {
    ...s,
    quotes: s.quotes.map((q) => ({
      ...q,
      status: "Accepted",
      acceptance: {
        acceptedBy: "Test owner",
        method: "Test",
        reference: "Synthetic response",
        recordedBy: "Test operator",
        confirmed: true,
      },
    })),
  });
}
function job() {
  const s = accepted();
  const q = s.quotes[0],
    p = s.records[0];
  const r: BusinessRecord = {
    ...p,
    id: "job",
    kind: "Job",
    name: "Turnover job",
    status: "Planned",
    notes: q.scope!,
    parentId: p.id,
    assignee: "Test operator",
    dueDate: "2026-11-11",
    checklist: jobChecklist(),
  };
  return commit(s, {
    ...s,
    records: [...s.records, r],
    quotes: [{ ...q, jobId: r.id }],
  });
}
function move(s: BusinessState, phase: any, extra: any = {}) {
  return commit(s, {
    ...s,
    records: s.records.map((r) =>
      r.id === "job"
        ? {
            ...r,
            status:
              phase === "Accepted"
                ? "Complete"
                : phase === "Scheduled"
                  ? "Planned"
                  : "Active",
            review: { ...r.review!, phase, ...extra },
          }
        : r,
    ),
  });
}
function submitted() {
  let s = job();
  s = move(s, "In progress");
  s = commit(s, {
    ...s,
    records: s.records.map((r) =>
      r.id === "job"
        ? { ...r, checklist: r.checklist!.map((c) => ({ ...c, done: true })) }
        : r,
    ),
  });
  return move(s, "Review required", {
    summary: "Synthetic turnover completed; no damage or exceptions.",
  });
}
test("exact-version acceptance is server-stamped, price frozen and cannot be forged by a status alone", () => {
  const s = draft();
  expect(() =>
    commit(s, { ...s, quotes: [{ ...s.quotes[0], status: "Accepted" }] }),
  ).toThrow(/accepted|Record who/);
  const a = accepted();
  expect(acceptanceRecorded(a.quotes[0])).toBe(true);
  expect(a.quotes[0].acceptance?.recordedAt).toBe("2026-11-10T12:00:00.000Z");
  expect(a.quotes[0].acceptance?.priceCents).toBe(10315);
  expect(() =>
    commit(a, { ...a, quotes: [{ ...a.quotes[0], wage: 99 }] }),
  ).toThrow(/locked/);
  expect(() =>
    commit(a, {
      ...a,
      quotes: [
        {
          ...a.quotes[0],
          acceptance: { ...a.quotes[0].acceptance!, priceCents: 1 },
        },
      ],
    }),
  ).toThrow(/locked/);
});
test("draft scope/cost changes increment the estimate version and stale explicit versions are rejected", () => {
  const s = draft();
  const newer = commit(s, { ...s, quotes: [{ ...s.quotes[0], hours: 3 }] });
  expect(newer.quotes[0].version).toBe(2);
  expect(() =>
    commit(newer, { ...newer, quotes: [{ ...newer.quotes[0], version: 1 }] }),
  ).toThrow(/version changed/);
});
test("test records cannot become live or mix links and acceptance methods", () => {
  const s = draft();
  expect(() =>
    commit(s, { ...s, records: [{ ...s.records[0], isTest: false }] }),
  ).toThrow(/identities/);
  expect(() =>
    commit(s, {
      ...s,
      quotes: [
        {
          ...s.quotes[0],
          status: "Accepted",
          acceptance: {
            acceptedBy: "A",
            recordedBy: "B",
            method: "Email",
            reference: "ref",
            confirmed: true,
          },
        },
      ],
    }),
  ).toThrow(/Test acceptance/);
});
test("one accepted estimate creates one job with immutable source and agreed scope", () => {
  const s = job();
  const r = s.records.find((r) => r.id === "job")!;
  expect(r.sourceQuoteId).toBe("quote");
  expect(r.sourceQuoteVersion).toBe(1);
  expect(() =>
    commit(s, { ...s, quotes: [{ ...s.quotes[0], jobId: "site" }] }),
  ).toThrow();
  expect(() =>
    commit(s, {
      ...s,
      records: s.records.map((r) =>
        r.id === "job" ? { ...r, notes: "Changed scope" } : r,
      ),
    }),
  ).toThrow(/scope/);
});
test("completion cannot skip submission, needs all checklist criteria and records a human decision", () => {
  let s = job();
  expect(() =>
    move(s, "Accepted", {
      reviewer: "Owner",
      note: "Accepted work by inspection",
      confirmed: true,
    }),
  ).toThrow(/workflow|steps/);
  s = move(s, "In progress");
  expect(() =>
    move(s, "Review required", { summary: "Work completed; inspect please" }),
  ).toThrow(/checklist/);
  s = submitted();
  expect(() =>
    move(s, "Accepted", {
      reviewer: "Owner",
      note: "Reviewed all work",
      confirmed: false,
    }),
  ).toThrow(/human reviewer/);
  s = move(s, "Accepted", {
    reviewer: "Test owner",
    note: "Reviewed each checklist item and accepted the synthetic result",
    confirmed: true,
  });
  const r = s.records.find((r) => r.id === "job")!;
  expect(reviewAccepted(r)).toBe(true);
  expect(r.review?.history[0].submissionVersion).toBe(1);
  expect(r.status).toBe("Complete");
  expect(() =>
    commit(s, {
      ...s,
      records: s.records.map((r) =>
        r.id === "job" ? { ...r, checklist: [] } : r,
      ),
    }),
  ).toThrow(/locked/);
});
test("rework retains earlier review evidence and requires a new submission", () => {
  let s = submitted();
  s = move(s, "Rework", {
    reviewer: "Owner",
    note: "Recheck kitchen surfaces before accepting",
    confirmed: true,
  });
  s = move(s, "In progress");
  s = move(s, "Review required", {
    summary: "Kitchen was rechecked and documented after rework",
  });
  expect(s.records.find((r) => r.id === "job")?.review?.submissionVersion).toBe(
    2,
  );
  s = move(s, "Accepted", {
    reviewer: "Owner",
    note: "Rework inspected and accepted for this submission",
    confirmed: true,
  });
  expect(
    s.records
      .find((r) => r.id === "job")
      ?.review?.history.map((h) => h.decision),
  ).toEqual(["Rework", "Accepted"]);
});
test("legacy completion stays unreviewed and restore never certifies old approvals", () => {
  const legacy = validBusiness({
    ...emptyBusiness(),
    records: [
      {
        id: "old",
        kind: "Job",
        name: "Legacy",
        notes: "Old status",
        status: "Complete",
      },
    ],
  });
  expect(legacy.records[0].review?.phase).toBe("Legacy unreviewed");
  const old = { ...legacy, audit: [] };
  expect(() =>
    commit(old, { ...old, marketing: { ...old.marketing, total: 600 } }),
  ).not.toThrow();
  const approved = move(submitted(), "Accepted", {
    reviewer: "Owner",
    note: "Reviewed and accepted work",
    confirmed: true,
  });
  const restored = commit(approved, approved, true);
  expect(acceptanceRecorded(restored.quotes[0])).toBe(false);
  expect(reviewAccepted(restored.records.find((r) => r.id === "job")!)).toBe(
    false,
  );
  expect(
    restored.records.find((r) => r.id === "job")?.review?.history.length,
  ).toBe(1);
  const unrelated = commit(restored, {
    ...restored,
    marketing: { ...restored.marketing, total: 700 },
  });
  expect(unrelated.quotes[0].acceptance?.origin).toBe("restored-unverified");
});

test("business migration backup preserves exact legacy bytes and corrupt files stay untouched", async () => {
  const fs = await import("node:fs/promises"),
    os = await import("node:os"),
    path = await import("node:path");
  const { loadBusiness, persistBusiness } = await import(
    "../lib/server/business-store"
  );
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "business-migration-")),
    old = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = root;
  try {
    const file = path.join(root, "business.json");
    const legacy = JSON.stringify({
      revision: 4,
      records: [
        {
          id: "legacy",
          kind: "Job",
          name: "Legacy",
          status: "Complete",
          notes: "Keep exact record",
        },
      ],
      quotes: [],
      marketing: { total: 0, meta: 0, google: 0, linkedin: 0 },
      audit: ["Old audit"],
    });
    await fs.writeFile(file, legacy);
    const current = await loadBusiness();
    await persistBusiness({ ...current, revision: 5 });
    const names = await fs.readdir(path.join(root, "business-backups"));
    expect(
      await fs.readFile(path.join(root, "business-backups", names[0]), "utf8"),
    ).toBe(legacy);
    expect((await loadBusiness()).records[0].review?.phase).toBe(
      "Legacy unreviewed",
    );
    await fs.writeFile(file, "invalid JSON");
    await expect(loadBusiness()).rejects.toThrow(/preserved/);
    expect(await fs.readFile(file, "utf8")).toBe("invalid JSON");
  } finally {
    if (old === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = old;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("test rehearsals are excluded from operating knowledge and morning priorities", async () => {
  const fs = await import("node:fs/promises"),
    os = await import("node:os"),
    path = await import("node:path");
  const { persistBusiness } = await import("../lib/server/business-store");
  const { businessKnowledge } = await import(
    "../lib/server/business-knowledge"
  );
  const { buildMorning } = await import("../lib/server/morning-brief");
  const { defaultBriefSettings } = await import("../lib/daily-brief");
  const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "business-test-exclusion-"),
    ),
    old = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = root;
  try {
    const testData = submitted();
    const state = {
      ...testData,
      records: [
        ...testData.records,
        {
          id: "real",
          kind: "Lead" as const,
          name: "Live follow-up fixture",
          notes: "Real-work fixture",
          status: "Active" as const,
          isTest: false,
          dueDate: "2026-11-09",
        },
      ],
    };
    await persistBusiness(state);
    const docs = await businessKnowledge();
    expect(
      docs.some((d) => d.id === "record-job" || d.id === "estimate-quote"),
    ).toBe(false);
    expect(docs.some((d) => d.text.includes("Live follow-up fixture"))).toBe(
      true,
    );
    await fs.writeFile(
      path.join(root, "daily-brief.json"),
      JSON.stringify({ ...defaultBriefSettings(), enabled: true, tasks: [] }),
    );
    const brief = await buildMorning(new Date("2026-11-09T12:00:00Z"));
    expect(brief?.text).toContain("Live follow-up fixture");
    expect(brief?.text).not.toContain("Turnover job");
  } finally {
    if (old === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = old;
    await fs.rm(root, { recursive: true, force: true });
  }
});
