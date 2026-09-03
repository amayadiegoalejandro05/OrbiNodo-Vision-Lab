# Changelog de OrbiNodo Enterprise

Todos los cambios relevantes de cada release se registran en este archivo.
Las versiones siguen Semantic Versioning: `MAJOR.MINOR.PATCH`.

## [1.1.0] - 2026-09-03

Release de handoff de OrbiNodo Enterprise.

### Incluye

- Separacion Core/cliente y configuracion white-label documentada.
- Paquete de handoff con instalacion, operacion, arquitectura, OpenAPI, seguridad y backups.
- Verificaciones de navegacion, API, secretos, dependencias y documentacion.

### Compatibilidad

- Requiere Node.js 24.18.1 y migraciones acumulativas 0001-0008.
- No modifica el esquema PostgreSQL respecto a v1.0.0.

## [1.0.0] - 2026-08-31

Primera release empresarial consolidada.

### Incluye

- Persistencia centralizada en PostgreSQL mediante migraciones versionadas `0001` a `0008`.
- API Fastify con autenticaci?n server-side, autorizaci?n por roles, sesiones e historial.
- Control de concurrencia optimista para actualizaciones de c?maras.
- Validaci?n de entradas, errores HTTP uniformes, HTTPS productivo y health checks.
- Backups/restauraci?n validada, logging t?cnico y documentaci?n operativa.
- Build reproducible con Node.js 24.18.1 y `package-lock.json`.

### Compatibilidad

- La base de datos debe tener aplicadas las migraciones `0001`?`0008`.
- Las migraciones son acumulativas; un rollback de aplicaci?n no revierte el esquema.
- La aplicaci?n se entrega como frontend Vite y backend Fastify desplegado en Vercel.
