---
tags:
  - axispanel
  - crm
---
# CRM

SQLite con better-sqlite3.

## Pipeline Stages

1. Nuevo → Contactado → Respondió → Calificado → Propuesta → Cliente → Cerrado
2. Perdido / Ignorado

## Tablas

- \leads\ — Datos principales con score, stage, tags
- \pipeline_log\ — Historial de movimientos entre stages
- \interactions\ — Emails, llamadas, notas
- \	asks\ — Follow-ups pendientes
- \enrichment_log\ — Registro de enriquecimiento

## Sync

Los leads scrapeados de Google Maps se sincronizan automáticamente al CRM via \syncLeadsToCRM()\.

## Outreach

- Email vía Resend, SendGrid, o SMTP directo
- WhatsApp vía Twilio
- Template system con variables \{{name}}\, \{{company}}\
- Follow-up automator con reglas programadas