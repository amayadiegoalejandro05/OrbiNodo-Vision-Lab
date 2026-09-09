import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np

from app.camera import CameraCapture, FpsMeter
from app.config import VisionServiceConfig
from app.face_database import FaceDatabase
from app.face_detector import YuNetFaceDetector
from app.face_recognizer import SFaceRecognizer


def main() -> None:
    config = VisionServiceConfig()
    parser = argparse.ArgumentParser(description="Reconocimiento SFace local contra perfiles SQLite habilitados.")
    parser.add_argument("--camera-index", type=int, default=config.camera_index)
    args = parser.parse_args()

    database = FaceDatabase(config.database_path)
    database.initialize()
    candidates = [
        (person_id, name, np.asarray(embedding, dtype=np.float32).reshape(1, -1))
        for person_id, name, embedding in database.load_enabled_embeddings()
    ]
    print(f"Perfiles habilitados cargados en memoria: {len(candidates)} embeddings.")
    detector = YuNetFaceDetector(config.detector_model, config.detector_score_threshold, config.detector_nms_threshold, config.detector_top_k)
    recognizer = SFaceRecognizer(config.recognizer_model)
    fps = FpsMeter()

    with CameraCapture(args.camera_index) as camera:
        while True:
            frame = camera.read()
            faces = detector.detect(frame)
            for face in faces:
                query = recognizer.embedding(frame, face.raw)
                candidate = recognizer.best_candidate(query, candidates)
                authorized = candidate is not None and candidate.similarity >= config.cosine_match_threshold
                name = candidate.name if authorized and candidate is not None else "UNKNOWN"
                similarity = candidate.similarity if candidate is not None else 0.0
                color = (0, 255, 100) if authorized else (0, 80, 255)
                cv2.rectangle(frame, (face.x, face.y), (face.x + face.width, face.y + face.height), color, 2)
                cv2.putText(frame, f"{name} {similarity:.3f}", (face.x, max(20, face.y - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
            cv2.putText(frame, f"SFace {fps.tick():.1f} FPS  threshold={config.cosine_match_threshold:.3f}", (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 180), 2)
            cv2.imshow("OrbiNodo Vision Service - Face Recognition", frame)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
