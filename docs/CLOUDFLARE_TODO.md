# Tareas Pendientes: Integración de Cloudflare en Axis Panel

Se ha integrado el código base en `server.js` para generar subdominios automáticamente cuando un nodo se registra en el panel, pero la funcionalidad está en pausa a la espera de configurar los datos reales.

## ¿Dónde nos quedamos?
- La función `crearSubdominio()` fue agregada en `server.js`.
- La ruta `app.post('/api/register')` ya está llamando a la función para intentar generar el dominio usando la API de Cloudflare.

## Pasos para retomar esta tarea:
1. Conseguir tu **Zone ID** en el panel de Cloudflare.
2. Generar un **API Token** en Cloudflare con permisos de "Edit zone DNS".
3. Abrir el archivo `server.js`.
4. Buscar el siguiente bloque de código (cerca de la línea 68) y reemplazar los valores:
   ```javascript
   const ZONE_ID = 'TU_ZONE_ID_AQUI'; 
   const API_TOKEN = 'TU_API_TOKEN_AQUI';
   const DOMINIO_PRINCIPAL = 'tudominio.com';
   ```
5. Reiniciar el servidor Node.js y probar el registro de un nuevo nodo para verificar la creación automática del subdominio.
