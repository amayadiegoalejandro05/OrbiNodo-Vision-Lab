AGENTS.md — OrbiNodo Vision Lab

Este archivo define las reglas de trabajo para cualquier agente de IA o desarrollador automatizado que opere dentro de este repositorio.

1. Identidad del repositorio

Este repositorio es:

OrbiNodo Vision Lab

Es un proyecto experimental separado de OrbiNodo principal.

No asumir que una funcionalidad probada aquí ya forma parte de OrbiNodo Core.

La función inmediata del laboratorio es validar integración entre una cámara física, procesamiento de visión local y consumo remoto desde OrbiNodo.

2. Arquitectura actual que debe preservarse

Frontend TypeScript / Vercel
        ↓
OrbiNodo Vision Lab

Nodo de visión separado:
Webcam
  ↓
OpenCV
  ↓
YuNet + SFace
  ↓
Vision Service Python / FastAPI
  ↓
MJPEG + API de estado
  ↓
HTTPS cuando se usa un túnel externo

La inferencia facial se realiza en el Vision Service, no en el navegador.

La biometría es local al Vision Node.

3. Límites no negociables

No realizar ninguna de estas acciones salvo instrucción explícita y justificada del usuario:

tocar el proyecto principal de OrbiNodo;

incorporar automáticamente este prototipo a OrbiNodo Core;

mover reconocimiento facial al navegador;

guardar biometría en Neon/PostgreSQL;

subir embeddings, SQLite biométrico, imágenes o vídeo a Git;

eliminar o debilitar controles CORS;

cambiar guards de entorno para “hacer que funcione”;

sustituir autenticación existente por atajos;

quitar rate limiting;

sembrar o sobrescribir usuarios de producción;

modificar hashes de contraseña sin autorización;

introducir secretos en código, commits, logs o documentación;

desplegar cambios locales no auditados;

mezclar cambios no relacionados en un mismo commit.

4. Privacidad

Nunca versionar:

.env*
*.db
*.sqlite
embeddings
biometric data
enrollment images
captured images
captured video
passwords
tokens
cookies
Neon connection strings
Vercel secrets
Cloudflare credentials

Los rostros UNKNOWN no deben almacenarse automáticamente.

No convertir Git en mecanismo de transporte de datos biométricos entre PCs.

5. Estado funcional de referencia

La última cadena validada físicamente es:

Logitech Brio
  ↓
Vision Service
  ↓
YuNet + SFace
  ↓
MJPEG
  ↓
Cloudflare Quick Tunnel HTTPS
  ↓
OrbiNodo Vision Lab en Vercel
  ↓
PC / celular

Resultados observados:

Vision Service READY.

Cámara RUNNING.

Aproximadamente 30 FPS en prueba local.

Reconocimiento AUTHORIZED correcto para persona enrolada.

Persona no enrolada presentada como UNKNOWN.

Stream MJPEG correcto.

Stream remoto correcto desde celular.

Algo de latencia remota, aceptable para demo.

Un fallo transitorio de adquisición:
Camera failed for 30 consecutive reads.

No ocultar esta limitación ni afirmar que la captura es todavía resiliente.

6. Endpoints del Vision Service

Base local:

http://127.0.0.1:8765

Endpoints:

GET  /health
GET  /api/vision/status
POST /api/vision/start
POST /api/vision/stop
GET  /api/vision/people
GET  /stream.mjpg

Estado sano antes de iniciar cámara:

state      READY
prepared   true
running    false
database   ready
models     ready

Estado sano durante captura:

state      RUNNING
prepared   true
running    true
fps        > 0
error      vacío

7. Windows / cámara

El prototipo fue validado en Windows.

La Logitech Brio funcionó con CameraIndex 0 en el equipo de validación, pero el índice no debe tratarse como identidad fija.

Existe una corrección de compatibilidad Windows/OpenCV que debe preservarse antes de importar OpenCV:

os.environ.setdefault("OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS", "0")

No eliminarla sin una prueba física que demuestre que ya no es necesaria.

8. Ejecución del Vision Node

Comando de referencia:

.\scripts\run-vision-node.ps1 `
  -CameraIndex 0 `
  -CorsOrigins "https://orbinodo-vision-lab.vercel.app"

Verificación:

.\scripts\check-vision-node.ps1

Smoke test:

Invoke-RestMethod http://127.0.0.1:8765/health

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8765/api/vision/start

Invoke-RestMethod http://127.0.0.1:8765/api/vision/status | Format-List *

Stream:

http://127.0.0.1:8765/stream.mjpg

9. CORS

Para la demo publicada, el origen permitido es:

https://orbinodo-vision-lab.vercel.app

No sustituirlo por:

*

CORS no es autenticación y no protege por sí solo un servicio publicado en Internet.

10. Cloudflare

La validación actual usa Quick Tunnel únicamente para demo:

cloudflared tunnel --url http://127.0.0.1:8765

La URL *.trycloudflare.com es temporal.

No codificar una URL temporal en el repositorio.

