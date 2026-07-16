<#
.SYNOPSIS
    Rotación automática de API keys para Axis Panel / Hermes Agent.
    Compatible con PowerShell Admin.
.DESCRIPTION
    Ejecuta auto_rotate.py y sincroniza el resultado con Hermes config.
    Uso: .\rotate.ps1 [-Force] [-Provider "nombre"]
.PARAMETER Force
    Rotación forzada (salta verificación de umbral)
.PARAMETER Provider
    Cambiar a un proveedor específico (google, openrouter, nvidia, deepseek, xai, opencode, etc.)
.EXAMPLE
    .\rotate.ps1 -Force
    .\rotate.ps1 -Provider opencode
#>

param(
    [switch]$Force,
    [string]$Provider = ""
)

$ScriptPath = "$env:USERPROFILE\.hermes\skills\cloud-automation\api-rotation\auto_rotate.py"

if (-not (Test-Path $ScriptPath)) {
    Write-Error "Script no encontrado: $ScriptPath"
    exit 1
}

# Check Python
$Python = Get-Command python -ErrorAction SilentlyContinue
if (-not $Python) {
    $Python = Get-Command python3 -ErrorAction SilentlyContinue
}
if (-not $Python) {
    Write-Error "Python no encontrado. Instalá Python desde python.org"
    exit 1
}

Write-Host "Axis Panel - Rotación de API Keys" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

if ($Provider) {
    Write-Host "Cambiando a proveedor: $Provider" -ForegroundColor Yellow
    python "$ScriptPath" --set-provider "$Provider"
} elseif ($Force) {
    Write-Host "Rotación forzada..." -ForegroundColor Yellow
    python "$ScriptPath" force
} else {
    Write-Host "Rotando al siguiente proveedor..." -ForegroundColor Yellow
    python "$ScriptPath"
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Rotación completada exitosamente" -ForegroundColor Green
} else {
    Write-Host "❌ Error en la rotación" -ForegroundColor Red
}

# Mostrar estado actual
Write-Host "`nEstado actual de la rotación:" -ForegroundColor Cyan
$stateFile = "$env:USERPROFILE\.config\api_rotation_state.json"
if (Test-Path $stateFile) {
    Get-Content $stateFile -Raw | Write-Host
}
