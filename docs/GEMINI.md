# GEMINI.md - Project Information

## Project Goal
Panel de control para automatización de APIs (rotador de llaves) y chat multiagente (Hermes, OpenClaw, Antigravity, OpenCode).

## Current Status
- **Backend (`server.js`)**: Configurado y corregido. Se agregaron endpoints de control de servicios `/api/hermes/start`, `/api/hermes/stop`, `/api/openclaw/start`, `/api/openclaw/stop` y `/api/openclaw/status`.
- **OpenClaw Port**: Corregido puerto de `2024` a `18789` en `server.js` para enlazarse de forma correcta con el gateway de OpenClaw.
- **Hermes Environment**: Reparado entorno virtual `venv` de Python instalando limpiamente `pydantic` y `pydantic-core` mediante `uv`, solucionando el error crítico de carga de biblioteca.
- **Frontend Svelte (`frontend/`)**: Compilado exitosamente. Se agregaron controles de servicio para Hermes y OpenClaw en Ajustes, y se implementó el **Flujo Conversacional de Scraping** interactivo de una pregunta a la vez cuando el usuario escribe intenciones como "necesito clientes".
- **Limpieza**: Directorio `public/` ordenado con los archivos obsoletos respaldados.

## Next Steps
1. Iniciar el backend con `start_command_center.bat` en una terminal dedicada.
2. Validar que la pestaña Ajustes permita encender y apagar Hermes y OpenClaw correctamente.
3. Probar el flujo conversacional en el chat escribiendo "necesito clientes" para validar el scraper interactivo.

## Important Notes
- No ejecutar comandos bloqueantes como `npm run dev` en esta terminal de chat.
- Toda la comunicación debe ser en español.

## Gemini added memories
