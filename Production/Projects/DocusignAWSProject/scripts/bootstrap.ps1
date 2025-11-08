Param(
  [string]$AwsProfile = "lambda-admin",
  [string]$AwsRegion = "us-east-1",
  [string]$GoogleCredsPath = ""
)

# Resolve project root
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Join-Path $ProjectRoot ".." | Resolve-Path | Select-Object -ExpandProperty Path

Write-Host "Project root:" $ProjectRoot

# Set environment
$env:AWS_PROFILE = $AwsProfile
$env:AWS_DEFAULT_REGION = $AwsRegion
if ($GoogleCredsPath -and (Test-Path $GoogleCredsPath)) {
  $env:GOOGLE_APPLICATION_CREDENTIALS = (Resolve-Path $GoogleCredsPath).Path
  Write-Host "GOOGLE_APPLICATION_CREDENTIALS set."
} else {
  if ($GoogleCredsPath) {
    Write-Warning "Google creds path not found: $GoogleCredsPath"
  }
}

# Move to project root
Set-Location $ProjectRoot

# Optional: open VS Code (comment out if not needed)
try {
  code . | Out-Null
} catch {
  Write-Host "VS Code not detected in PATH. Skipping."
}

Write-Host "Environment ready. Current directory:" (Get-Location)
Write-Host "AWS_PROFILE=$env:AWS_PROFILE AWS_DEFAULT_REGION=$env:AWS_DEFAULT_REGION"
if ($env:GOOGLE_APPLICATION_CREDENTIALS) { Write-Host "GOOGLE_APPLICATION_CREDENTIALS=$env:GOOGLE_APPLICATION_CREDENTIALS" }
