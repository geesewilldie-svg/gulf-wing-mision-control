import { promises as fs } from "node:fs";
import path from "node:path";
import {
  availablePublicModels,
  writePublicConfig,
  validatePublicConfig,
} from "./gemini-public-lib.mjs";
try {
  if (process.argv[2] === "--disable") {
    const root = process.env.GW_SYNC_DATA_DIR || path.resolve(".gulf-wing"),
      v = validatePublicConfig(
        JSON.parse(
          await fs.readFile(path.join(root, "gemini-public.json"), "utf8"),
        ),
      );
    await writePublicConfig({ ...v, enabled: false }, root);
    console.log(
      "Public Gemini disabled. Private-context Gemini remains blocked while this policy file exists.",
    );
  } else {
    const chunks = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 30000) throw Error();
      chunks.push(chunk);
    }
    const v = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (process.argv[2] === "--models")
      console.log(JSON.stringify(await availablePublicModels(v.key)));
    else if (process.argv[2] === "--save") {
      await writePublicConfig(v);
      console.log(
        "Public-only Gemini configured. No document, history or billing setting was submitted. Open Nexus > Gemini Public.",
      );
    } else throw Error();
  }
} catch {
  console.error(
    "Gemini setup did not complete. No secret or provider error body is shown. Check the key/model and retry; existing configuration is preserved.",
  );
  process.exitCode = 1;
}
