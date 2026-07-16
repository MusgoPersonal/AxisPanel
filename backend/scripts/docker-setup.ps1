$ErrorActionPreference = "Continue"
$scriptPath = "C:\AxisPanel\backend\scripts\docker-admin.ps1"

$v = docker info --format "{{.ServerVersion}}" 2>$null
if (-not $v) {
  Write-Host "[SETUP] Docker requires admin. Launching admin PowerShell..."
  Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -Action pull" -Wait
  Write-Host "[SETUP] Admin PowerShell completed. Check if Docker image was pulled."
} else {
  Write-Host "[SETUP] Docker OK: $v"
  & $scriptPath -Action pull
}
