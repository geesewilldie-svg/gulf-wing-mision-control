[CmdletBinding()]
param([switch]$AtSignIn, [switch]$RemoveSignIn)
$ErrorActionPreference = 'Stop'
if ($AtSignIn -and $RemoveSignIn) { throw 'Choose AtSignIn or RemoveSignIn, not both.' }
$root = Split-Path -Parent $PSScriptRoot
$node = Get-Command node.exe -ErrorAction Stop
$script = Join-Path $PSScriptRoot 'start-nexus.mjs'
if (-not (Test-Path -LiteralPath $script)) { throw 'Nexus launcher file is missing.' }
$shell = New-Object -ComObject WScript.Shell
$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Start Nexus.lnk'
$startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'Gulf Wing Nexus.lnk'
function Write-NexusShortcut([string]$file, [bool]$quiet) {
  $shortcut = $shell.CreateShortcut($file)
  $shortcut.TargetPath = $node.Source
  $shortcut.Arguments = '"' + $script + '"'
  if ($quiet) { $shortcut.Arguments += ' --no-browser' }
  $shortcut.WorkingDirectory = $root
  $shortcut.Description = 'Start local Mission Control, Ollama and Nexus voice. No automatic microphone recording.'
  $shortcut.WindowStyle = 7
  $shortcut.Save()
}
Write-NexusShortcut $desktop $false
Write-Host 'Desktop shortcut created: Start Nexus'
if ($AtSignIn) {
  Write-NexusShortcut $startup $true
  Write-Host 'Enabled for this Windows user at sign-in. No administrator access or scheduled task was added.'
}
if ($RemoveSignIn) {
  if (Test-Path -LiteralPath $startup) { Remove-Item -LiteralPath $startup }
  Write-Host 'Nexus sign-in shortcut removed. Running processes were not stopped.'
}
Write-Host 'Double-click Start Nexus to open the browser. Startup mode keeps the browser and microphone closed.'
