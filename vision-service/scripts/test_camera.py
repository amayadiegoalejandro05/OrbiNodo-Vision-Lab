import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import cv2

from app.camera import CameraCapture, FpsMeter
from app.config import VisionServiceConfig


def main() -> None:
    parser = argparse.ArgumentParser(description="Prueba local de webcam para OrbiNodo Vision Service.")
    parser.add_argument("--camera-index", type=int, default=VisionServiceConfig().camera_index)
    args = parser.parse_args()
    fps = FpsMeter()
    with CameraCapture(args.camera_index) as camera:
        while True:
            frame = camera.read()
            height, width = frame.shape[:2]
            cv2.putText(frame, f"{width}x{height}  {fps.tick():.1f} FPS", (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 180), 2)
            cv2.imshow("OrbiNodo Vision Service - Camera", frame)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
