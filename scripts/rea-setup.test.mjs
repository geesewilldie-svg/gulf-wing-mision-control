import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { setupRea, validateReaLock } from "./rea-setup-lib.mjs";
import { reaTarget } from "./rea-target.mjs";
const lock = JSON.parse(
  await fs.readFile(
    new URL("./rea-runtime/package-lock.json", import.meta.url),
    "utf8",
  ),
);
function fixture({ existing = false, fail, version = "v26.12.1" } = {}) {
  const calls = [];
  const step = (name) => async () => {
    calls.push(name);
    if (fail === name) throw Error("Fixture " + name + " failed");
  };
  return {
    calls,
    io: {
      nodeVersion: version,
      async readLock() {
        calls.push("readLock");
        return structuredClone(lock);
      },
      async withLock(run) {
        calls.push("lock");
        try {
          return await run();
        } finally {
          calls.push("unlock");
        }
      },
      async exists() {
        calls.push("exists");
        return existing;
      },
      reserve: step("reserve"),
      copyInputs: step("copy"),
      install: step("install"),
      verifyInstalled: step("verify"),
      verifyExisting: step("verifyExisting"),
      record: step("record"),
    },
  };
}
test("the separate lock pins reviewed REA archive and only registry integrity-bound dependencies", () => {
  assert.equal(
    lock.packages["node_modules/rea-agents"].integrity,
    reaTarget.archiveIntegrity,
  );
  assert.equal(validateReaLock(lock), 175);
  for (const change of [
    (d) => (d.packages["node_modules/rea-agents"].integrity = "sha512-wrong"),
    (d) =>
      (d.packages["node_modules/rea-agents"].resolved =
        "https://untrusted.test/package.tgz"),
    (d) => (d.packages["node_modules/rea-agents"].link = true),
  ]) {
    const changed = structuredClone(lock);
    change(changed);
    assert.throws(() => validateReaLock(changed));
  }
});
test("an unsupported runtime stops before any filesystem or download action", async () => {
  const { io, calls } = fixture({ version: "v24.19.0" });
  await assert.rejects(setupRea(io), /No install was started/);
  assert.deepEqual(calls, []);
});
test("first staging verifies before recording and never runs REA setup or a CLI probe", async () => {
  const { io, calls } = fixture();
  assert.deepEqual(await setupRea(io), {
    state: "staged",
    packages: 175,
    executed: false,
  });
  assert.deepEqual(calls, [
    "readLock",
    "lock",
    "exists",
    "reserve",
    "copy",
    "install",
    "verify",
    "record",
    "unlock",
  ]);
});
test("an existing verified stage is reused without another install or configuration write", async () => {
  const { io, calls } = fixture({ existing: true });
  assert.equal((await setupRea(io)).state, "already-staged");
  assert.deepEqual(calls, [
    "readLock",
    "lock",
    "exists",
    "verifyExisting",
    "unlock",
  ]);
});
test("install/verification failures retain the incomplete stage without a ready record", async () => {
  for (const failure of ["install", "verify"]) {
    const { io, calls } = fixture({ fail: failure });
    await assert.rejects(setupRea(io), /Fixture/);
    assert.equal(calls.includes("record"), false);
    assert.equal(calls.at(-1), "unlock");
  }
  const { io, calls } = fixture({ existing: true, fail: "verifyExisting" });
  await assert.rejects(setupRea(io), /Fixture/);
  assert.equal(calls.includes("reserve"), false);
  assert.equal(calls.includes("install"), false);
});
test("a modified lock fails before creating an installation lock or stage", async () => {
  const { io, calls } = fixture();
  io.readLock = async () => ({ lockfileVersion: 3, packages: {} });
  await assert.rejects(setupRea(io), /pinned package/);
  assert.deepEqual(calls, []);
});
