$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Select the OAuth web-client JSON downloaded from Google Cloud'
$dialog.Filter = 'Google OAuth JSON (*.json)|*.json'
if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { Write-Host 'Setup cancelled. No changes made.'; exit 0 }
$raw = Get-Content -LiteralPath $dialog.FileName -Raw | ConvertFrom-Json
$client = $raw.web
$redirect = 'http://localhost:3000/api/sync/google/callback'
if (!$client -or !$client.client_id -or !$client.client_secret -or !$client.client_id.EndsWith('.apps.googleusercontent.com') -or $redirect -notin $client.redirect_uris) {
  throw 'Choose a Google Web application OAuth client JSON with the exact Nexus localhost redirect. See docs/google-calendar.md.'
}
$root = Split-Path $PSScriptRoot -Parent
$private = if ($env:GW_SYNC_DATA_DIR) { $env:GW_SYNC_DATA_DIR } else { Join-Path $root '.gulf-wing' }
New-Item -ItemType Directory -Path $private -Force | Out-Null
$target = Join-Path $private 'google-oauth.json'
$value = @{ clientId = $client.client_id; clientSecret = $client.client_secret } | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText($target, $value, (New-Object System.Text.UTF8Encoding($false)))
Write-Host 'Google OAuth client saved privately on this laptop. No account is connected yet.'
Write-Host 'Open http://localhost:3000/nexus then Connections, Refresh Google status, Connect Google Calendar.'
Write-Host 'Keep the downloaded client JSON private. Do not upload it or paste its contents into chat.'
