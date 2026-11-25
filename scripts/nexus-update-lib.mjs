import path from "node:path";
export const updateBranch = "feat/nexus-agent-router";
export function nextServerPattern(repo) {
  const escaped = path.win32
    .join(repo, "node_modules", "next", "dist", "bin", "next")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `^(?:"[^\"]*node\\.exe"|[^\\s\"]*node\\.exe)\\s+"?${escaped}"?\\s+start(?:\\s|$)`;
}
// Next rewrites only these generated type-reference paths between dev/build.
export function sameGeneratedNextEnvironment(before, after) {
  const normalize = (value) =>
    value
      .replace(/\r\n/g, "\n")
      .replace(
        /"\.\/\.next\/(?:dev\/)?types\/(routes|root-params)\.d\.ts"/g,
        '"./.next/types/$1.d.ts"',
      );
  return (
    typeof before === "string" &&
    typeof after === "string" &&
    normalize(before) === normalize(after)
  );
}
// Fixed local query: the regex is data in a task-specific environment variable.
export const stopOwnedNextScript = String.raw`
$ErrorActionPreference='Stop'
$owned=@(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -match $env:NEXUS_UPDATE_PATTERN })
foreach($item in $owned) {
  $current=Get-CimInstance Win32_Process -Filter ("ProcessId = " + [int]$item.ProcessId)
  if($current -and $current.CommandLine -eq $item.CommandLine -and $current.CreationDate -eq $item.CreationDate) { Stop-Process -Id $item.ProcessId -ErrorAction Stop }
}
`;
export async function updateNexus(io) {
  if ((await io.branch()) !== updateBranch)
    throw Error(
      `Update requires branch ${updateBranch}. No branch was changed.`,
    );
  if (await io.dirty())
    throw Error(
      "Tracked local edits exist. Update stopped before changing files or services.",
    );
  io.log("Pulling the existing Nexus feature branch…");
  await io.pull(updateBranch);
  await io.stopOwnedServer();
  if (!(await io.portFree()))
    throw Error(
      "Port 3000 is still occupied. Build was not started; inspect the local process.",
    );
  if (await io.dependenciesChanged()) {
    io.log("Installing locked application dependencies…");
    await io.dependencies();
  }
  io.log("Building Nexus…");
  await io.build();
  io.log("Restarting services through the existing launcher…");
  await io.start();
  await io.verifyAssets();
  await io.saveSuccess();
  io.log("Nexus update finished. Refresh the page with Ctrl+Shift+R.");
}

export async function verifyNexusAssets(fetcher = fetch) {
  const origin = "http://127.0.0.1:3000";
  const page = await fetcher(origin + "/nexus", {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!page.ok) throw Error("Nexus page readiness check failed.");
  const html = await page.text();
  const assets = [
    ...new Set(
      [
        ...html.matchAll(
          /(?:src|href)="(\/_next\/static\/[^"<>]+\.(?:js|css)(?:\?[^"<>]*)?)"/g,
        ),
      ].map((match) => match[1]),
    ),
  ];
  if (
    !assets.length ||
    assets.length > 60 ||
    !assets.some((asset) => /\.css(?:\?|$)/.test(asset)) ||
    !assets.some((asset) => /\.js(?:\?|$)/.test(asset))
  )
    throw Error(
      "Nexus page did not expose a bounded built JavaScript/CSS asset set.",
    );
  for (const asset of assets) {
    const url = new URL(asset, origin);
    if (url.origin !== origin || !url.pathname.startsWith("/_next/static/"))
      throw Error("Unexpected app asset path.");
    const response = await fetcher(url.href, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const mime = response.headers.get("content-type") || "";
    const expected = /\.css$/.test(url.pathname)
      ? /text\/css/i
      : /(?:javascript|ecmascript)/i;
    await response.body?.cancel();
    if (!response.ok || !expected.test(mime))
      throw Error(
        "Built JavaScript/CSS could not be served. Inspect local launcher logs before retrying.",
      );
  }
  return assets.length;
}
