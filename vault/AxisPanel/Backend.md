---
tags:
  - axispanel
  - backend
---
# Backend

Servidor Express.js en \ackend/server.js\ (~2800 líneas).

## Endpoints principales

- \/api/chat/:agent\ — Multi-agent chat (Hermes, OpenClaw, agy, freebuff, axischat)
- \/api/rotate\ — Rotación de API keys
- \/api/keys\ — CRUD de API keys
- \/api/crm/*\ — CRM (leads, pipeline, interacciones)
- \/api/scrape/*\ — Scraping Google Maps
- \/api/outreach/*\ — Email/WhatsApp outreach
- \/api/obsidian/*\ — Integración con Obsidian CLI
- \/api/shell/exec\ — Ejecución remota de comandos

## Módulos

| Módulo | Archivo |
|--------|---------|
| CRM Database | \ackend/modules/crm-db.js\ |
| CRM Routes | \ackend/modules/crm-routes.js\ |
| Follow-up Automator | \ackend/modules/followup-automator.js\ |
| Local Indexer | \ackend/modules/local-indexer.js\ |
| Scraper nativo | \ackend/scrapers/gmaps.js\ |
| Scraper Docker | \ackend/scrapers/gmaps_gosom.js\ |