# Modelos locales requeridos

No se incluyó ningún binario de modelo en el repositorio.

## YuNet

- Archivo: `face_detection_yunet_2023mar.onnx`
- Ruta: `vision-service/models/face_detection_yunet_2023mar.onnx`
- Uso: `cv2.FaceDetectorYN` para detección y cajas faciales.
- Fuente: OpenCV Zoo, `models/face_detection_yunet`.
- Archivo oficial: https://github.com/opencv/opencv_zoo/blob/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
- SHA-256 validado: `8F2383E4DD3CFBB4553EA8718107FC0423210DC964F9F4280604804ED2552FA4`.
- Licencia indicada por el directorio: MIT.

## SFace

- Archivo: `face_recognition_sface_2021dec.onnx`
- Ruta: `vision-service/models/face_recognition_sface_2021dec.onnx`
- Uso: `cv2.FaceRecognizerSF` para alineación, embeddings y comparación.
- Fuente: OpenCV Zoo, `models/face_recognition_sface`.
- Archivo oficial: https://github.com/opencv/opencv_zoo/blob/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx
- SHA-256 validado: `0BA9FBFA01B5270C96627C4EF784DA859931E02F04419C829E83484087C34E79`.
- Licencia indicada por el directorio: Apache-2.0. Revisar avisos y procedencia antes de cualquier uso no experimental.

## MediaPipe Face Landmarker

- Archivo: `face_landmarker.task`
- Ruta: `vision-service/models/face_landmarker.task`
- Uso: MediaPipe Face Landmarker para landmarks faciales.
- Fuente: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- Tamaño: 3758596 bytes.
- SHA-256 validado: `64184E229B263107BC2B804C6625DB1341FF2BB731874B0BCC2FE6544E0BC9FF`.
- Estado de validación: descargado desde la URL indicada y cargado correctamente mediante MediaPipe 1.0.1 con Python 3.13.2. El binario se mantiene local y fuera de Git.

Los binarios no se descargan automáticamente ni se agregan a Git.

## Preparación de otro portátil

1. Descarga manualmente cada archivo desde la ruta oficial indicada.
2. Guárdalo con el nombre exacto dentro de `vision-service/models/`.
3. Ejecuta `scripts/setup-vision-node.ps1`; el script compara SHA-256 de YuNet
   y SFace y se detiene si el contenido no coincide.
4. Para `face_landmarker.task`, verifica manualmente el tamaño y SHA-256
   indicados arriba; el script aún no valida este modelo.

No sustituyas silenciosamente estos archivos por variantes nuevas. Cualquier
actualización de modelo exige revisar procedencia, licencia, compatibilidad y
un nuevo checksum.
