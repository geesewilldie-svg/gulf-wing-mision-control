import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const root = path.resolve(process.env.GW_SYNC_DATA_DIR || ".gulf-wing");
const target = path.join(root, "nexus-config.json");
let saved = {};
try {
  saved = JSON.parse(await fs.readFile(target, "utf8"));
  if (!saved || saved.version !== 1 || typeof saved.model !== "string")
    throw new Error("Invalid settings");
} catch (error) {
  if (error.code !== "ENOENT")
    throw new Error(
      "Existing Nexus settings could not be read; nothing was replaced.",
    );
}
const model =
  process.argv[2] ||
  process.env.GW_NEXUS_MODEL ||
  saved.model ||
  "qwen2.5:1.5b";
if (
  typeof model !== "string" ||
  !/^[a-z0-9][a-z0-9._/-]*(?::[a-z0-9._-]+)?$/i.test(model) ||
  model.length > 120
)
  throw new Error("Use a valid Ollama model name.");
async function tags() {
  try {
    const r = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(2000),
    });
    const body = await r.json();
    return r.ok && Array.isArray(body.models) ? body.models : null;
  } catch {
    return null;
  }
}
async function executable() {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const candidate = path.join(
      process.env.LOCALAPPDATA,
      "Programs",
      "Ollama",
      "ollama.exe",
    );
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  const name = process.platform === "win32" ? "ollama.exe" : "ollama";
  for (const directory of (process.env.PATH || "").split(path.delimiter)) {
    const candidate = path.join(directory.replace(/^"|"$/g, ""), name);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  return null;
}
async function main() {
  console.log(
    `Nexus local model: ${model}. Missing model files will download from Ollama; no paid API is used.`,
  );
  let models = await tags();
  if (!models) {
    const binary = await executable();
    if (!binary)
      throw new Error(
        "Ollama was not found. Finish the Windows installer from https://ollama.com/download/windows and run this setup again.",
      );
    console.log(
      "Starting Ollama on laptop loopback. Existing reachable services are left running.",
    );
    const child = spawn(binary, ["serve"], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        OLLAMA_HOST: "127.0.0.1:11434",
        OLLAMA_NUM_PARALLEL: "1",
        OLLAMA_MAX_LOADED_MODELS: "1",
      },
    });
    let startError;
    child.on("error", (error) => {
      startError = error;
    });
    child.unref();
    for (let attempt = 0; attempt < 30 && !models; attempt++) {
      if (startError)
        throw new Error(
          "Ollama could not start. Open the Ollama app and retry.",
        );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      models = await tags();
    }
    if (!models)
      throw new Error(
        "Ollama did not become ready. Open its Windows app, then run setup again.",
      );
  }
  if (!models.some((item) => item.name === model)) {
    console.log(
      "Downloading the selected model. Keep this window open; the first download can take several minutes.",
    );
    const r = await fetch("http://127.0.0.1:11434/api/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: true }),
      signal: AbortSignal.timeout(30 * 60 * 1000),
    });
    if (!r.ok || !r.body)
      throw new Error(
        "Ollama could not download the model. Existing Nexus settings are unchanged.",
      );
    const reader = r.body.getReader(),
      decoder = new TextDecoder();
    let pending = "",
      lastStatus = "";
    const report = (line) => {
      if (!line.trim()) return;
      const item = JSON.parse(line);
      if (item.error)
        throw new Error(
          `Model download failed: ${String(item.error).slice(0, 200)}`,
        );
      if (item.status && item.status !== lastStatus) {
        console.log(item.status);
        lastStatus = item.status;
      }
    };
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let newline;
        while ((newline = pending.indexOf("\n")) >= 0) {
          report(pending.slice(0, newline));
          pending = pending.slice(newline + 1);
        }
      }
      pending += decoder.decode();
      report(pending);
    } finally {
      await reader.cancel().catch(() => {});
    }
    models = await tags();
    if (!models?.some((item) => item.name === model))
      throw new Error(
        "Model download was not confirmed. Existing Nexus settings are unchanged.",
      );
  } else console.log("Selected model is already installed; skipping download.");
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const temporary = target + `.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await fs.writeFile(
      temporary,
      JSON.stringify({ version: 1, model }, null, 2),
      { mode: 0o600, flag: "wx" },
    );
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  console.log(
    "Nexus local AI configured. Refresh /nexus and use Auto. No app restart or .env editing is needed.",
  );
  if (process.env.GW_NEXUS_MODEL && process.env.GW_NEXUS_MODEL !== model)
    console.log(
      "GW_NEXUS_MODEL overrides this saved choice; update that environment setting if needed.",
    );
}
await main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
