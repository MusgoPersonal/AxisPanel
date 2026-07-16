@echo off
title Axis Panel - Docker Setup
echo ============================================
echo  Axis Panel - Configuracion de Docker
echo ============================================
echo.
echo Este script configura Docker Desktop para aceptar
echo conexiones en localhost:2375 (solo accesible desde
echo tu PC, sin riesgo de seguridad).
echo.
echo NECESITAS EJECUTAR COMO ADMINISTRADOR
echo.
echo Requisitos:
echo   - Docker Desktop instalado y funcionando
echo   - WSL 2 con Ubuntu-22.04 (opcional, para WSL)
echo.
pause

:: --- 1. Configurar daemon.json para TCP ---
echo.
echo [1/3] Configurando daemon.json...
set DOCKER_CFG=%USERPROFILE%\.docker\daemon.json

if not exist "%USERPROFILE%\.docker" mkdir "%USERPROFILE%\.docker"

if exist "%DOCKER_CFG%" (
  echo Haciendo backup de daemon.json existente...
  copy "%DOCKER_CFG%" "%DOCKER_CFG%.backup.%DATE:/=-%" > nul
)

:: Escribir nuevo daemon.json con TCP habilitado en localhost
(
echo {
echo   "builder": {
echo     "gc": {
echo       "defaultKeepStorage": "20GB",
echo       "enabled": true
echo     }
echo   },
echo   "experimental": false,
echo   "hosts": ["npipe:////./pipe/docker_engine", "tcp://127.0.0.1:2375"]
echo }
) > "%DOCKER_CFG%"

echo daemon.json actualizado correctamente.
echo.
echo NOTA: Si tenias configuraciones adicionales en daemon.json,
echo se preservaron en el backup: %DOCKER_CFG%.backup.*
echo.

:: --- 2. Instalar Docker CLI en WSL (para wsl docker) ---
echo [2/3] Instalando Docker CLI en WSL Ubuntu-22.04...
wsl -d Ubuntu-22.04 -- bash -c "which docker 2>/dev/null || (curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-27.5.1.tgz -o /tmp/docker.tgz && tar -xzf /tmp/docker.tgz -C /tmp/ && cp /tmp/docker/docker /usr/local/bin/ && chmod +x /usr/local/bin/docker && rm -rf /tmp/docker /tmp/docker.tgz && echo 'Docker CLI instalado en WSL')" 2>&1
echo.

:: --- 3. Crear script de reinicio de Docker ---
echo [3/3] Creando script de reinicio de Docker...
(
echo @echo off
echo echo Reiniciando Docker Desktop...
echo echo.
echo echo Cerrando Docker Desktop...
echo taskkill /F /IM "Docker Desktop.exe" 2^>nul
echo timeout /t 5 /nobreak ^>nul
echo echo.
echo echo Iniciando Docker Desktop...
echo start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo echo.
echo echo Esperando 30 segundos a que Docker inicie...
echo timeout /t 30 /nobreak ^>nul
echo echo Docker deberia estar listo ahora.
echo pause
) > "%USERPROFILE%\.config\restart_docker.bat"

echo Script de reinicio creado en %%USERPROFILE%%\.config\restart_docker.bat
echo.
echo ============================================
echo  CONFIGURACION COMPLETADA
echo ============================================
echo.
echo PASOS FINALES:
echo.
echo   OPCION A - Solo TCP (recomendado):
echo     1. Reinicia Docker Desktop manualmente
echo        (haz clic derecho en icono de Docker ^> Restart)
echo     O ejecuta: "%USERPROFILE%\.config\restart_docker.bat"
echo.
echo     2. Despues de reiniciar, verifica:
echo        docker -H tcp://127.0.0.1:2375 info
echo.
echo   OPCION B - WSL nativo:
echo     1. Abre Docker Desktop ^> Settings ^> Resources
echo     2. WSL Integration ^> Activa Ubuntu-22.04
echo     3. Click Apply ^& Restart
echo     4. Verifica desde WSL: wsl docker info
echo.
echo ============================================
pause
