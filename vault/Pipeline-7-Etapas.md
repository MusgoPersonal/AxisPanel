# Pipeline de Captación — 7 Etapas

## 1. Scraping / Captura ⚠️ Parcial
- ✅ Telegram scraper (bot @axispanel_bot) 
- ⏳ Google Maps scraper (gosom) — Docker no admin
- ❌ Facebook, Instagram, TikTok

## 2. Contacto ✅ Auto-respuesta IA
- ✅ Channel manager unificado
- ✅ Auto-respuesta inteligente vía calification-agent
- ✅ Mensajes → lead + interacción + stage automático
- ⏳ WhatsApp necesita QR para conectar

## 3. Calificación (IA) ✅ Funcionando
- ✅ `calification-agent.js` activo
- ✅ Responde como Jordan con portfolio real
- ✅ Detecta intención, mueve stage, actualiza score
- ✅ `POST /api/calification/chat` para chat manual o automático

## 4. Propuesta ⚠️ Portfolio listo
- ✅ `config/services.json` — 3 segmentos (Básico, Profesional, Premium)
- ✅ Precios y servicios definidos
- ❌ Generación automática de propuestas PDF

## 5. Agendamiento ❌ Pendiente
- Cal.com clonado en `cal.diy/`
- Falta integrar API de agendamiento

## 6. Ejecución + Cronograma ❌ Pendiente
- Sin implementar

## 7. Post-Venta ❌ Pendiente
- `followup-automator.js` existe (scheduler each 60s)
- Sin reglas activas configuradas

## APIs del Sistema
| Endpoint | Descripción |
|----------|-------------|
| `GET /api/channels` | Estado de todos los canales |
| `GET /api/calification/portfolio` | Servicios y precios |
| `POST /api/calification/chat` | Chatear con IA calificadora |
| `POST /api/channels/:id/start` | Conectar canal |
| `POST /api/channels/:id/send` | Enviar mensaje por canal |
