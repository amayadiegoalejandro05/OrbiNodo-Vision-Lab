from dataclasses import dataclass
from pathlib import Path

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision
import numpy as np


class FaceLandmarkerError(Exception):
    """The Face Landmarker could not be initialized or used."""


@dataclass(frozen=True)
class FaceLandmarkerReading:
    landmarks_count: int
    eye_blink_left: float | None
    eye_blink_right: float | None


class FaceLandmarkerAdapter:
    def __init__(self, model_path: str | Path) -> None:
        path = Path(model_path)
        if not path.is_file():
            raise FaceLandmarkerError("Face Landmarker model file does not exist.")

        try:
            options = vision.FaceLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_path=str(path)),
                running_mode=vision.RunningMode.IMAGE,
                num_faces=1,
                output_face_blendshapes=True,
            )
            self._landmarker = vision.FaceLandmarker.create_from_options(options)
        except Exception as error:
            raise FaceLandmarkerError("Could not initialize Face Landmarker.") from error

    def detect(self, frame_bgr: np.ndarray) -> FaceLandmarkerReading | None:
        if (
            not isinstance(frame_bgr, np.ndarray)
            or frame_bgr.dtype != np.uint8
            or frame_bgr.ndim != 3
            or frame_bgr.shape[0] == 0
            or frame_bgr.shape[1] == 0
            or frame_bgr.shape[2] != 3
        ):
            raise FaceLandmarkerError("Expected a non-empty uint8 BGR image with three channels.")

        if self._landmarker is None:
            raise FaceLandmarkerError("Face Landmarker is closed.")

        try:
            frame_rgb = np.ascontiguousarray(frame_bgr[:, :, ::-1])
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
            result = self._landmarker.detect(image)
        except Exception as error:
            raise FaceLandmarkerError("Face Landmarker inference failed.") from error

        if not result.face_landmarks:
            return None

        eye_blink_left = None
        eye_blink_right = None
        if result.face_blendshapes:
            for category in result.face_blendshapes[0]:
                if category.category_name == "eyeBlinkLeft":
                    eye_blink_left = float(category.score)
                elif category.category_name == "eyeBlinkRight":
                    eye_blink_right = float(category.score)

        return FaceLandmarkerReading(
            landmarks_count=len(result.face_landmarks[0]),
            eye_blink_left=eye_blink_left,
            eye_blink_right=eye_blink_right,
        )

    def close(self) -> None:
        landmarker = self._landmarker
        if landmarker is not None:
            self._landmarker = None
            try:
                landmarker.close()
            except Exception as error:
                raise FaceLandmarkerError("Could not close Face Landmarker.") from error

    def __enter__(self) -> "FaceLandmarkerAdapter":
        return self

    def __exit__(self, _exc_type, _exc, _tb) -> None:
        self.close()
