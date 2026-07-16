---
tags:
  - axispanel
  - frontend
---
# Frontend

SPA en Svelte + Vite.

## Estructura

\\\
src/
  App.svelte          # Entry point, dock, window manager
  main.js             # Bootstrap
  app.css             # Global styles
  core/
    config/           # Tools config
    dock/             # Dock components
    helpers/          # Utility functions
    state/            # ToolsStore (reactive state)
    window/           # Window manager
  lib/                # Shared components
  modules/
    apps/             # App modules (Shells, Storage, OpenPencil, etc.)
    axischat/         # Chat interface
    codegraf/         # Codebase graph viewer
    crm/              # Kanban, Leads table, Stats
    dashboard/        # Main dashboard
    scraping/         # Scraper UI
    settings/         # Settings, API keys, logs
  stores/             # Svelte stores
\\\

## Features

- Dock con ventanas flotantes
- Background con partículas animadas
- Menú de servicios con status indicators
- Polling cada 10s