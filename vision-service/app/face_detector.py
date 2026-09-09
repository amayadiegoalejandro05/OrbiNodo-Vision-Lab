from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class FaceDetection:
    x: int
    y: int
    width: int
    height: int
    confidence: float
    raw: Any


class YuNetFaceDetector:
    def __init__(self, model_path: Path, score_threshold: float = 0.8, nms_threshold: float = 0.3, top_k: int = 5000) -> None:
        if not model_path.is_file():
            raise FileNotFoundError(f"No se encontró el modelo YuNet: {model_path}")
        import cv2

        self._detector = cv2.FaceDetectorYN.create(str(model_path), "", (320, 240), score_threshold, nms_threshold, top_k)

    def detect(self, frame) -> list[FaceDetection]:
        height, width = frame.shape[:2]
        self._detector.setInputSize((width, height))
        _, faces = self._detector.detect(frame)
        if faces is None:
            return []
        return [FaceDetection(int(face[0]), int(face[1]), int(face[2]), int(face[3]), float(face[14]), face) for face in faces]
