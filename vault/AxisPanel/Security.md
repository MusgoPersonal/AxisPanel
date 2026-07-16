---
tags:
  - axispanel
  - security
---
# Seguridad

Hallazgos de la revisión.

## Crítico

- \AUTH_TOKEN\ hardcodeado en \server.js:24\ (\Pr0sp3r1d4d...C0m\)
- Shell sanitizer insuficiente para PowerShell (\$()\ y backticks no filtrados)
- API keys en texto plano en \~/.config/api_keys.json\
- Endpoint \POST /api/shell/exec\ con sanitización parcial

## Medio

- CORS permite solo localhost (bien)
- Rate limiting: 600 req/min (generoso)
- Firebase service account en variable de entorno
- \
odemailer\ no está en \package.json\ pero se usa inline

## Recomendaciones

1. Mover AUTH_TOKEN a variable de entorno
2. Usar allowlist de comandos en vez de blacklist
3. Cifrar API keys en disco
4. Modularizar server.js en rutas