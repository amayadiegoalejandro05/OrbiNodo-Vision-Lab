# Checkpoint reproducible: Vision Service / HTTP actuator

## Identidad y alcance

- **HECHO VALIDADO (Git):** rama `checkpoint/servo-web`, HEAD `4b9796d` (`Integrate Wi-Fi actuator with Vision Service API`) al redactar este documento.
- Propósito: congelar el prototipo experimental de petición HTTP manual, Vision Service, `ActuatorClient`, ESP32 por Wi-Fi y MG995. No es una integración en OrbiNodo Core ni un sistema de control de acceso de producción. La interfaz gráfica web no controla el servo.
- **PENDIENTE:** publicar esta rama en el remoto. Hasta entonces, `git clone` seguido de `git checkout checkpoint/servo-web` en otro PC no encontrará necesariamente la rama.

## Qué contiene esta versión

- **HECHO VALIDADO (código):** Vision Service Python/FastAPI con cámara OpenCV, detección YuNet, reconocimiento SFace local contra SQLite, estados `AUTHORIZED`/`UNKNOWN`, API de salud/estado y stream MJPEG. La cámara se abre al llamar `POST /api/vision/start`, no durante el arranque del servidor.
- **HECHO VALIDADO (código):** `ActuatorClient` usa `urllib` de la biblioteca estándar. El servicio crea el cliente sólo si existe `VISION_ACTUATOR_URL`; no consulta el ESP32 durante el startup. `GET /api/actuator/status` y `POST /api/actuator/open` trasladan estado y orden de apertura; responden 503 si el actuador no está configurado o disponible. Una apertura aceptada responde 202 y un actuador ocupado, 409.
- **HECHO VALIDADO (firmware):** ESP32 atiende HTTP por Wi-Fi en puerto 80 y ordena al MG995 los ángulos 0°/90° mediante GPIO 18. La máquina de estados usa `millis()` para `OPENING` (500 ms), `OPEN_HOLD` (3000 ms) y `CLOSING` (500 ms); sólo acepta `POST /open` desde `CLOSED`.
- **HECHO VALIDADO (frontend):** frontend TypeScript/Vite en la raíz, con visualización de CAM-ROBOT-01, estado facial y MJPEG. **No hay en esta versión un botón o llamada del frontend a `/api/actuator/open`**. La ruta web/HTTP al servo se reproduce con una petición manual desde un navegador de origen local permitido o con un cliente HTTP.
- **HECHO VALIDADO PREVIAMENTE (hardware):** la cadena `HTTP → Vision Service → ActuatorClient → ESP32 por Wi-Fi → MG995` y el ciclo físico `CLOSED → OPENING → OPEN_HOLD → CLOSING → CLOSED`. La reproducción limpia descrita abajo validó software; no constituye una nueva prueba física en otro PC.

**No implementado todavía:** selección de `active_user`, MediaPipe, Face Landmarker, ROI, detección/confirmación de parpadeos, liveness, anti-spoofing ni apertura automática a partir del reconocimiento. La clasificación `AUTHORIZED` no acciona el servo.

```text
Navegador/cliente HTTP (petición manual)
    → Vision Service FastAPI :8765
    → ActuatorClient
    → Wi-Fi → ESP32 WebServer :80
    → GPIO 18 → MG995

Web de Vision Lab → Vision Service → cámara/YuNet/SFace/MJPEG
                         (sin enlace automático al servo)
```

## Requisitos y dependencias

- **HECHO VALIDADO EN REPRODUCCIÓN LIMPIA:** Windows, PowerShell, Git y Python **3.13.2** en esta máquina. La webcam del equipo original fue Logitech Brio. `scripts/setup-vision-node.ps1` exige Python **3.11 o posterior**; eso no equivale a validar todas esas versiones. En otro PC, registrar la versión realmente instalada.
- Node.js y npm son necesarios **si se ejecuta el frontend local**. `package.json` y `package-lock.json` existen en la raíz; el repositorio no fija aquí una versión exacta de Node. Instalar una versión compatible con las dependencias fijadas en `package-lock.json`.
- Para cargar el firmware se necesita una herramienta compatible con sketches Arduino para ESP32, el core ESP32 (`WiFi.h`, `WebServer.h`) y la librería adicional `ESP32Servo.h`. **PENDIENTE:** el repositorio no fija versiones de Arduino IDE, core ESP32 ni ESP32Servo, ni identifica un modelo exacto de placa; registrar esos datos al reproducir el hardware.
- `cloudflared` sólo aplica a la demo remota documentada en `README.md`; no es necesario para la prueba local y no convierte los endpoints en seguros.

