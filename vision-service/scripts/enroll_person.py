import argparse
from pathlib import Path
import sys
from time import monotonic

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import cv2

from app.camera import CameraCapture, FpsMeter
from app.config import VisionServiceConfig
from app.face_database import FaceDatabase
from app.face_detector import YuNetFaceDetector
from app.face_recognizer import SFaceRecognizer


def main() -> None:
    config = VisionServiceConfig()
    parser = argparse.ArgumentParser(description="Registra embeddings SFace locales; no guarda imagenes.")
    parser.add_argument("--camera-index", type=int, default=config.camera_index)
    parser.add_argument("--name", required=True)
    parser.add_argument("--add-samples", action="store_true", help="Permite agregar muestras a una persona existente.")
    parser.add_argument("--samples", type=int, default=config.enrollment_samples)
    parser.add_argument("--sample-interval", type=float, default=config.enrollment_sample_interval_seconds)
    args = parser.parse_args()
    if args.samples < 1 or args.sample_interval <= 0:
        parser.error("--samples debe ser >= 1 y --sample-interval debe ser positivo.")

    database = FaceDatabase(config.database_path)
    person_id, created = database.get_or_create_person(args.name, add_samples=args.add_samples)
    detector = YuNetFaceDetector(config.detector_model, config.detector_score_threshold, config.detector_nms_threshold, config.detector_top_k)
    recognizer = SFaceRecognizer(config.recognizer_model)
    fps = FpsMeter()
    captured = 0
    last_capture_at = float("-inf")
    print("Mire a la camara y varie ligeramente pose/angulo entre muestras. Pulse q o Esc para cancelar.")

    with CameraCapture(args.camera_index) as camera:
        while captured < args.samples:
            frame = camera.read()
            faces = detector.detect(frame)
            now = monotonic()
            for face in faces:
                cv2.rectangle(frame, (face.x, face.y), (face.x + face.width, face.y + face.height), (0, 255, 180), 2)
            status = "Muestre exactamente un rostro"
            if len(faces) == 1 and now - last_capture_at >= args.sample_interval:
                embedding = recognizer.embedding(frame, faces[0].raw).reshape(-1)
                database.add_embedding(person_id, embedding, quality=faces[0].confidence)
                captured += 1
                last_capture_at = now
                status = f"Muestra guardada {captured}/{args.samples}; cambie levemente la pose"
                print(f"{captured}/{args.samples}")
            elif len(faces) > 1:
                status = "Se detectaron multiples rostros; deje solo uno"
            cv2.putText(frame, status, (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 180), 2)
            cv2.putText(frame, f"Enrollment {captured}/{args.samples}  {fps.tick():.1f} FPS", (12, 54), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 180), 2)
            cv2.imshow("OrbiNodo Vision Service - Enrollment", frame)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
    cv2.destroyAllWindows()
    action = "creado" if created else "actualizado"
    print(f"Perfil {action}: {args.name}. Embeddings capturados en esta sesion: {captured}/{args.samples}.")


if __name__ == "__main__":
    main()
