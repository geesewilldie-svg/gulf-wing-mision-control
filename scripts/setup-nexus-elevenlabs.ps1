$ErrorActionPreference = 'Stop'
Write-Host 'Nexus ElevenLabs voice: Stephanie (oT5lntmfa8t37GiBBd3k).'
Write-Host 'Cloud speech sends text, including private assistant replies, to ElevenLabs. Paid API credits may be used.'
Write-Host 'Check API pricing, the voice terms and provider privacy settings in your ElevenLabs account before continuing.'
Write-Host 'This setup checks voice metadata only. It does not purchase credits or generate speech.'
$consent = Read-Host 'Type YES to enable this optional cloud voice with those terms'
if ($consent -cne 'YES') { Write-Host 'Setup cancelled. Existing configuration unchanged.'; exit }
$limitText = Read-Host 'Daily character limit, shared by all paired controllers (100-100000; Enter for 1000)'
if ([string]::IsNullOrWhiteSpace($limitText)) { $limitText = '1000' }
$limit = 0
if (![int]::TryParse($limitText, [ref]$limit) -or $limit -lt 100 -or $limit -gt 100000) { throw 'Invalid daily character limit. Nothing changed.' }
Write-Host 'This is an application character limit, not a dollar cap or a limit on other ElevenLabs apps. Failed/cancelled attempts can consume allowance.'
$key = Read-Host 'Paste the ElevenLabs API key here (hidden; never into chat)' -AsSecureString
$pointer = [IntPtr]::Zero
try {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($key)
  $plain = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)).Trim()
  $inputValue = @{ key = $plain } | ConvertTo-Json -Compress
  $resultText = $inputValue | & node (Join-Path $PSScriptRoot 'setup-nexus-elevenlabs.mjs') --check
  $checkCode = $LASTEXITCODE
  $result = $resultText | ConvertFrom-Json
  if ($checkCode -ne 0 -or !$result.ok) { Write-Host $result.message; exit 1 }
  $protected = ConvertFrom-SecureString (ConvertTo-SecureString $plain -AsPlainText -Force)
  $config = @{ version = 1; enabled = $true; secretType = 'windows-dpapi'; protectedKey = $protected; voiceId = 'oT5lntmfa8t37GiBBd3k'; model = 'eleven_flash_v2_5'; dailyCharacters = $limit; cloudSpeechAccepted = $true } | ConvertTo-Json -Compress
  $savedText = $config | & node (Join-Path $PSScriptRoot 'setup-nexus-elevenlabs.mjs') --save
  $saveCode = $LASTEXITCODE
  $saved = $savedText | ConvertFrom-Json
  if ($saveCode -ne 0 -or !$saved.ok) { Write-Host $saved.message; exit 1 }
  Write-Host 'Stephanie configured. Key protected for this Windows user with DPAPI. No speech generation was requested.'
  Write-Host 'In Nexus voice settings, refresh status, choose ElevenLabs Stephanie and allow cloud speech for the session.'
} finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $plain = $null; $inputValue = $null; $key = $null
}
