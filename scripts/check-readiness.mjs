import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const root = path.resolve(process.env.GW_SYNC_DATA_DIR || ".gulf-wing");
let required = 0;
async function fileCheck(name, label, check) {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(root, name), "utf8"));
    console.log("OK   " + label + ": " + check(raw));
    return raw;
  } catch (error) {
    console.log(
      "SETUP " +
        label +
        ": " +
        (error.code === "ENOENT"
          ? "not configured / no saved file yet"
          : "file could not be read; preserve it and investigate"),
    );
    required++;
    return null;
  }
}
console.log(
  "Gulf Wing day-one laptop checks (no credentials or customer content displayed)\n",
);
await fileCheck("sync-config.json", "Private device pairing", (data) => {
  if (data.version !== 1 || !data.pairingHash || !data.signingSecret)
    throw Error();
  return "configured";
});
const docs = await fileCheck("knowledge.json", "Business knowledge", (data) => {
  if (!Array.isArray(data) || !data.length) throw Error();
  return data.length + " private sections";
});
const state = await fileCheck(
  "business.json",
  "Saved business workspace",
  (data) => {
    if (!Array.isArray(data.records) || !Array.isArray(data.quotes))
      throw Error();
    return (
      data.records.length + " records, " + data.quotes.length + " estimates"
    );
  },
);
if (!state)
  console.log(
    "     A new workspace is normal before the first saved intake or service edit.",
  );
try {
  const r = await fetch("http://127.0.0.1:3000/api/sync/session", {
    signal: AbortSignal.timeout(3000),
  });
  if (!r.ok || !(await r.json()).enabled) throw Error();
  console.log("OK   Mission Control server: running on port 3000");
} catch {
  console.log(
    "START Mission Control server: npm.cmd run start in its own PowerShell tab",
  );
  required++;
}
for (const [label, url] of [
  ["Ollama", "http://127.0.0.1:11434/api/tags"],
  ["Nexus voice", "http://127.0.0.1:8766/health"],
]) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw Error();
    const data = await r.json();
    console.log(
      "OK   " +
        label +
        ": " +
        (label === "Ollama"
          ? (data.models?.length || 0) + " installed models"
          : "speech " +
            Boolean(data.speech) +
            ", transcription " +
            Boolean(data.transcription)),
    );
  } catch {
    console.log(
      "START " +
        label +
        ": optional for business forms; required for its local AI/voice feature",
    );
  }
}
console.log(
  "\nOn your wife's phone / Chromebook, use the same Wi-Fi and one of:",
);
for (const iface of Object.values(os.networkInterfaces()).flat()) {
  if (
    iface &&
    !iface.internal &&
    iface.family === "IPv4" &&
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(iface.address)
  )
    console.log("  http://" + iface.address + ":3000/nexus");
}
console.log(
  "\nPair privately through Connect devices. Keep the laptop awake. No router port forwarding.",
);
console.log(
  "Import original business PDFs/XLSX from Ask Nexus if knowledge is missing. Run one real intake, estimate and job checklist with your wife before using customer data.",
);
if (required)
  console.log(
    "\n" +
      required +
      " setup items to review above. This is a technical check, not a business/legal launch approval.",
  );
