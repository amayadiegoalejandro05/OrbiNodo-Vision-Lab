OrbiNodo Vision Lab

Prototipo experimental de visión para OrbiNodo orientado a validar una arquitectura en la que una cámara física captura vídeo, un servicio local procesa reconocimiento facial y OrbiNodo consume ese nodo de visión de forma remota.

Estado actual validado: Logitech Brio → Vision Service Python/OpenCV → YuNet + SFace → MJPEG/estado → Cloudflare Tunnel HTTPS → OrbiNodo Vision Lab en Vercel → navegador de PC/celular.

1. Alcance

Este repositorio es OrbiNodo Vision Lab, un entorno experimental separado de OrbiNodo principal.

El prototipo actual permite:

Captura de vídeo desde webcam.

Detección facial con YuNet.

Reconocimiento facial con SFace.

Clasificación visual AUTHORIZED / UNKNOWN.

Base biométrica local.

Servicio HTTP local con FastAPI/Uvicorn.

Stream MJPEG.

Consulta de estado del Vision Service.

Consumo remoto temporal mediante Cloudflare Tunnel.

Integración visual con CAM-ROBOT-01 en OrbiNodo Vision Lab.

No debe interpretarse todavía como un subsistema de producción ni como una capacidad consolidada de OrbiNodo Core.

2. Arquitectura

Logitech Brio / webcam
        ↓
OpenCV
        ↓
YuNet + SFace
        ↓
Vision Service Python
http://127.0.0.1:8765
        ↓
Cloudflare Tunnel HTTPS
        ↓
Internet
        ↓
OrbiNodo Vision Lab
https://orbinodo-vision-lab.vercel.app
        ↓
PC / celular

La inferencia facial ocurre localmente en el equipo conectado a la cámara. El navegador no ejecuta el reconocimiento facial.

La base biométrica también permanece local al Vision Node. No debe enviarse a Neon, PostgreSQL ni incluirse en Git.

3. Inicio rápido en un segundo PC

3.1 Requisitos

Entorno validado:

Windows 10/11 x64.

Git.

PowerShell.

Python. El prototipo fue validado físicamente con Python 3.14.7.

Webcam USB; validado con Logitech Brio.

Conexión a Internet para instalación inicial, Cloudflare Tunnel y acceso a Vercel.

cloudflared para la demo remota.

Opcional para trabajar también con el frontend/backend completo:

Node.js + npm.

3.2 Clonar el repositorio

git clone https://github.com/amayadiegoalejandro05/OrbiNodo-Vision-Lab.git
Set-Location .\OrbiNodo-Vision-Lab

Comprueba que estás en el repositorio correcto:

git remote -v
git status

3.3 Preparar el Vision Node

Ejecuta el script de preparación incluido en el repositorio:

.\scripts\setup-vision-node.ps1

Después ejecuta la verificación:

.\scripts\check-vision-node.ps1

El objetivo es comprobar que:

el entorno Python está disponible;

las dependencias están instaladas;

los modelos YuNet y SFace están disponibles y verificados;

la base local del Vision Service puede inicializarse;

no se requieren secretos de producción para ejecutar la visión local.

Si PowerShell bloquea temporalmente la ejecución de scripts en esa terminal:

Set-ExecutionPolicy -Scope Process Bypass

y vuelve a ejecutar los scripts.

3.4 Conectar la webcam

Conecta la Logitech Brio o la webcam que se utilizará.

El índice validado en el equipo original fue 0, pero el índice de una cámara no es una identidad permanente. Windows puede asignar otro índice en otro PC.

Arranca el nodo con:

.\scripts\run-vision-node.ps1 `
  -CameraIndex 0 `
  -CorsOrigins "https://orbinodo-vision-lab.vercel.app"

Mantén esta terminal abierta.

Si la cámara no abre, prueba otro índice únicamente después de comprobar qué cámaras detecta el equipo.

No uses * como CORS en la demo conectada a Vercel.

4. Validación local

En una segunda PowerShell:

Invoke-RestMethod http://127.0.0.1:8765/health

Estado esperado antes de activar la cámara:

status       : ok
camera       : CAM-ROBOT-01
state        : READY
prepared     : True
running      : False
database     : ready
models       : ready

Activa el pipeline:

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8765/api/vision/start

Comprueba el estado:

Invoke-RestMethod http://127.0.0.1:8765/api/vision/status | Format-List *

Estado esperado:

camera    : CAM-ROBOT-01
state     : RUNNING
prepared  : True
running   : True
fps       : > 0
error     :

