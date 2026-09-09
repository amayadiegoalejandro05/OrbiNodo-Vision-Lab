import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import cv2

from app.camera import CameraCapture, FpsMeter
from app.config import VisionServiceConfig
from app.face_detector import YuNetFaceDetector


def main() -> None:
    config = VisionServiceConfig()
    parser = argparse.ArgumentParser(description="Prueba local de detección YuNet.")
    parser.add_argument("--camera-index", type=int, default=config.camera_index)
    parser.add_argument("--inference-width", type=int, default=320)
    parser.add_argument("--inference-height", type=int, default=240)
    args = parser.parse_args()
    detector = YuNetFaceDetector(config.detector_model, config.detector_score_threshold, config.detector_nms_threshold, config.detector_top_k)
    fps = FpsMeter()
    with CameraCapture(args.camera_index) as camera:
        while True:
            frame = camera.read()
            display_height, display_width = frame.shape[:2]
            inference = cv2.resize(frame, (args.inference_width, args.inference_height))
            scale_x = display_width / args.inference_width
            scale_y = display_height / args.inference_height
            for face in detector.detect(inference):
                x, y = int(face.x * scale_x), int(face.y * scale_y)
                width, height = int(face.width * scale_x), int(face.height * scale_y)
                cv2.rectangle(frame, (x, y), (x + width, y + height), (0, 255, 180), 2)
                cv2.putText(frame, f"{face.confidence:.2f}", (x, max(20, y - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 180), 2)
            cv2.putText(frame, f"YuNet {args.inference_width}x{args.inference_height}  {fps.tick():.1f} FPS", (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 180), 2)
            cv2.imshow("OrbiNodo Vision Service - YuNet", frame)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
