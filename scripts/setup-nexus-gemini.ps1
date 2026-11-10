$ErrorActionPreference = 'Stop'
Write-Host 'Nexus Gemini Public: general non-sensitive questions only. Google free-tier inputs/outputs may be used for product improvement and reviewed by humans.'
Write-Host 'Private business sources and history are excluded. Keep the project on Free tier; this setup cannot check or change Google billing.'
$secureKey = Read-Host 'Paste the Gemini API key here (hidden; do not paste it into chat)' -AsSecureString
$pointer = [IntPtr]::Zero
try {
  $protectedKey = ConvertFrom-SecureString $secureKey
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
  $keyText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $inputJson = @{ key = $keyText } | ConvertTo-Json -Compress
  $output = $inputJson | & node (Join-Path $PSScriptRoot 'setup-nexus-gemini.mjs') --models
  if ($LASTEXITCODE -ne 0) { throw 'Model listing failed. Existing setup is unchanged.' }
  $models = @($output | ConvertFrom-Json)
  if ($models.Count -eq 0) { throw 'No supported model found.' }
  Write-Host 'Available supported models:'
  for ($index = 0; $index -lt $models.Count; $index++) { Write-Host "$($index + 1). $($models[$index])" }
  $choice = Read-Host 'Enter the model number (press Enter for 1)'
  if ([string]::IsNullOrWhiteSpace($choice)) { $choice = '1' }
  if ($choice -notmatch '^\d+$' -or [int]$choice -lt 1 -or [int]$choice -gt $models.Count) { throw 'Invalid model number. No configuration saved.' }
  $value = @{ version = 1; policy = 'public-only'; enabled = $true; secretType = 'windows-dpapi'; protectedKey = $protectedKey; model = $models[[int]$choice - 1]; dailyLimit = 10 } | ConvertTo-Json -Compress
  $value | & node (Join-Path $PSScriptRoot 'setup-nexus-gemini.mjs') --save
  if ($LASTEXITCODE -ne 0) { throw 'Configuration was not saved.' }
  Write-Host 'The key is protected for this Windows user with DPAPI. No generation request was sent; model listing used your key only with Google.'
} finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $keyText = $null
  $inputJson = $null
  $secureKey = $null
}
