# Recorrido virtual 360° de una vivienda

Aplicación web para recorrer una vivienda mediante panoramas equirectangulares, con
autenticación, cámaras CCTV ficticias y auditoría central en PostgreSQL.

## Estado actual

La versión actual está publicada y usa Vite, Fastify, Vercel Functions y Neon. El
recorrido contiene dos pisos, ocho panoramas ficticios y diez cámaras:

- Primer piso: Parqueadero, Pasillo y Cocina.
- Escaleras: base en el primer piso y descanso en el segundo.
- Segundo piso: Cuarto 1 a la derecha, Cuarto 2 a la izquierda y Estudio.
- Ruta izquierda: Cuarto 2 continúa hacia el Estudio.

Todas las conexiones tienen regreso. El menú permite abrir cualquier punto, muestra
la ubicación activa y funciona con teclado y en pantallas móviles.

## Uso local

```bash
npm ci
npm run api:dev
```

En otra terminal ejecuta `npm run dev`. La API usa `.env.backend.local` y PostgreSQL
local; Vite mostrará la dirección localhost del frontend.

## Verificación

```bash
npm run check
```

Este comando ejecuta ESLint, las pruebas con Vitest, TypeScript, la construcción de
Vite y pruebas reales en Microsoft Edge.

## Documentación

Todos los TXT se conservan en `documentacion/`:

- `comandos_necesarios.txt`
- `guia_completa_de_fases.txt`
- `explicacion_de_archivos_y_codigo.txt`
- `gestion_secretos_y_rotacion_v1.txt`
- `preguntas_y_respuestas_por_fase.txt`
- `openapi/orbinodo-api-v1.json` (contrato OpenAPI 3.1 verificable)
- `arquitectura_orbinodo_enterprise_v1.txt` (mapa arquitectónico y límites)
- `dossier_comercial_orbinodo_enterprise_v1.txt` (presentación comercial y técnica)
- `manual_instalacion_orbinodo_enterprise_v1.txt` (instalación paso a paso y troubleshooting)

- `manual_operacion_orbinodo_enterprise_v1.txt` (operacion diaria, incidentes, backups, despliegues y escalamiento)
- `health_checks_y_monitoreo_v1.txt` (liveness, readiness, m�tricas, alertas y runbook)
## Privacidad

Los ocho panoramas actuales son ficticios. Las fotografías reales deben guardarse
en `public/panoramas/private/`. Git ignora su contenido, pero una construcción local
puede copiarlo a `dist/`; ambas carpetas deben revisarse antes de compartir archivos.

Las contraseñas permanecen en archivos locales ignorados por Git. La base guarda
únicamente hashes Argon2id y las sesiones usan cookies HttpOnly y Secure.

## Producción

La demo verificada está disponible en:

https://orbinodo-demo.vercel.app

Para comprobar la API y la interfaz publicada:

```bash
npm run verify:production
npm run verify:production:browser
```

Producción usa Neon; no intenta conectarse al PostgreSQL instalado en localhost.
Después de la verificación inicial, la auditoría quedó limpia: cero sesiones y cero
cambios, conservando cuatro usuarios, diez cámaras y diez estados operativos.
