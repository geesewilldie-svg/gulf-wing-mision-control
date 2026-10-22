const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-setup-test-"));
  let models = [],
    pulls = 0;
  const server = http.createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/tags")
      return response.end(JSON.stringify({ models }));
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const data = JSON.parse(body);
      if (data.model === "unavailable:1") {
        response.statusCode = 500;
        response.end(JSON.stringify({ error: "fixture failure" }));
        return;
      }
      pulls++;
      models = [...models, { name: data.model }];
      response.end(
        JSON.stringify({ status: "pulling manifest" }) +
          "\n" +
          JSON.stringify({ status: "success" }) +
          "\n",
      );
    });
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(11434, "127.0.0.1", resolve);
    });
    const invoke = (model) =>
      run(
        process.execPath,
        ["scripts/setup-local-ai.mjs", ...(model ? [model] : [])],
        {
          env: { ...process.env, GW_SYNC_DATA_DIR: root, GW_NEXUS_MODEL: "" },
          timeout: 15000,
        },
      );
    await invoke();
    const file = path.join(root, "nexus-config.json");
    const saved = await fs.readFile(file, "utf8");
    assert.deepEqual(JSON.parse(saved), { version: 1, model: "qwen2.5:1.5b" });
    assert.equal(pulls, 1);
    await invoke();
    assert.equal(pulls, 1, "Repeated setup must not download again");
    await assert.rejects(invoke("unavailable:1"));
    assert.equal(
      await fs.readFile(file, "utf8"),
      saved,
      "A failed download must preserve configuration",
    );
    await assert.rejects(invoke("https://example.com/model"));
    assert.equal(await fs.readFile(file, "utf8"), saved);
    await fs.writeFile(file, "not-json");
    await assert.rejects(invoke());
    assert.equal(await fs.readFile(file, "utf8"), "not-json");
    console.log(
      "Local AI setup: download, private configuration, idempotence, failure preservation and validation passed with a synthetic Ollama service.",
    );
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
