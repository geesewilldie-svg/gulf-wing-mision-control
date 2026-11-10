$ErrorActionPreference = 'Stop'
Write-Host 'Nexus Gemini Public: general non-sensitive questions only. Google free-tier inputs/outputs may be used for product improvement and reviewed by humans.'
Write-Host 'Private business sources and history are excluded. Keep the project on Free tier; this setup cannot check or change Google billing.'
$secureKey = Read-Host 'Paste the Gemini API key here (hidden; do not paste it into chat)' -AsSecureString
$pointer = [IntPtr]::Zero
try {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
  $keyText = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)).Trim()
  $inputJson = @{ key = $keyText } | ConvertTo-Json -Compress
  $output = $inputJson | & node (Join-Path $PSScriptRoot 'setup-nexus-gemini.mjs') --models
  $modelExitCode = $LASTEXITCODE
  $result = $output | ConvertFrom-Json
  if ($modelExitCode -ne 0 -or !$result.ok) {
    Write-Host ("Gemini diagnosis: " + $result.diagnostic.code)
    if ($result.diagnostic.httpStatus) { Write-Host ("HTTP status: " + $result.diagnostic.httpStatus) }
    if ($null -ne $result.diagnostic.availableModels) { Write-Host ("Generate-content models returned: " + $result.diagnostic.availableModels) }
    Write-Host $result.diagnostic.message
    Write-Host $result.diagnostic.next
    Write-Host 'Existing setup was preserved. You may share these diagnostic lines, but never the API key.'
    exit 1
  }
  $normalizedKey = ConvertTo-SecureString $keyText -AsPlainText -Force
  $protectedKey = ConvertFrom-SecureString $normalizedKey
  $models = @($result.models)
  if ($models.Count -eq 0) { throw 'No supported model found.' }
  Write-Host 'Available supported models:'
  for ($index = 0; $index -lt $models.Count; $index++) { Write-Host "$($index + 1). $($models[$index])" }
  $choice = Read-Host 'Enter the model number (press Enter for 1)'
  if ([string]::IsNullOrWhiteSpace($choice)) { $choice = '1' }
  if ($choice -notmatch '^\d+$' -or [int]$choice -lt 1 -or [int]$choice -gt $models.Count) { throw 'Invalid model number. No configuration saved.' }
  $value = @{ version = 1; policy = 'public-only'; enabled = $true; secretType = 'windows-dpapi'; protectedKey = $protectedKey; model = $models[[int]$choice - 1]; dailyLimit = 10 } | ConvertTo-Json -Compress
  $saveOutput = $value | & node (Join-Path $PSScriptRoot 'setup-nexus-gemini.mjs') --save
  $saveExitCode = $LASTEXITCODE
  $saved = $saveOutput | ConvertFrom-Json
  if ($saveExitCode -ne 0 -or !$saved.ok) {
    Write-Host ("Gemini diagnosis: " + $saved.diagnostic.code)
    Write-Host $saved.diagnostic.message
    Write-Host $saved.diagnostic.next
    exit 1
  }
  Write-Host $saved.message
  Write-Host 'The key is protected for this Windows user with DPAPI. No generation request was sent; model listing used your key only with Google.'
} finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $keyText = $null
  $inputJson = $null
  $secureKey = $null
  $normalizedKey = $null
}