Abre el stream local:

http://127.0.0.1:8765/stream.mjpg

Endpoints principales:

Endpoint

Función

GET /health

Salud general del Vision Service

GET /api/vision/status

Estado, FPS, rostros y error actual

POST /api/vision/start

Inicia la captura/procesamiento

POST /api/vision/stop

Detiene la captura/procesamiento

GET /api/vision/people

Personas conocidas cargadas

GET /stream.mjpg

Stream MJPEG anotado

5. Reconocimiento facial y datos biométricos

Los datos biométricos no forman parte del repositorio.

Por diseño:

no se versionan embeddings;

no se versiona la base SQLite biométrica;

no se versionan imágenes de enrolamiento;

no se persisten imágenes o vídeo del stream;

los rostros UNKNOWN no deben almacenarse automáticamente;

Neon/Fastify no almacena la biometría del Vision Service.

Por tanto, clonar GitHub reproduce el software, pero no las identidades autorizadas del equipo original.

En un PC nuevo debes ejecutar el flujo de enrolamiento local incluido en el proyecto antes de esperar resultados AUTHORIZED.

Tras enrolar, confirma:

Invoke-RestMethod http://127.0.0.1:8765/api/vision/people

Debe aparecer la persona autorizada con al menos un embedding registrado.

No subas a Git la base biométrica, embeddings ni imágenes reales para “hacer portable” el reconocimiento.

6. Publicar temporalmente el Vision Node por HTTPS

6.1 Instalar Cloudflare Tunnel

winget install --id Cloudflare.cloudflared

Abre una PowerShell nueva y prueba:

cloudflared --version

Si Windows indica que el paquete está instalado pero el comando no está en PATH, comprueba la ubicación usada en la validación original:

& "C:\Program Files (x86)\cloudflared\cloudflared.exe" --version

6.2 Crear un Quick Tunnel

Con el Vision Service corriendo en 127.0.0.1:8765:

cloudflared tunnel --url http://127.0.0.1:8765

o, si debes usar la ruta absoluta:

