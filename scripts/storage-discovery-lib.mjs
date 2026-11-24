import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

// Fixed local metadata query. No user paths or names are interpolated into code.
export const storageQuery = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$drives = @(Get-CimInstance Win32_LogicalDisk | ForEach-Object {
  [pscustomobject]@{ path = ($_.DeviceID + '\'); label = [string]$_.VolumeName; type = [int]$_.DriveType; size = [string]$_.Size; free = [string]$_.FreeSpace }
})
$folders = @()
foreach ($name in @('Desktop','MyDocuments','MyPictures','MyMusic','MyVideos')) {
  $value = [Environment]::GetFolderPath([Environment+SpecialFolder]::$name)
  if ($value) { $folders += [pscustomobject]@{ name = $name; path = $value } }
}
try {
  $shell = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders'
  $downloads = $shell.'{374DE290-123F-4565-9164-39C4925E467B}'
  if ($downloads) { $folders += [pscustomobject]@{ name = 'Downloads'; path = [Environment]::ExpandEnvironmentVariables($downloads) } }
} catch {}
foreach ($name in @('OneDrive','OneDriveConsumer','OneDriveCommercial')) {
  $value = [Environment]::GetEnvironmentVariable($name)
  if ($value) { $folders += [pscustomobject]@{ name = $name; path = $value } }
}
[pscustomobject]@{ version = 1; drives = $drives; folders = $folders } | ConvertTo-Json -Depth 4 -Compress
`;
const absolute = (value) =>
  typeof value === "string" &&
  value.length <= 1024 &&
  !/[\x00-\x1f\x7f]/.test(value) &&
  path.win32.isAbsolute(value) &&
  /^(?:[a-z]:\\|\\\\[^\\]+\\[^\\]+(?:\\|$))/i.test(value) &&
  !/^\\\\[?.]\\/.test(value);
const text = (value) =>
  typeof value === "string" &&
  value.length <= 200 &&
  !/[\x00-\x1f\x7f]/.test(value);
const bytes = (value) =>
  typeof value === "string" && /^\d{1,20}$/.test(value) ? value : null;
export function parseStorageInventory(raw) {
  if (typeof raw !== "string" || raw.length > 256_000)
    throw Error("Invalid storage inventory.");
  const result = JSON.parse(raw.replace(/^\uFEFF/, ""));
  if (
    result?.version !== 1 ||
    !Array.isArray(result.drives) ||
    !Array.isArray(result.folders) ||
    result.drives.length > 26 ||
    result.folders.length > 20
  )
    throw Error("Invalid storage inventory.");
  const types = {
    0: "unknown",
    1: "no-root",
    2: "removable",
    3: "fixed",
    4: "network",
    5: "optical",
    6: "ram",
  };
  const drives = result.drives.map((drive) => {
    if (
      !drive ||
      !/^[a-z]:\\$/i.test(drive.path) ||
      !text(drive.label) ||
      !Number.isInteger(drive.type) ||
      !Object.hasOwn(types, drive.type)
    )
      throw Error("Invalid drive metadata.");
    return {
      path: drive.path,
      label: drive.label,
      kind: types[drive.type],
      sizeBytes: bytes(drive.size),
      freeBytes: bytes(drive.free),
    };
  });
  const names = new Set([
    "Desktop",
    "MyDocuments",
    "MyPictures",
    "MyMusic",
    "MyVideos",
    "Downloads",
    "OneDrive",
    "OneDriveConsumer",
    "OneDriveCommercial",
  ]);
  const folders = result.folders.map((folder) => {
    if (!folder || !names.has(folder.name) || !absolute(folder.path))
      throw Error("Invalid folder metadata.");
    return { name: folder.name, path: folder.path };
  });
  return {
    version: 1,
    drives,
    folders,
    contentScanned: false,
    accessGranted: false,
  };
}
export async function discoverWindowsStorage({
  platform = process.platform,
  run = promisify(execFile),
} = {}) {
  if (platform !== "win32") throw Error("Run this on the Windows laptop.");
  const { stdout } = await run(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(storageQuery, "utf16le").toString("base64"),
    ],
    { timeout: 15000, maxBuffer: 256000, windowsHide: true, encoding: "utf8" },
  );
  return parseStorageInventory(stdout);
}
