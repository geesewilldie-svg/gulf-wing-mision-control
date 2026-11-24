import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseStorageInventory,
  discoverWindowsStorage,
  storageQuery,
} from "./storage-discovery-lib.mjs";
const fixture = () => ({
  version: 1,
  drives: [
    {
      path: "C:\\",
      label: "Windows",
      type: 3,
      size: "1000000000000",
      free: "500000000000",
    },
  ],
  folders: [
    { name: "Downloads", path: "C:\\Users\\Owner\\Downloads" },
    { name: "MyDocuments", path: "C:\\Users\\Owner\\OneDrive\\Documents" },
  ],
});
test("normalizes drive metadata and preserves redirected common-folder paths without granting access", () => {
  const result = parseStorageInventory("\uFEFF" + JSON.stringify(fixture()));
  assert.equal(result.drives[0].kind, "fixed");
  assert.equal(result.drives[0].sizeBytes, "1000000000000");
  assert.equal(result.folders[1].path, "C:\\Users\\Owner\\OneDrive\\Documents");
  assert.equal(result.accessGranted, false);
  assert.equal(result.contentScanned, false);
});
test("rejects unexpected paths, device namespaces, controls and oversized inventories", () => {
  for (const target of [
    "relative",
    "\\rooted",
    "\\\\?\\C:\\",
    "C:\\bad\nname",
  ]) {
    const value = fixture();
    value.folders[0].path = target;
    assert.throws(() => parseStorageInventory(JSON.stringify(value)));
  }
  const value = fixture();
  value.drives[0].path = "C:\\arbitrary";
  assert.throws(() => parseStorageInventory(JSON.stringify(value)));
  assert.throws(() => parseStorageInventory("x".repeat(256001)));
  assert.throws(() =>
    parseStorageInventory(
      JSON.stringify({
        ...fixture(),
        folders: Array(21).fill(fixture().folders[0]),
      }),
    ),
  );
});
test("empty and offline metadata remain honest and do not probe files", () => {
  assert.deepEqual(
    parseStorageInventory(
      JSON.stringify({ version: 1, drives: [], folders: [] }),
    ).drives,
    [],
  );
  const value = fixture();
  value.drives[0] = {
    path: "Z:\\",
    label: "Remote",
    type: 4,
    size: "",
    free: "",
  };
  const drive = parseStorageInventory(JSON.stringify(value)).drives[0];
  assert.equal(drive.kind, "network");
  assert.equal(drive.sizeBytes, null);
});
test("uses one fixed bounded PowerShell query and refuses other operating systems", async () => {
  let calls = 0;
  const result = await discoverWindowsStorage({
    platform: "win32",
    run: async (file, args, options) => {
      calls++;
      assert.equal(file, "powershell.exe");
      assert.ok(args.includes("-NoProfile"));
      assert.equal(
        Buffer.from(args.at(-1), "base64").toString("utf16le"),
        storageQuery,
      );
      assert.equal(options.timeout, 15000);
      assert.equal(options.windowsHide, true);
      return { stdout: JSON.stringify(fixture()) };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.folders.length, 2);
  await assert.rejects(
    discoverWindowsStorage({
      platform: "linux",
      run: () => {
        throw Error("must not run");
      },
    }),
  );
  assert.doesNotMatch(
    storageQuery,
    /Get-ChildItem|ReadAllText|Set-Item|Invoke-WebRequest|Remove-Item/i,
  );
});