& "C:\Program Files (x86)\cloudflared\cloudflared.exe" `
  tunnel --url http://127.0.0.1:8765

Cloudflare devolverá una URL temporal:

https://<nombre-aleatorio>.trycloudflare.com

Mantén esa terminal abierta.

Comprueba desde otro dispositivo, idealmente usando datos móviles:

https://<nombre-aleatorio>.trycloudflare.com/health
https://<nombre-aleatorio>.trycloudflare.com/api/vision/status
https://<nombre-aleatorio>.trycloudflare.com/stream.mjpg

Si /stream.mjpg funciona desde el celular, la cadena remota del Vision Node quedó validada.

Importante

Un Quick Tunnel:

es temporal;

cambia de URL cuando se crea uno nuevo;

no tiene garantía de disponibilidad;

no debe considerarse infraestructura de producción;

vuelve públicamente accesible el Vision Service mientras está activo.

CORS no es autenticación.

Finalizada la prueba, detén el túnel con Ctrl+C.

7. Conectar el túnel con OrbiNodo Vision Lab en Vercel

Proyecto Vercel correcto:

orbinodo-vision-lab

No utilizar el proyecto accidental:

orbi-nodo-vision-lab

Frontend público:

https://orbinodo-vision-lab.vercel.app

En:

Vercel
→ orbinodo-vision-lab
→ Settings
→ Environment Variables

crea o actualiza:

VITE_VISION_SERVICE_URL

Valor:

https://<nombre-aleatorio>.trycloudflare.com

Sin /stream.mjpg, sin /health y preferiblemente sin / final.

Para esta demo, configura la variable en Production.

VITE_VISION_SERVICE_URL es una variable de build del frontend. Después de cambiarla debes reconstruir Production:

Deployments
→ deployment estable actual
→ Redeploy

No es necesario desplegar desde una carpeta local con cambios no auditados.

Después abre:

https://orbinodo-vision-lab.vercel.app

Haz login y entra a:

CAM-ROBOT-01

La cadena esperada es:

Brio
  ↓
Vision Service local
  ↓
Cloudflare HTTPS
  ↓
OrbiNodo Vision Lab / Vercel
  ↓
CAM-ROBOT-01
  ↓
PC / celular

8. Apagado correcto

Detén la cámara:

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8765/api/vision/stop

Después:

Ctrl+C en la terminal de Cloudflare.

Ctrl+C en la terminal del Vision Service.

Si se utilizó un Quick Tunnel y la demo terminó, no asumas que la URL seguirá siendo válida para una ejecución futura.

9. Solución de problemas

cloudflared no se reconoce

Comprueba:

winget install --id Cloudflare.cloudflared

y después:

& "C:\Program Files (x86)\cloudflared\cloudflared.exe" --version

/health muestra READY pero no hay vídeo

Eso es normal antes de ejecutar:

Invoke-RestMethod -Method Post http://127.0.0.1:8765/api/vision/start

Estado ERROR

Consulta primero el error real:

Invoke-RestMethod http://127.0.0.1:8765/api/vision/status | Format-List *

No modifiques código antes de identificar el mensaje.

Camera failed for 30 consecutive reads

Este fallo se observó una vez durante la validación con la Brio. La cámara dejó de entregar frames y el pipeline entró correctamente en ERROR.

Comprueba:

que otra aplicación no esté usando la webcam;

que el cable/puerto USB esté estable;

que el índice de cámara sea correcto;

que Windows siga detectando la Brio.

Después puede intentarse nuevamente:

Invoke-RestMethod -Method Post http://127.0.0.1:8765/api/vision/start

Si se vuelve repetitivo, debe tratarse como un problema de estabilidad de adquisición, no ocultarse con reinicios infinitos.

La web de Vercel dice NO CONFIGURADO

Comprueba:

proyecto Vercel correcto: orbinodo-vision-lab;

existencia de VITE_VISION_SERVICE_URL;

URL HTTPS actual del túnel;

redeploy posterior al cambio de la variable.

/health funciona por Cloudflare pero OrbiNodo no conecta

Comprueba que el Vision Service se inició con:

-CorsOrigins "https://orbinodo-vision-lab.vercel.app"

No debilites CORS usando *.

Hay delay

En la validación remota se observó algo de latencia entre la Brio y el navegador a través de Cloudflare/Vercel.

Para la demo actual es aceptable. La reducción de latencia queda como trabajo posterior y debe medirse antes de cambiar arquitectura, códec, FPS, resolución o transporte.

10. Validación del repositorio completo

Antes de publicar cambios del frontend/backend:

npm ci
npm run typecheck
npm run lint
npm test
npm run build:vision-lab

Para el nodo de visión:

.\scripts\check-vision-node.ps1

Y realiza el smoke test físico:

/health             → READY
POST /start         → inicia cámara
/status             → RUNNING, fps > 0, error vacío
/stream.mjpg        → vídeo visible
rostro autorizado   → AUTHORIZED
otro rostro         → UNKNOWN

11. Seguridad y privacidad

Nunca subir al repositorio:

.env locales;

contraseñas;

tokens;

connection strings;

cookies;

bases SQLite biométricas;

embeddings faciales;

imágenes de enrolamiento;

fotografías o vídeos capturados;

credenciales de Neon;

credenciales de Vercel;

credenciales de Cloudflare.

El Vision Service experimental debe permanecer separado de la base PostgreSQL empresarial para los datos biométricos.

12. Estado y limitaciones actuales

Confirmado por pruebas físicas:

Vision Service local operativo.

Logitech Brio operativa.

~30 FPS observados en la prueba local.

Detección/reconocimiento facial funcional.

AUTHORIZED y UNKNOWN validados.

Stream MJPEG local operativo.

Cloudflare Quick Tunnel operativo.

Stream visto desde celular por Internet.

Integración de CAM-ROBOT-01 con OrbiNodo Vision Lab en Vercel operativa.

Login de OrbiNodo Vision Lab validado desde PC y celular.

Limitaciones conocidas:

Quick Tunnel es temporal.

Existe latencia remota visible.

La webcam puede requerir verificar el índice en cada equipo.

Se observó un fallo transitorio de lectura de cámara.

La biometría no se replica por Git, deliberadamente.

El acceso remoto actual es adecuado para demo, no para producción.

13. Próxima evolución razonable

Sin alterar el prototipo validado, los siguientes temas deberán evaluarse por separado:

Reducir y medir latencia extremo a extremo.

Sustituir Quick Tunnel por un túnel estable y autenticado.

Mejorar resiliencia/reconexión de cámara.

Automatizar aún más el bootstrap de un Vision Node.

Definir identidad/configuración de múltiples nodos de visión.

Evaluar qué partes, si alguna, deben evolucionar hacia OrbiNodo Core.

No convertir una necesidad de la demo en una capacidad permanente del Core sin validación.