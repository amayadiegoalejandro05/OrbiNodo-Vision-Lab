# OrbiNodo Enterprise v1.0

Plataforma web para recorrer una vivienda en 360 grados y consultar informacion
operativa de camaras CCTV ficticias desde una API segura y PostgreSQL.

## Que incluye

- Recorrido 360 con panoramas, mapa, hotspots y marcadores de camaras.
- API Fastify entre la interfaz y PostgreSQL/Neon.
- Autenticacion en servidor, sesiones seguras y permisos por rol.
- Historial de accesos y cambios operativos.
- Control de concurrencia para evitar sobrescrituras.
- Health checks, backups, restauracion validada y despliegue reproducible.

## Demo en produccion

https://orbinodo-demo.vercel.app

La demo usa Vercel + Neon. El navegador nunca se conecta directamente a PostgreSQL.

## Inicio local

Requisitos: Node.js 24.18.1 y PostgreSQL, o una base Neon autorizada.

    npm ci
    npm run db:migrate
    npx tsx backend/database/seed.ts

En una terminal, inicia la API:

    npm run api:dev

En otra terminal, inicia el frontend:

    npm run dev

La API queda en http://127.0.0.1:3001 y Vite muestra la URL del frontend.

## Verificacion

    npm run test
    npm run test:integration
    npm run build
    npm run verify:reproducible

Para revisar la instalacion publicada:

    npm run verify:production
    npm run verify:production:browser

## Documentacion principal

- [Dossier comercial](documentacion/dossier_comercial_orbinodo_enterprise_v1.txt)
- [Manual de instalacion](documentacion/manual_instalacion_orbinodo_enterprise_v1.txt)
- [Manual de operacion](documentacion/manual_operacion_orbinodo_enterprise_v1.txt)
- [Arquitectura](documentacion/arquitectura_orbinodo_enterprise_v1.txt)
- [Contrato API y OpenAPI](documentacion/contrato_api_fastify_v1.txt)
- [Especificacion OpenAPI](documentacion/openapi/orbinodo-api-v1.json)
- [Backups y restauracion](documentacion/backup_y_restauracion_postgresql_v1.txt)
- [Health checks y monitoreo](documentacion/health_checks_y_monitoreo_v1.txt)
- [Despliegue reproducible](documentacion/despliegue_reproducible_v1.txt)
- [Changelog](CHANGELOG.md)

Los documentos de auditoria y las notas historicas se conservan en
.env.auditoria. No forman parte del procedimiento diario de instalacion u operacion.

## Seguridad y privacidad

- No guardar contrasenas, DATABASE_URL ni tokens en Git.
- Mantener los archivos .env reales fuera del repositorio o en las variables de Vercel.
- Las contrasenas se validan en servidor y se almacenan con Argon2id.
- Las sesiones usan cookies HttpOnly; en produccion son Secure.
- PostgreSQL es la fuente central; no usar localStorage para datos empresariales.
- Las fotografias reales deben permanecer fuera de Git en public/panoramas/private/.

## Version

Release de codigo: v1.0.0.

Repositorio: https://github.com/amayadiegoalejandro05/OrbiNodo-V1
