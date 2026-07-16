---
tags:
  - axispanel
  - scraping
---
# Scraping

Dos scrapers de Google Maps.

## Native Scraper (\gmaps.js\)

- Scraping directo desde Node
- Categorías predefinidas para Santiago
- Score automático basado en rating y reviews

## Docker Scraper (\gmaps_gosom.js\)

- Contenedor Docker: \gosom/google-maps-scraper\
- Soporta queries paralelas, profundidad configurable
- Importación de resultados previos

## Leads DB

Archivo JSON con autoincrement ID. Sincronización a CRM SQLite.

## Categorías principales

- Clínicas dentales
- Abogados
- Restaurantes
- Gimnasios
- ... y más