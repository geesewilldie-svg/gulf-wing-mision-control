$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Write-Host 'Choose only a business folder or Obsidian vault whose contents may be read by paired Nexus controllers.'
Write-Host 'Supported: Markdown, text, PDF and XLSX. This is local read-only indexing; originals are not edited.'
$kind = Read-Host 'Type obsidian for a Markdown vault, or folder for business documents'
if ($kind -notin @('obsidian', 'folder')) { Write-Host 'Cancelled. Choose obsidian or folder next time.'; exit 0 }
$label = Read-Host 'Short name to show in Nexus (for example Gulf Wing Documents)'
if ([string]::IsNullOrWhiteSpace($label)) { Write-Host 'Cancelled. No label entered.'; exit 0 }
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Choose a specific business folder or Obsidian vault for Nexus read-only search'
$dialog.ShowNewFolderButton = $false
if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { Write-Host 'Cancelled. No changes made.'; exit 0 }
& node (Join-Path $PSScriptRoot 'setup-nexus-folders.mjs') $dialog.SelectedPath $kind $label
exit $LASTEXITCODE
