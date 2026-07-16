# AxisPanel — Estado al 14 Julio 2026 (Actualizado)

## Pipeline 7 Etapas

| # | Etapa | Estado | Detalle |
|---|-------|--------|---------|
| 1 | **Captura** | ⚠️ Parcial | Telegram OK, Maps sin Docker, FB/IG/TikTok pendientes |
| 2 | **Contacto** | ✅ Auto-respuesta | Channel manager + IA responden automáticamente |
| 3 | **Calificación** | ✅ IA funcionando | `calification-agent.js` — conversa, califica, mueve stage |
| 4 | **Propuesta** | ⚠️ Portfolio listo | `config/services.json` con servicios y precios |
| 5 | **Agendamiento** | ❌ Pendiente | Cal.com clonado pero no integrado |
| 6 | **Ejecución** | ❌ Pendiente | Sin cronogramas por cliente |
| 7 | **Post-Venta** | ❌ Pendiente | followup-automator.js existe, sin reglas activas |

## Conexión Obsidian
- ✅ API reparada: ahora usa `fs` directo, sin depender del CLI de Obsidian
- ✅ `POST /api/obsidian/status|search|read|create|tasks|daily|command|graph`
- ✅ Vault: `C:\AxisPanel\vault` (5 archivos, conectado)

## Pendiente Próxima Sesión
1. **Ejecutar scraper Google Maps**: `run-scrape.bat` como Admin (Docker)
2. **Conectar WhatsApp**: `POST /api/whatsapp/start` → escanear QR
3. **Implementar agendamiento** (etapa 5) — mini-booking propio en SQLite
4. **Configurar follow-up rules** para post-venta automática
5. **Crear cronogramas por cliente** (etapa 6)
