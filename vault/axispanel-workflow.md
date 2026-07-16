# AxisPanel — Workflow de Captura y Ventas

> Sesión 14 Jul 2026 — Diseño de flujo conversacional con Jordan

## Filosofía
Hunter digital. Escuchar redes → Detectar intención de compra → Contactar multicanal → Registrar todo → Ciclo continúo.

## Pipeline (7 etapas)

### 1. Captura
**Fuentes:** Facebook, Instagram, TikTok, WhatsApp, Telegram, Google Trends.
**Target:** Grupos de compra/venta, IA, ayuda comunitaria (ej. "Santiago", "Puente Alto").
**Idiomas:** Primero hispanohablante, luego inglés.
**Google Trends:** Detectar keywords que usa la gente para pedir servicios. Geolocalizar demanda.
**Formato:** Scraper busca publicaciones del tipo "necesito página web", "necesito manejo de RRSS", "necesito video", "necesito tarjetas", "necesito flyer", "necesito digitalizar mi negocio".

### 2. Contacto
El scraper contacta al lead en el mismo lugar donde fue encontrado (MD de FB, comentario, etc.).
Paralelamente intenta contacto por otros canales (email, WhatsApp).
Cada interacción se registra y tiene seguimiento.

### 3. Calificación
Agente IA conversa con el lead, guiado a cierre.
Chatbot con personalidad Jordan + info de servicios + precios.
Tooling: Demo de chatbot existente de Jordan (pendiente de compartir).

### 4. Propuesta
Portafolio de servicios integrado a AxisPanel.
Segmentación por:
- Tamaño del proyecto (flyer < web < CCMM < digitalización completa)
- Sector socioeconómico
Precio dinámico por segmento.

### 5. Agendamiento
Cal.com (open source) + Google Calendar.
El cliente agenda vía link.

### 6. Ejecución + Cronograma
Cronograma por cliente con hitos y fechas límite.
Notificaciones al cliente por el canal que prefiera (email o WhatsApp).
Tipo de flujo según servicio contratado.
Servicios (pendiente: PDFs de lo que ofrece Jordan).

### 7. Post-Venta
Up-selling automático (SEO, hosting, mantenimiento, festividades, referidos).
Ciclo continuo — nunca termina.
Mantenimiento recurrente si aplica.
Up-sell por festividades y ocasiones.
Programa de referidos.

## Principios rectores
- **Cada interacción es un diamante.** El lead puede comprar hoy, en 1 año o en 5. Se conserva todo.
- **Sin orden no hay negocio.** Cronograma por cliente desde el día 1.
- **Sin cliente nada funciona.** Prioridad máxima: conseguir 1 cliente real y probar el pipeline completo.
- **No reinventar la rueda.** n8n como orquestador. Cal.com para agenda.

## Decisiones técnicas
- Orquestador: n8n (ya instalado)
- Calendario: Cal.com (open source)
- Documentación: Obsidian
- Email: Open-source auto-gestionado (NO Resend, NO terceros)
- Scraper: Por definir (inspiración de career-ops / ai-job-search)
- Chatbot: Integrar demo existente de Jordan
- Vault: C:\AxisPanel\vault

## AxisPanel
- Puerto: 3030
- Token: Pr0sp3r1d4d...C0m
- CRM: SQLite (20 leads de prueba)
- Frontend: Svelte + Vite
- FollowUp scheduler: activo (cada 60s)
