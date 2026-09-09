# OrbiNodo Vision Lab - nodo remoto de demo

## Arquitectura

La webcam USB, OpenCV YuNet/SFace, SQLite biométrica y Vision Service se
ejecutan en el portátil remoto. El navegador móvil o de escritorio abre
OrbiNodo Vision Lab en Vercel y consume por HTTPS el estado y el MJPEG ya
anotado. El navegador no procesa frames ni ejecuta reconocimiento.

```text
USB webcam -> Vision Service 127.0.0.1:8765 -> tunnel HTTPS estable
            -> OrbiNodo Vision Lab en Vercel -> navegador móvil/escritorio
```

## Preparar un portátil nuevo

1. Clonar exclusivamente el repositorio OrbiNodo Vision Lab.
2. Instalar Python 3 compatible y ejecutar `scripts/setup-vision-node.ps1`.
3. Obtener manualmente los dos ONNX oficiales siguiendo
   `vision-service/models/README.md`; el setup valida sus SHA-256.
4. Enrolar localmente con `vision-service/scripts/enroll_person.py`. No copiar
   bases, fotos, frames ni embeddings desde otro equipo.
5. Ejecutar el nodo con `scripts/run-vision-node.ps1`, indicando el índice de
   cámara y los origins exactos.
6. Validar `/health` y `/api/vision/status` con
   `scripts/check-vision-node.ps1`. Este check no abre la webcam.

Configuración de ejemplo, sin hostname inventado:

```powershell
.\scripts\run-vision-node.ps1 `
  -CameraIndex 1 `
  -CorsOrigins "https://URL-EXACTA-DE-ORBINODO-VISION-LAB"
```

El servicio escucha por defecto sólo en `127.0.0.1:8765`; el agente de túnel
debe ejecutarse en el mismo portátil y apuntar a esa dirección.

## Frontend y Vercel

Desarrollo local:

```text
VITE_VISION_SERVICE_URL=http://127.0.0.1:8765
```

Vercel:

```text
VITE_VISION_SERVICE_URL=https://HOST-ESTABLE-DEL-NODO
```

Una compilación desplegada rechaza un endpoint HTTP con el mensaje
`Vision Service requires an HTTPS endpoint in deployed mode.`. Las variables
`VITE_*` son públicas en el navegador y nunca deben contener credenciales.

## CORS

`VISION_CORS_ORIGINS` contiene origins exactos separados por coma. Admite HTTPS
y localhost explícito; rechaza `*` y HTTP remoto. Debe incluir solamente el
origin Vercel realmente asignado y los localhost necesarios para desarrollo.

CORS limita qué navegadores pueden leer respuestas, pero no autentica usuarios
ni impide llamadas directas al endpoint.

## HTTPS y túnel para la demo

Cloudflare Tunnel es una opción para mapear un hostname HTTPS estable hacia
`http://127.0.0.1:8765`. La cuenta, el dominio, el hostname, el login y las
credenciales se configuran manualmente fuera del repositorio. No se almacenan
tokens en archivos versionados.

Esto resuelve conectividad de demo, no constituye la arquitectura final de
producción. La operación futura debe contemplar identidad del dispositivo,
rotación de credenciales, revocación, rate limiting, monitoreo y un transporte
de video diseñado para Internet.

## Seguridad antes de publicar

No se debe publicar el túnel sin una capa de acceso. La estrategia mínima
propuesta para la demo es Cloudflare Access con una lista de identidades
autorizadas, sesión corta y MFA cuando esté disponible. Tiene estas
implicaciones:

- el usuario debe autenticar también el dominio del túnel;
- `fetch` y el elemento MJPEG deben poder presentar la sesión de Access;
- la política CORS debe seguir limitada al origin exacto de Vercel;
- un service token no puede guardarse en `VITE_*` porque quedaría expuesto;
- si el flujo de cookies entre dominios no funciona en los navegadores objetivo,
  se necesitará un gateway autenticado distinto; no se debe volver público el
  servicio como atajo.

No se implementó esta autenticación en esta fase. Antes de exponer `/start`,
`/stop`, `/status` o `/stream.mjpg`, hay que elegir y probar la capa de acceso
con el hostname real.

## Privacidad y despliegue

Git y Vercel excluyen la base SQLite, ONNX, entornos virtuales, caches Python,
fotos, capturas y frames. `.vercelignore` excluye todo `vision-service/`; Vercel
recibe sólo la aplicación web y sus funciones TypeScript. Neon no almacena
biometría.

## Diagnóstico no sensible

`/health` y `/api/vision/status` informan `INITIALIZING`, `READY`, `RUNNING` o
`ERROR`, índice de cámara, estado de conexión, FPS, último timestamp y error.
No retornan embeddings, fotografías ni frames sin anotar fuera del MJPEG.

## Checklist manual final

1. Crear manualmente el túnel y Access con un hostname HTTPS estable.
2. Probar login de Access desde el celular.
3. Configurar ese HTTPS como `VITE_VISION_SERVICE_URL` en el proyecto Vercel
   ya enlazado.
4. Añadir el origin exacto de Vercel a `VISION_CORS_ORIGINS` en el portátil.
5. Desplegar Vision Lab y abrir CAM-ROBOT-01 desde el celular.
6. Validar start, MJPEG, AUTHORIZED, UNKNOWN, stop y liberación de la webcam.
