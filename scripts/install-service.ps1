# AxisPanel Windows Service Installer
# Run this script as Administrator to install AxisPanel as a Windows Service

$ErrorActionPreference = 'Stop'
$AxisRoot = 'C:\AxisPanel'
$NssmUrl = 'https://github.com/nssm/nssm/releases/download/v2.24/nssm-2.24.zip'
$NssmZip = "$env:TEMP\nssm-2.24.zip"
$NssmDir = "$AxisRoot\nssm"

# Ensure logs directory
New-Item -ItemType Directory -Path "$AxisRoot\logs" -Force | Out-Null

# Find Node.js
$NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $NodeExe) {
  $NodeExe = "$env:ProgramFiles\nodejs\node.exe"
  if (-not (Test-Path $NodeExe)) {
    $NodeExe = "${env:ProgramFiles(x86)}\nodejs\node.exe"
  }
  if (-not (Test-Path $NodeExe)) {
    Write-Error "Node.js no encontrado. Instalá Node.js primero."
    exit 1
  }
}

Write-Host "Node.js: $NodeExe"

# Download nssm if not present
if (-not (Test-Path "$NssmDir\nssm.exe")) {
  Write-Host "Descargando nssm desde $NssmUrl ..."
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $NssmUrl -OutFile $NssmZip -UseBasicParsing
  Expand-Archive -Path $NssmZip -DestinationPath $NssmDir -Force
  Get-ChildItem "$NssmDir\nssm-*\win64\nssm.exe" | Move-Item -Destination "$NssmDir\nssm.exe" -Force
  Remove-Item "$NssmDir\nssm-*" -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item $NssmZip -Force -ErrorAction SilentlyContinue
  Write-Host "nssm descargado en $NssmDir\nssm.exe"
}

$Nssm = "$NssmDir\nssm.exe"
if (-not (Test-Path $Nssm)) {
  Write-Error "nssm.exe no encontrado en $Nssm"
  exit 1
}

Write-Host "Instalando servicio AxisPanel..."

# Stop and remove existing service if present
& $Nssm stop AxisPanel 2>$null | Out-Null
& $Nssm remove AxisPanel confirm 2>$null | Out-Null

# Install as Windows Service
& $Nssm install AxisPanel $NodeExe "$AxisRoot\backend\server.js"

# Configure service
& $Nssm set AxisPanel AppDirectory $AxisRoot
& $Nssm set AxisPanel AppStdout "$AxisRoot\logs\service.log"
& $Nssm set AxisPanel AppStderr "$AxisRoot\logs\service-error.log"
& $Nssm set AxisPanel AppRotateFiles 1
& $Nssm set AxisPanel AppRotateOnline 1
& $Nssm set AxisPanel AppRotateSeconds 86400
& $Nssm set AxisPanel AppRotateBytes 10485760
& $Nssm set AxisPanel Start SERVICE_AUTO_START
& $Nssm set AxisPanel ObjectName LocalSystem
& $Nssm set AxisPanel AppThrottle 1500
& $Nssm set AxisPanel AppRestartDelay 5000
& $Nssm set AxisPanel AppEnvironmentExtra "AXIS_PORT=3030"

Write-Host "Servicio instalado. Iniciando..."
& $Nssm start AxisPanel

Start-Sleep -Seconds 3

# Verify
$svc = Get-Service AxisPanel -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running') {
  Write-Host "✅ AxisPanel service installed and running on http://localhost:3030"
  Write-Host "   To stop:  nssm stop AxisPanel"
  Write-Host "   To remove: nssm remove AxisPanel confirm"
} else {
  Write-Host "❌ Service status: $($svc.Status)"
  Write-Host "   Check logs: $AxisRoot\logs\service.log"
}
