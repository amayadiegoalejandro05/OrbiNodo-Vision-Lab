from collections import deque
from time import perf_counter
from typing import Any


class FpsMeter:
    def __init__(self, samples: int = 30) -> None:
        self._times: deque[float] = deque(maxlen=samples)

    def tick(self) -> float:
        self._times.append(perf_counter())
        if len(self._times) < 2:
            return 0.0
        elapsed = self._times[-1] - self._times[0]
        return (len(self._times) - 1) / elapsed if elapsed > 0 else 0.0


class CameraCapture:
    def __init__(self, camera_index: int, width: int | None = None, height: int | None = None) -> None:
        self.camera_index = camera_index
        self.width = width
        self.height = height
        self._capture: Any | None = None

    def open(self) -> None:
        import cv2

        self._capture = cv2.VideoCapture(self.camera_index)
        if not self._capture.isOpened():
            self.release()
            raise RuntimeError(f"No se pudo abrir la cámara con índice {self.camera_index}.")
        if self.width is not None:
            self._capture.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        if self.height is not None:
            self._capture.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)

    def read(self):
        if self._capture is None:
            raise RuntimeError("La cámara no está abierta.")
        ok, frame = self._capture.read()
        if not ok or frame is None:
            raise RuntimeError("No se pudo leer un frame de la cámara.")
        return frame

    def release(self) -> None:
        if self._capture is not None:
            self._capture.release()
            self._capture = None

    def __enter__(self) -> "CameraCapture":
        self.open()
        return self

    def __exit__(self, *_: object) -> None:
        self.release()
