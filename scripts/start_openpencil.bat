@echo off
title OpenPencil Local Dev Server
echo ========================================
echo  Starting OpenPencil Local Development
echo ========================================
echo.
set OPENPENCIL_DIR=%USERPROFILE%\odysseus\data\personal_docs\open-pencil-local
set MCP_DIR=%OPENPENCIL_DIR%\packages\mcp

echo [1/2] Starting OpenPencil MCP Server (port 7600)...
start "OpenPencil MCP" cmd /c "cd /d "%MCP_DIR%" && set PORT=7600 && set WS_PORT=7601 && set OPENPENCIL_MCP_CORS_ORIGIN=http://localhost:3030 && npx tsx src/index.ts"

echo [2/2] Starting OpenPencil Vite Dev Server (port 1420)...
start "OpenPencil Vite" cmd /c "cd /d "%OPENPENCIL_DIR%" && npx vite --host --port 1420"

echo.
echo OpenPencil is starting...
echo   Editor:  http://localhost:1420
echo   MCP:     http://localhost:7600/mcp
echo.
echo Close this window to stop both servers.
pause
