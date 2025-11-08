Param(
  [string]$OutDir = "sousan/Production/Projects/DocusignAWSProject/docs/diagrams"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Ensure-Dir($p){ if(-not (Test-Path $p)){ New-Item -ItemType Directory -Force -Path $p | Out-Null } }

Ensure-Dir $OutDir

$technical = "sousan/Production/Projects/DocusignAWSProject/docs/mermaid/flow-technical.mmd"
$staff     = "sousan/Production/Projects/DocusignAWSProject/docs/mermaid/flow-staff.mmd"

if(-not (Test-Path $technical) -or -not (Test-Path $staff)){
  Write-Error "Mermaid source files not found."
}

Write-Host "Rendering diagrams to $OutDir ..."

# Use npx to avoid global install if desired. Requires Node + internet the first time.
$cmd = "npx @mermaid-js/mermaid-cli -t forest"

& cmd /c "$cmd -i `"$technical`" -o `"$OutDir/flow-technical.png`"" 
& cmd /c "$cmd -i `"$staff`"     -o `"$OutDir/flow-staff.png`""

Write-Host "Done. Files:"
Get-ChildItem -File $OutDir | Select-Object Name, Length