Archivos Python presentes: `requirements.txt` (raíz), `vision-service/requirements.txt` (rangos directos) y `vision-service/requirements.lock.txt` (versiones exactas). **Usar `vision-service/requirements.lock.txt`**: es el archivo instalado por `scripts/setup-vision-node.ps1`. El lock contiene:

```text
annotated-doc==0.0.5
annotated-types==0.8.0
anyio==4.15.1
click==8.5.0
fastapi==0.141.1
h11==0.16.0
idna==3.19
numpy==2.5.3
opencv-python==4.14.0.94
pydantic==2.13.5
pydantic_core==2.46.5
starlette==1.6.0
typing-inspection==0.4.4
typing_extensions==4.16.0
uvicorn==0.52.4
```

No instalar aquí dependencias de fases posteriores como MediaPipe u `opencv-contrib-python`.

## Preparación desde cero en otro PC Windows

**PENDIENTE previo:** la rama debe estar publicada en `origin`; este documento no hace push. En PowerShell, una vez publicada:

```powershell
git clone https://github.com/amayadiegoalejandro05/OrbiNodo-Vision-Lab.git
Set-Location .\OrbiNodo-Vision-Lab
git fetch origin
git checkout checkpoint/servo-web
git rev-parse --short HEAD  # debe ser 4b9796d para este checkpoint
py -3.13 --version         # reproducción validada: Python 3.13.2
py -3.13 -m venv .venv-servo-repro
.\.venv-servo-repro\Scripts\python.exe -m pip install --requirement .\vision-service\requirements.lock.txt
.\.venv-servo-repro\Scripts\python.exe -m pip check
```

Colocar y verificar primero los dos modelos ONNX indicados abajo. `scripts/setup-vision-node.ps1` comprueba sus SHA-256 y vuelve a instalar el mismo lock si hace falta; pasarle el nombre de este venv para evitar crear otro:

```powershell
.\scripts\setup-vision-node.ps1 -PythonCommand .\.venv-servo-repro\Scripts\python.exe -VirtualEnvironment .venv-servo-repro
.\.venv-servo-repro\Scripts\python.exe -m unittest discover `
  -s .\vision-service\tests -p 'test_*.py' -v
