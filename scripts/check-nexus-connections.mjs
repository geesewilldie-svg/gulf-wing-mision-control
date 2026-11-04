import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function checkConnections({
  root = process.cwd(),
  env = process.env,
  fetcher = fetch,
  output = console.log,
} = {}) {
  let issues = 0;
  const say = (status, label, detail) =>
    output(`${status.padEnd(6)}${label}: ${detail}`);
  const dataDir = path.resolve(
    env.GW_SYNC_DATA_DIR || path.join(root, ".gulf-wing"),
  );
  output(
    "Nexus connection check — localhost only; no model prompts, account logins or credentials displayed.\n",
  );
  async function json(url) {
    const result = await fetcher(url, {
      signal: AbortSignal.timeout(3000),
      redirect: "error",
    });
    if (!result.ok) throw Error();
    return result.json();
  }
  try {
    const r = await fetcher("http://127.0.0.1:3000/api/sync/agents", {
      signal: AbortSignal.timeout(3000),
      redirect: "error",
    });
    if (r.status === 401 || r.status === 403)
      say(
        "OK",
        "Nexus router",
        "protected route is available; pair as Controller in the browser",
      );
    else if (r.status === 503) {
      say(
        "SETUP",
        "Nexus router",
        "server responded; review pairing and local model configuration in the browser",
      );
      issues++;
    } else {
      say(
        "CHECK",
        "Nexus router",
        "unexpected response; confirm the merged router build is running",
      );
      issues++;
    }
  } catch {
    say("START", "Mission Control", "run npm.cmd run start in the server tab");
    issues++;
  }
  let model = env.GW_NEXUS_MODEL?.trim();
  if (!model) {
    try {
      const config = JSON.parse(
        await fs.readFile(path.join(dataDir, "nexus-config.json"), "utf8"),
      );
      if (
        config.version !== 1 ||
        typeof config.model !== "string" ||
        !/^[a-z0-9][a-z0-9._/-]*(?::[a-z0-9._-]+)?$/i.test(config.model)
      )
        throw Error();
      model = config.model;
    } catch {
      say(
        "SETUP",
        "Local model selection",
        "run npm.cmd run ai:setup if not already configured",
      );
      issues++;
    }
  }
  try {
    const body = await json("http://127.0.0.1:11434/api/tags");
    if (!Array.isArray(body.models)) throw Error();
    if (model && body.models.some((m) => m?.name === model))
      say(
        "OK",
        "Ollama",
        "configured model is installed; inference not exercised",
      );
    else {
      say(
        "SETUP",
        "Ollama",
        "service responds; configured model was not confirmed installed",
      );
      issues++;
    }
  } catch {
    say("START", "Ollama", "local service did not respond");
    issues++;
  }
  try {
    const body = await json("http://127.0.0.1:8766/health");
    if (body.speech === true && body.transcription === true)
      say(
        "OK",
        "Nexus voice",
        "speech and transcription report ready; microphone not exercised",
      );
    else {
      say(
        "CHECK",
        "Nexus voice",
        "worker responds but both capabilities are not ready",
      );
      issues++;
    }
  } catch {
    say(
      "START",
      "Nexus voice",
      "run scripts\\start-nexus-voice.cmd in its own tab if voice is needed",
    );
    issues++;
  }
  say(
    "INFO",
    "External providers",
    "inspect Connections in the paired browser; this check does not read keys or contact providers",
  );
  say(
    "INFO",
    "Cursor",
    "project guidance supplied; use one coding editor per checkout",
  );
  say(
    "HOLD",
    "GrockBot / Manus / OpenClaw",
    "not connected; publisher/interfaces/permissions still require verification",
  );
  output(
    `\n${issues} local setup items. No settings were changed. Open http://localhost:3000/nexus on the laptop.`,
  );
  return issues;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = (await checkConnections()) ? 1 : 0;
}
