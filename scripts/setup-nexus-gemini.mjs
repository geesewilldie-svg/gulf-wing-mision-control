import { promises as fs } from "node:fs";
import path from "node:path";
import {
  availablePublicModels,
  writePublicConfig,
  validatePublicConfig,
  parseGeminiSetupInput,
  safeGeminiSetupDiagnostic,
} from "./gemini-public-lib.mjs";
const action = process.argv[2];
try {
  if (action === "--disable") {
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
    const v = parseGeminiSetupInput(Buffer.concat(chunks));
    if (action === "--models")
      console.log(
        JSON.stringify({
          ok: true,
          models: await availablePublicModels(v.key),
        }),
      );
    else if (action === "--save") {
      await writePublicConfig(v);
      console.log(
        JSON.stringify({
          ok: true,
          message:
            "Public-only Gemini configured. No document, history or billing setting was submitted. Open Nexus > Gemini Public.",
        }),
      );
    } else throw Error();
  }
} catch (error) {
  const diagnostic = safeGeminiSetupDiagnostic(error);
  if (action === "--disable")
    console.log(
      diagnostic.code + ": " + diagnostic.message + " " + diagnostic.next,
    );
  else console.log(JSON.stringify({ ok: false, diagnostic }));
  process.exitCode = 1;
}
