# CHECKPOINT — Reconocimiento + parpadeo + actuación automática

Fecha de validación: 2026-10-06
Rama: feature/phylo-access-integration

## 1. Objetivo del avance

Integrar físicamente la cadena:

Logitech Brio
→ detección facial
→ reconocimiento SFace
→ usuario activo AUTHORIZED
→ Face Landmarker
→ conteo de 3 parpadeos
→ confirmación gestual
→ Vision Service
→ ActuatorClient
→ Wi-Fi / HTTP
→ ESP32
→ MG995

## 2. Percepción validada

Se validó físicamente con cámara real:

- Vision Service operativo.
- Cámara Logitech Brio en VISION_CAMERA_INDEX=0.
- Detección facial YuNet.
- Reconocimiento SFace.
- Usuario Diego reconocido como AUTHORIZED.
- Selección de usuario activo.
- Face Landmarker operativo.
- Conteo de parpadeos:
  - 0/3
  - 1/3
  - 2/3
  - 3/3
- blink_confirmed=True al completar tres parpadeos.

Umbrales experimentales actuales:

- OPEN <= 0.20
- CLOSED >= 0.60
- objetivo = 3 parpadeos

La confirmación por parpadeo es experimental.
NO debe describirse como liveness robusto ni anti-spoofing.

## 3. Actuación validada

ESP32 utilizado mediante Wi-Fi/HTTP.

IP utilizada durante esta sesión:

192.168.40.169

Esta IP es dinámica y NO debe hardcodearse.

Endpoints verificados:

GET /health
GET /status
POST /open

Se validó:

PC
→ Vision Service
→ ActuatorClient
→ HTTP/Wi-Fi
→ ESP32
→ MG995

Resultado físico:

MG995
→ apertura
→ espera
→ cierre

## 4. Integración automática validada

Se implementó monitorización en service.py.

Regla:

AUTHORIZED
+
blink_confirmed=True
→ ActuatorClient.open()

Se añadió un latch para garantizar:

una confirmación
→ máximo un intento de apertura

Mientras blink_confirmed permanezca en True,
no se generan aperturas repetidas.

Cuando desaparece la condición de confirmación,
el sistema se rearma para una nueva secuencia.

## 5. Prueba física extremo a extremo

Secuencia ejecutada:

1. Diego se posiciona frente a la cámara.
2. El sistema reporta AUTHORIZED.
3. blink_count inicia en 0/3.
4. Se realizan tres parpadeos.
5. El sistema confirma la secuencia.
6. Vision Service genera automáticamente OPEN.
7. ESP32 recibe la orden.
8. MG995 abre.
9. MG995 mantiene la apertura.
10. MG995 vuelve a cerrar.

Resultado:

VALIDADO FÍSICAMENTE.

No fue necesario ejecutar manualmente POST /api/actuator/open
durante esta prueba extremo a extremo.

## 6. Pruebas automatizadas

Entorno:

.venv-lock-repro

Suite completa:

Ran 62 tests in 0.601s
OK

Se añadió específicamente una prueba para verificar:

- blink_confirmed=False → no abre.
- False → True → una apertura.
- True sostenido → no genera aperturas adicionales.

## 7. Archivos modificados

vision-service/app/config.py
vision-service/app/pipeline.py
vision-service/app/service.py
vision-service/tests/test_service.py

Cambios principales:

config.py
- modelo Face Landmarker.
- umbrales de parpadeo.
- objetivo de tres parpadeos.

pipeline.py
- integración FaceLandmarkerAdapter.
- integración BlinkConfirmationTracker.
- estado blink_count.
- estado blink_target.
- estado blink_confirmed.
- reinicio por pérdida/cambio de usuario o condición no válida.

service.py
- monitor de confirmación.
- unión percepción → ActuatorClient.
- latch para evitar aperturas repetidas.
- cancelación limpia de la tarea durante shutdown.

test_service.py
- pruebas de integración de parpadeos.
- prueba de apertura única por confirmación.

## 8. Estado del prototipo

VALIDADO:

- percepción facial;
- reconocimiento AUTHORIZED/UNKNOWN;
- usuario activo;
- confirmación experimental mediante tres parpadeos;
- comunicación PC ↔ ESP32;
- servidor HTTP del ESP32;
- MG995;
- actuación manual mediante API;
- actuación automática después de tres parpadeos;
- prueba física extremo a extremo;
- 62/62 pruebas automatizadas.

PENDIENTE / NO DEMOSTRADO:

- visualización completa de todos estos estados en la web;
- liveness robusto;
- anti-spoofing;
- autenticación robusta de endpoints;
- robustez multiusuario;
- sistema certificado de control de acceso.

## 9. Hito alcanzado

AUTHORIZED
→ 3 parpadeos
→ confirmación
→ decisión en Vision Service
→ Wi-Fi/HTTP
→ ESP32
→ MG995
→ apertura
→ espera
→ cierre

Este constituye el checkpoint funcional principal de la integración
percepción-decisión-actuación del demo actual.