No presentar Quick Tunnel como diseño de producción.

Cuando se requiera una solución estable, evaluarla como cambio separado con autenticación y hostname estable.

11. Vercel

Proyecto correcto:

orbinodo-vision-lab

Proyecto accidental que no debe utilizarse:

orbi-nodo-vision-lab

Alias correcto:

https://orbinodo-vision-lab.vercel.app

La variable usada por el frontend es:

VITE_VISION_SERVICE_URL

Debe contener únicamente la URL base HTTPS del Vision Service remoto.

Ejemplo:

https://example.trycloudflare.com

No incluir /stream.mjpg.

Las variables VITE_* se incorporan en build-time. Un cambio requiere un nuevo build/redeploy.

No ejecutar un deploy desde un working tree con cambios no auditados.

12. Git: procedimiento obligatorio antes de modificar

Antes de cualquier cambio:

git status --short
git branch --show-current
git remote -v
git log -5 --oneline

Revisar cambios existentes antes de editar.

Este repositorio ha tenido cambios locales no relacionados en el working tree. Por tanto:

no usar git add .;

no usar git add -A;

no hacer reset destructivo;

no descartar archivos que no fueron creados por la tarea actual;

no asumir que todo archivo modificado pertenece a la tarea.

Añadir al staging únicamente rutas explícitas:

git add path\archivo1 path\archivo2

Antes de commit:

git diff --cached
git status --short

Commit y push sólo cuando el usuario lo solicite explícitamente.

13. Validación TypeScript / frontend / backend

Antes de declarar estable un cambio relacionado con el repositorio web:

npm run typecheck
npm run lint
npm test
npm run build:vision-lab

Si es una instalación limpia:

npm ci

No considerar una tarea terminada si una validación relevante falla.

No “arreglar” un test eliminándolo o relajándolo sin justificación.

14. Validación de Vision Service

Antes de declarar estable un cambio de visión:

.\scripts\check-vision-node.ps1

Después, cuando el cambio afecte captura/inferencia/stream, hacer prueba física:

1. /health → READY
2. POST /start
3. /status → RUNNING
4. fps > 0
5. error vacío
6. /stream.mjpg visible
7. persona enrolada → AUTHORIZED
8. persona no enrolada → UNKNOWN
9. POST /stop funciona

Una prueba unitaria no sustituye una prueba física cuando se modifica la capa de cámara.

15. Manejo de errores

Si el servicio entra en ERROR, consultar primero:

Invoke-RestMethod http://127.0.0.1:8765/api/vision/status | Format-List *

Preservar el mensaje de error.

No reiniciar en bucle para ocultar fallos.

Caso ya observado:

Vision Pipeline stopped: Camera failed for 30 consecutive reads.

Si se reproduce frecuentemente, tratar como problema de resiliencia de cámara y medirlo antes de implementar reconexiones automáticas.

16. Rendimiento

Se observó latencia remota visible a través de la cadena de demo.

No realizar optimizaciones especulativas.

Antes de cambiar resolución, FPS, JPEG quality, transporte o arquitectura:

medir latencia en captura;

medir inferencia;

medir codificación;

medir túnel/red;

medir renderizado;

identificar el cuello de botella dominante.

Optimizar con evidencia.

17. Separación de responsabilidades

Mantener conceptualmente separados:

OrbiNodo Core

Tecnología reutilizable del producto principal.

Vision Lab

Prototipos y validaciones experimentales.

Configuración del nodo

Índice de cámara, CORS, URL, parámetros locales.

Datos biométricos

Información local sensible que no pertenece al Core ni al repositorio.

Una prueba exitosa en Vision Lab no autoriza automáticamente su migración al Core.

18. Dependencias externas

No introducir una nueva dependencia si el comportamiento puede resolverse de forma clara con lo ya existente.

Cuando se necesite una nueva dependencia:

justificarla;

fijar/versionar de forma reproducible;

validar licencia y mantenimiento;

agregar prueba;

documentar impacto.

19. Cambios mínimos

Preferir cambios pequeños, verificables y reversibles.

No hacer refactors amplios durante una corrección puntual.

No renombrar estructuras de proyecto sin necesidad.

No “limpiar” código legado durante una tarea no relacionada.

20. Definición de terminado

Una tarea se considera terminada únicamente cuando:

el objetivo solicitado está implementado;

no se han tocado componentes fuera de alcance;

las pruebas relevantes pasan;

la prueba física pasa cuando corresponde;

no se han expuesto secretos o biometría;

git diff contiene sólo cambios intencionados;

README/AGENTS se actualizan si cambia el procedimiento operativo;

cualquier limitación nueva queda documentada sin inflar la madurez del sistema.

21. Prioridad

En caso de duda, priorizar en este orden:

1. No romper el prototipo validado.
2. No exponer secretos ni biometría.
3. Mantener Vision Lab aislado de OrbiNodo principal.
4. Preservar reproducibilidad.
5. Hacer el cambio mínimo necesario.
6. Validar con evidencia.
7. Optimizar sólo después de medir.