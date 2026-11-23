import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { prepareCopilotProfile } from "../scripts/copilot-profile-lib.mjs";
import {
  checkCopilotAccess,
  copilotTestArguments,
  COPILOT_TEST_PROMPT,
  runCopilotTestProcess,
} from "../scripts/copilot-check-lib.mjs";

async function fixture(run: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "nexus-copilot-check-"));
  try {
    const installed = path.join(dir, "installed");
    await fs.mkdir(installed);
    const entry = path.join(installed, "npm-loader.js");
    await fs.writeFile(
      entry,
      "throw Error('Synthetic fixture never executes');",
    );
    await fs.writeFile(
      path.join(installed, "package.json"),
      JSON.stringify({
        name: "@github/copilot",
        version: "1.0.114",
        bin: { copilot: "npm-loader.js" },
      }),
    );
    await prepareCopilotProfile(dir, entry, "win32");
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
test("fixed Copilot test requires confirmation, denies tools, isolates work and deduplicates usage", async () =>
  fixture(async (dir) => {
    let calls = 0;
    const args = copilotTestArguments("fixture");
    expect(args.at(-1)).toBe(COPILOT_TEST_PROMPT);
    expect(args).toContain("--available-tools");
    expect(
      args.slice(
        args.indexOf("--available-tools"),
        args.indexOf("--max-ai-credits"),
      ),
    ).toEqual([
      "--available-tools",
      "--deny-tool",
      "read",
      "write",
      "shell",
      "memory",
      "url",
    ]);
    expect(args).toContain("--disable-builtin-mcps");
    expect(args).toContain("--sync-session=off");
    expect(args).not.toContain("--allow-all");
    expect(args).not.toContain("--trust-folder");
    const run = async (plan: any) => {
      calls++;
      expect(plan.cwd.startsWith(dir)).toBe(false);
      expect(plan.env.COPILOT_HOME).toBe(path.join(dir, "copilot-profile"));
      expect(await fs.readdir(plan.cwd)).toEqual([]);
      return "NEXUS_COPILOT_OK\n";
    };
    await expect(
      checkCopilotAccess({
        dataDir: dir,
        confirmed: false,
        platform: "win32",
        run,
      }),
    ).rejects.toThrow("confirmation");
    expect(calls).toBe(0);
    expect(
      (
        await checkCopilotAccess({
          dataDir: dir,
          confirmed: true,
          platform: "win32",
          run,
        })
      ).state,
    ).toBe("verified");
    await expect(
      checkCopilotAccess({
        dataDir: dir,
        confirmed: true,
        platform: "win32",
        run,
      }),
    ).rejects.toThrow("already reserved");
    expect(calls).toBe(1);
  }));
test("additional settings, MCP and hooks withhold the fixed test without modifying the profile", async () =>
  fixture(async (dir) => {
    let calls = 0;
    const run = async () => {
      calls++;
      return "NEXUS_COPILOT_OK";
    };
    for (const name of ["mcp-config.json", "settings.json", "providers.json"]) {
      const file = path.join(dir, "copilot-profile", name);
      await fs.writeFile(file, "{}");
      await expect(
        checkCopilotAccess({
          dataDir: dir,
          confirmed: true,
          platform: "win32",
          run,
        }),
      ).rejects.toThrow("withheld");
      expect(await fs.readFile(file, "utf8")).toBe("{}");
      await fs.rm(file);
    }
    const config = path.join(dir, "copilot-profile", "config.json");
    await fs.writeFile(
      config,
      JSON.stringify({ hooks: { command: "PRIVATE_COMMAND" } }),
    );
    await expect(
      checkCopilotAccess({
        dataDir: dir,
        confirmed: true,
        platform: "win32",
        run,
      }),
    ).rejects.toThrow("withheld");
    expect(calls).toBe(0);
    expect(
      (await fs.readdir(dir)).some((name) =>
        name.startsWith("copilot-access-check"),
      ),
    ).toBe(false);
  }));
test("failures and unexpected output preserve the daily reservation and withhold provider text", async () =>
  fixture(async (dir) => {
    const date = new Date("2026-11-23T12:00:00Z");
    const receipt = await checkCopilotAccess({
      dataDir: dir,
      confirmed: true,
      platform: "win32",
      now: date,
      run: async () => {
        throw Error("PRIVATE_PROVIDER_OUTPUT");
      },
    });
    expect(receipt.state).toBe("unconfirmed");
    expect(JSON.stringify(receipt)).not.toContain("PRIVATE_PROVIDER_OUTPUT");
    await expect(
      checkCopilotAccess({
        dataDir: dir,
        confirmed: true,
        platform: "win32",
        now: date,
        run: async () => "NEXUS_COPILOT_OK",
      }),
    ).rejects.toThrow("reserved");
    const next = await checkCopilotAccess({
      dataDir: dir,
      confirmed: true,
      platform: "win32",
      now: new Date("2026-11-24T12:00:00Z"),
      run: async () => "PRIVATE_UNEXPECTED_OUTPUT",
    });
    expect(next.state).toBe("unexpected-reply");
    expect(JSON.stringify(next)).not.toContain("PRIVATE_UNEXPECTED_OUTPUT");
  }));

test("test transport bounds output and withholds child diagnostics", async () => {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "nexus-copilot-transport-"));
  try {
    expect(
      await runCopilotTestProcess({
        args: ["-e", "process.stdout.write('NEXUS_COPILOT_OK')"],
        cwd: dir,
        env: {},
      }),
    ).toBe("NEXUS_COPILOT_OK");
    await expect(
      runCopilotTestProcess({
        args: [
          "-e",
          "process.stderr.write('PRIVATE_DIAGNOSTIC');process.exit(1)",
        ],
        cwd: dir,
        env: {},
      }),
    ).rejects.toThrow("did not return a confirmed result");
    await expect(
      runCopilotTestProcess({
        args: [
          "-e",
          "process.stdout.write('x'.repeat(70000));setInterval(()=>{},1000)",
        ],
        cwd: dir,
        env: {},
      }),
    ).rejects.toThrow("confirmed result");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