```

**HECHO VALIDADO EN REPRODUCCIÓN LIMPIA:** `pip check` devolvió `No broken requirements found.` y el comando de tests terminó con `Ran 21 tests in 0.084s` y `OK`. Los tests usan mocks para el actuador y no sustituyen la validación física. **PENDIENTE:** repetirlos y registrar resultados en cada PC nuevo; no asumir que cámara/servo funcionarán allí.

## Modelos y base biométrica local

**HECHO VALIDADO (archivos del repositorio):** `vision-service/models/README.md` documenta dos binarios requeridos, ausentes de Git y no descargados automáticamente:

| Modelo y ruta esperada | SHA-256 documentado |
| --- | --- |
| `vision-service/models/face_detection_yunet_2023mar.onnx` | `8F2383E4DD3CFBB4553EA8718107FC0423210DC964F9F4280604804ED2552FA4` |
| `vision-service/models/face_recognition_sface_2021dec.onnx` | `0BA9FBFA01B5270C96627C4EF784DA859931E02F04419C829E83484087C34E79` |

Descargarlos manualmente desde los enlaces oficiales de `vision-service/models/README.md` y verificar con `scripts/setup-vision-node.ps1`. `.gitignore` excluye `vision-service/models/*.onnx`. **No se requiere `face_landmarker.task` en este checkpoint.**

La base local es `vision-service/data/vision_faces.db`; `.gitignore` excluye `vision-service/data/*.db` y `*.sqlite3`. El servicio puede inicializar una base vacía, pero un clon **no contiene a Diego ni a ninguna persona enrolada**. Para registrar a alguien localmente, con consentimiento, modelos y webcam listos, usar el procedimiento existente:

```powershell
Set-Location .\vision-service
..\.venv-servo-repro\Scripts\python.exe scripts\test_camera.py --camera-index 0
..\.venv-servo-repro\Scripts\python.exe scripts\enroll_person.py --camera-index 0 --name "Nombre local"
..\.venv-servo-repro\Scripts\python.exe scripts\list_known_people.py
Set-Location ..
```

`enroll_person.py` exige un solo rostro y, por defecto, captura 15 embeddings separados 0,75 s. Para agregar muestras a un nombre existente exige `--add-samples`. No subir la base, embeddings ni capturas a Git.

## Configuración local y arranque

Variables que usa realmente el Vision Service (`vision-service/app/config.py`):

| Variable | Uso / valor por defecto |
| --- | --- |
| `VISION_CAMERA_INDEX` | Índice OpenCV, por defecto `1`; `0` fue válido en el PC original, no universal. |
| `VISION_SERVICE_HOST` | Host del servicio, por defecto `127.0.0.1`. |
| `VISION_SERVICE_PORT` | Puerto del servicio, por defecto `8765`. |
| `VISION_CORS_ORIGINS` | Orígenes exactos separados por coma; por defecto localhost en puertos Vite 4173, 5173 y 4176. No usar `*`. |
| `VISION_ACTUATOR_URL` | URL base `http://<IP_ACTUAL_DEL_ESP32>` o HTTPS, sin ruta, usuario ni query; si falta, el actuador queda no configurado. |
| `VISION_ACTUATOR_TIMEOUT_SECONDS` | Timeout HTTP, por defecto `2.0`, debe ser mayor que cero. |

`scripts/run-vision-node.ps1` establece cámara, host, puerto, CORS y `OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS=0` antes de iniciar Uvicorn. **No establece `VISION_ACTUATOR_URL`**: definirla en la misma sesión PowerShell antes del script. Si cambia la IP del ESP32, actualizarla y reiniciar el servicio.

Orden recomendado:

1. Alimentar/iniciar el ESP32 y obtener la IP actual desde Serial a 115200 (sólo diagnóstico).
2. En la terminal de Vision Service, definir `$env:VISION_ACTUATOR_URL = 'http://<IP_ACTUAL_DEL_ESP32>'`; opcionalmente `$env:VISION_ACTUATOR_TIMEOUT_SECONDS = '2.0'`.
3. Iniciar desde la raíz: `.\scripts\run-vision-node.ps1 -CameraIndex 0 -VirtualEnvironment .venv-servo-repro`. Probar otros índices con `vision-service/scripts/test_camera.py` si `0` no corresponde a la webcam. Mantener la terminal abierta.
4. Si se quiere la web local, en otra terminal desde la raíz: `npm ci` y `npm run dev:vision-lab`. Abrir la URL local que imprima Vite (habitualmente `http://localhost:5173`; no asumir el puerto si está ocupado).

En desarrollo, `.env.vision-lab.example` ejemplifica `VITE_VISION_SERVICE_URL=http://127.0.0.1:8765` y `VITE_ORBINODO_CLIENT_PROFILE=vision-lab`; copiarla sólo si se necesita configurar **todo** el frontend/backend local, completando valores privados fuera de Git. `src/config/vision-service.ts` usa esa URL o el mismo valor local por defecto. `VITE_*` se incorpora al build; un despliegue HTTPS exigiría URL HTTPS y configuración CORS exacta, pero **este checkpoint no documenta ni autoriza un nuevo despliegue**. `vite.config.ts` también usa `ORBINODO_API_TARGET` para el backend Fastify local (por defecto `http://127.0.0.1:3001`); no es la URL del Vision Service. La interfaz completa puede requerir su backend/login y configuración propios.

**HECHO VALIDADO EN REPRODUCCIÓN LIMPIA (frontend):** `npm ci` instaló 473 paquetes. `npm run build` terminó correctamente; incluyó `tsc --noEmit`, `tsc -p tsconfig.backend.json` y `vite build`. Vite emitió sólo un warning por un chunk superior a 500 kB; no fue un error de build.

**PENDIENTE / deuda técnica de dependencias frontend:** `npm audit` reportó 35 vulnerabilidades en el árbol del checkpoint: 1 low, 13 moderate, 20 high y 1 critical. Este reporte no demuestra que sean explotables directamente en OrbiNodo. No se ejecutó `npm audit fix` ni `npm audit fix --force`, porque alterarían las dependencias y la trazabilidad del checkpoint.

## Firmware, cableado y HTTP

Sketch: `firmware/esp32/phylo_access_actuator/phylo_access_actuator.ino`. Copiar `secrets.example.h` a `secrets.h` en esa carpeta y reemplazar **localmente** `WIFI_SSID` y `WIFI_PASSWORD`; el `.gitignore` de la carpeta excluye `secrets.h`. No publicar credenciales. El hostname configurado es `phylo-access-actuator`, pero la dirección efectiva debe confirmarse en la red Wi-Fi; puede cambiar por DHCP.

**HECHO VALIDADO (sketch):** GPIO `18`, ángulo cerrado `0`, abierto `90`; `WiFi.h` y `WebServer.h` del core ESP32, `ESP32Servo.h` adicional. **PENDIENTE (montaje en otro PC):** verificar modelo de placa, cableado, fuente externa adecuada para el MG995 y **GND común** entre fuente y ESP32 antes de energizar; el código no especifica fuente, voltaje ni corriente. No alimentar el motor desde un GPIO.

ESP32 HTTP, puerto `80`:

| Ruta | Respuesta |
| --- | --- |
| `GET /health` | 200 JSON: `status=ok`, `device=phylo-access-actuator`, `transport=wifi-http`. |
| `GET /status` | 200 JSON: `state`, `servo_angle` (último ángulo ordenado). |
| `POST /open` | 202 JSON `accepted=true,state=OPENING` si estaba cerrado; 409 JSON `accepted=false,state=<estado>` si está ocupado. |

El ciclo físico esperado es `CLOSED → OPENING → OPEN_HOLD → CLOSING → CLOSED` (500 ms + 3000 ms + 500 ms); se ordena 90° al abrir y 0° al entrar en cierre. El sketch usa `delay(500)` **sólo al esperar Wi-Fi en setup**, no para el ciclo.

## Prueba funcional mínima

Con el ESP32 alimentado, red local operativa y Vision Service iniciado, comprobar en PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health
Invoke-RestMethod http://127.0.0.1:8765/api/actuator/status
Invoke-RestMethod -Method Post http://127.0.0.1:8765/api/actuator/open
Invoke-RestMethod http://127.0.0.1:8765/api/actuator/status
```

Se espera `configured=true,available=true`; el POST aceptado devuelve 202 y `OPENING`. Observar físicamente apertura, espera y cierre; volver a consultar estado hasta `CLOSED`/`servo_angle=0`. Un segundo POST durante el ciclo debe recibir 409 sin reiniciarlo. Si se desea probar **desde navegador local**, abrir la web servida por Vite desde un origen permitido y ejecutar manualmente en DevTools `fetch('http://127.0.0.1:8765/api/actuator/open', {method:'POST'}).then(r => r.json())`; la interfaz no proporciona esa acción. No ejecutar la orden sin una persona supervisando el hardware.

El puerto 8765 es del Vision Service; 80, del ESP32; Vite suele usar 5173 y el backend web local, 3001. `http://127.0.0.1:8765` sólo funciona desde el mismo PC; desde otro dispositivo debe usarse una URL accesible y autorizada. El ESP32 y Vision Service deben compartir una red que permita tráfico HTTP entre ellos.

## Checklist y límites

### Estado de reproducción

**HECHO VALIDADO EN REPRODUCCIÓN LIMPIA**

- Python 3.13.2 y entorno `.venv-servo-repro`.
- Instalación desde `vision-service/requirements.lock.txt`; `pip check` OK.
- 21 tests OK (`Ran 21 tests in 0.084s`).
- `npm ci` OK; TypeScript typecheck OK; Vite production build OK, con warning de tamaño de chunk.

**PENDIENTE EN OTRO PC**

- Copiar/descargar y verificar los modelos YuNet/SFace.
- Configurar cámara local y su índice.
- Enrolar usuarios localmente o transferir la DB deliberadamente por un canal seguro; Git no transporta a Diego.
- Cargar firmware ESP32, configurar Wi-Fi y comprobar cableado/alimentación.
- Establecer `VISION_ACTUATOR_URL` con la IP vigente.
- Repetir la validación física del MG995 y del ciclo completo.

- [ ] Rama publicada; checkout en `4b9796d`, sin cambios de fases posteriores.
- [ ] Windows, Git, Python y versiones reales registradas; lock instalado; tests ejecutados y resultado anotado.
- [ ] YuNet/SFace descargados fuera de Git y hashes verificados.
- [ ] Webcam/índice comprobados; usuarios enrolados localmente sólo si corresponde.
- [ ] ESP32/ESP32Servo preparados; `secrets.h` local, fuente externa y GND común verificados.
- [ ] IP actual confirmada; `VISION_ACTUATOR_URL` ajustada; `/api/actuator/status` disponible.
- [ ] Vision Service listo; frontend local instalado con `npm ci` sólo si se usará.
- [ ] Apertura/espera/cierre y rechazo 409 observados físicamente en el PC nuevo.
- [ ] No se subieron secretos, SQLite, embeddings, imágenes ni modelos.

**Límites conocidos:** IP del ESP32 dinámica; DB y modelos locales no viajan con Git; fallos transitorios de captura ya documentados en `README.md`; endpoints de actuador sin autenticación en este código. CORS restringe orígenes de navegador, **no autentica** clientes HTTP. No exponer el Vision Service ni el ESP32 directamente a Internet sin diseñar primero control de acceso. Cloudflare Quick Tunnel, cuando se usa para la demo visual, vuelve accesible el servicio y no constituye ese control.
