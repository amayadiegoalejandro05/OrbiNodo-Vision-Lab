# Vision Lab Public E2E Checkpoint

## Estado

VALIDADO FÍSICAMENTE Y DESDE RED EXTERNA.

Checkpoint del 2026-10-06, rama `feature/phylo-access-integration`, versión
`vision-lab-public-e2e-v0.2`. La validación física y desde una red externa fue
confirmada por el responsable del demo para este cierre. Las comprobaciones
automáticas indicadas abajo verifican software y no sustituyen esa prueba física.

## Arquitectura validada

Vercel → Vision Lab → Cloudflare Tunnel HTTPS → Vision Service → cámara
→ reconocimiento → confirmación de 3 parpadeos → ActuatorClient
→ ESP32 → MG995.

La captura y la inferencia ocurren en el nodo local; Neon no almacena biometría.

## Frontend

Flujo: login → pantalla de laboratorio → CAM-ROBOT-01 → Robot Vision.

- Perfil `vision-lab` independiente, con representación técnica interactiva del activo.
- Acceso directo a Robot Vision, sin panorama, minimapa, mapa de cámaras ni hotspot obligatorio.
- `orbinodo-demo` conserva el recorrido panorámico y sus mapas.
- Stream MJPEG real y controles existentes de iniciar/detener cámara.
- `active_user`, AUTHORIZED / UNKNOWN, `blink_count / blink_target`,
  `blink_confirmed` y estado del actuador.
- Confirmación PENDIENTE / CONFIRMADA; estados CLOSED / OPENING / OPEN_HOLD / CLOSING.
- Restricciones de cámara Operativa / En mantenimiento / Fuera de servicio y alertas UNKNOWN conservadas.
- Polling de visión cada 400 ms; consulta de actuador independiente, una petición pendiente
  como máximo y cancelación a los 3 segundos. Los estados breves pueden ocurrir entre lecturas.

## Vision Service

- FastAPI/Uvicorn, puerto 8765, entorno reproducible `.venv-lock-repro`.
- Logitech Brio, índice de cámara 0 en la máquina validada; verificarlo al cambiar de equipo.
- OpenCV, YuNet para detección, SFace para reconocimiento y Face Landmarker para parpadeos.
- Usuario activo Diego; reconocimiento AUTHORIZED / UNKNOWN.
- Target de 3 parpadeos; thresholds y lógica funcional sin cambios en este cierre.

Los parpadeos son una confirmación experimental de interacción. NO constituyen
un sistema de liveness ni anti-spoofing.

## Actuador

- ESP32, transporte Wi-Fi/HTTP, MG995 en GPIO18.
- Máquina de estados: CLOSED → OPENING → OPEN_HOLD → CLOSING → CLOSED.
- Apertura, mantenimiento de posición y cierre físicos validados.

## Separación arquitectónica

La web NO controla directamente el ESP32; supervisa Vision Service.

La decisión ocurre en Vision Service:

```text
active_user.status == AUTHORIZED AND blink_confirmed
→ ActuatorClient.open()
→ ESP32
→ MG995
```

El monitor evita repetir el intento de apertura mientras permanece elegible la
misma confirmación. La web consulta `GET /api/actuator/status` del Vision Service;
no incorpora un botón de apertura manual ni comunicación Web → ESP32.

## Infraestructura pública

- Frontend y backend: Vercel, proyecto `orbinodo-vision-lab`.
- Host: https://orbinodo-vision-lab.vercel.app.
- Database: Neon PostgreSQL; autenticación existente, sin reset ni creación de cuentas en el cierre.
- Vision Service: nodo local, expuesto mediante Cloudflare Tunnel HTTPS.
- CORS permite exactamente el dominio publicado y conserva los orígenes locales.
  `VISION_CORS_ORIGINS` usa una lista separada por comas, sin comodines.
- `VITE_VISION_SERVICE_URL` contiene la base HTTPS activa y se incorpora durante el build.
- `DATABASE_URL` y `VISION_LAB_DATABASE_HOST` de Production están alineadas con la base
  dedicada de Vision Lab; el guard se conserva y Preview no se sobrescribió.

El Quick Tunnel actual es temporal: su URL puede cambiar y no se guarda aquí como
configuración permanente. Para una instalación o presentación permanente debe
sustituirse por un Named Tunnel estable, con su configuración de seguridad definida.
CORS no es autenticación; el túnel de esta demo expone temporalmente el nodo sin
autenticación adicional, con autorización expresa del responsable.

No se incluyen passwords, tokens, cadenas de conexión, credenciales Wi-Fi ni datos biométricos.

## Validación realizada

- Login Production HTTP 200 y `/api/auth/me` HTTP 200: `vision-admin`, role `programmer`.
- Backend `/api/health` HTTP 200, `database=available`.
- CAM-ROBOT-01 visible; Robot Vision abre; Vision Service LISTO.
- Stream real, usuario AUTHORIZED, contador 0/3 → 3/3 y confirmación.
- Apertura y cierre físicos del MG995; estado del actuador visible en la web.
- Acceso desde una red externa diferente a la del nodo local.

Resultados de las validaciones automáticas del cierre:

| Comprobación | Resultado |
| --- | --- |
| `npm run typecheck` | OK |
| `npm run lint` | OK |
| `npm test` | 125/125 tests, 25 archivos |
| `.venv-lock-repro/Scripts/python.exe -m unittest discover -s vision-service/tests -p "test_*.py" -v` | 62/62 tests |
| `npm run build` | OK |
| `npm run build:vision-lab` | OK |
| `git diff --check` | OK |

Los tests de navegador simulan Vision Service; la suite Python utiliza dobles de
prueba y no realiza nuevas aperturas físicas. Ambos builds muestran la advertencia
de Vite sobre el chunk panorámico mayor de 500 kB, que no impide el build.

## Dependencias operacionales

En el PC nodo se requieren Vision Service/Uvicorn activo, Logitech Brio conectada,
ESP32 accesible por red, fuente externa del MG995 y `cloudflared` activo.

La IP del ESP32 es dinámica y NO debe considerarse permanente. Verificar el dispositivo
antes de asignar `VISION_ACTUATOR_URL` en el entorno de ejecución. La configuración
local y los datos biométricos permanecen fuera de Git.

Limitaciones conocidas: latencia visible por túnel/red y un fallo transitorio de
captura previamente observado, `Camera failed for 30 consecutive reads`. Esta
versión no afirma resiliencia de captura ni disponibilidad permanente del túnel.

## Fuera del alcance de esta versión

- Cosecha de uchuva y YOLO de uchuva.
- Profundidad RGB-D y Orbbec Astra Pro.
- ROS2, planificación de trayectoria y brazo manipulador.
- Liveness biométrico y producto comercial.

Esta versión es un prototipo experimental para validar la arquitectura
percepción → decisión → comunicación → actuación. No es un sistema certificado
de control de acceso ni implica incorporación a OrbiNodo Core.
