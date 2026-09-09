# OrbiNodo Vision Service

Componente experimental local e independiente para la futura percepción de
CAM-ROBOT-01. No se conecta a OrbiNodo, Fastify, PostgreSQL, Neon ni al
navegador en esta fase.

Incluye pruebas manuales de webcam, detección YuNet, enrollment SFace y
reconocimiento local contra SQLite. La base se crea sólo al registrar,
inspeccionar o reconocer identidades locales.

## Privacidad

No se guarda vídeo, frames ni imágenes de desconocidos. La base SQLite de
embeddings es local, queda ignorada por Git y usa BLOB `float32`
little-endian de 128 valores, serializado con `struct` y sin pickle.

## Uso local

```powershell
cd vision-service
python scripts/test_camera.py --camera-index 1
python scripts/test_face_detection.py --camera-index 1
python scripts/enroll_person.py --camera-index 1 --name "Diego"
python scripts/test_face_recognition.py --camera-index 1
python scripts/list_known_people.py
```

Windows puede reasignar los índices cuando se conectan o desconectan cámaras.
No se debe asumir que Logitech Brio siempre será `0` o `1`. Para probar un
índice manualmente, ejecuta `python scripts/test_camera.py --camera-index N`;
esta acción abre la cámara sólo cuando el operador la solicita y no guarda
fotografías automáticamente.

El enrollment exige exactamente un rostro, alinea el rostro con los landmarks
de YuNet usando `FaceRecognizerSF.alignCrop` y guarda sólo 15 embeddings SFace
`float32`. Entre muestras hay 0.75 s; se debe variar levemente la pose. No se
guardan fotos ni vídeo.

Para agregar muestras a un nombre existente se requiere `--add-samples`; sin
esa confirmación el script se detiene. El reconocimiento carga perfiles
habilitados y embeddings en memoria al iniciar. Cada rostro se compara con
todas las muestras mediante `cv2.FaceRecognizerSF.match` con métrica cosine;
se elige el mayor score por persona y se autoriza sólo si supera `0.363`.
Es un umbral experimental inicial de OpenCV SFace, no una calibración
biométrica definitiva.

## Servicio HTTP local

El servicio mantiene una única captura compartida en un hilo de fondo. Los
endpoints sólo leen su último frame y estado; no abren otra webcam ni consultan
SQLite por frame.

```powershell
cd vision-service
..\.venv\Scripts\python.exe -m uvicorn app.service:app --host 127.0.0.1 --port 8765
```

CORS acepta únicamente orígenes explícitos. Sin configuración usa los puertos
locales de Vite; `VISION_CORS_ORIGINS` permite una lista separada por comas con
orígenes localhost exactos y la URL HTTPS exacta de Vision Lab en Vercel.
Los comodines y orígenes HTTP no locales son rechazados.

## Nodo remoto reproducible

Desde la raíz del repositorio:

```powershell
.\scripts\setup-vision-node.ps1
.\scripts\run-vision-node.ps1 -CameraIndex 1 -CorsOrigins "https://URL-EXACTA-VERCEL"
.\scripts\check-vision-node.ps1
```

El setup usa `requirements.lock.txt`, comprueba los modelos por SHA-256 y no
enrola personas. El run configura MSMF, muestra host, puerto, cámara y origins,
y no abre la webcam hasta `POST /api/vision/start`. El check consulta health y
status sin iniciar ni detener la cámara.

La base biométrica y los ONNX permanecen fuera de Git. En un portátil nuevo,
los modelos se obtienen manualmente como explica `models/README.md` y el
enrollment de cada persona se hace localmente.
