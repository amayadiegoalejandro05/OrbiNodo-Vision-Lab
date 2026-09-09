from pathlib import Path
import os
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.config import VisionServiceConfig, configured_cors_origins
from app.service import create_app


class FakePipeline:
    def __init__(self) -> None:
        self.running = False
        self.starts = 0
        self.stops = 0

    def health(self):
        return {"state": "READY", "prepared": True, "running": self.running, "database": "ready", "models": "ready"}

    def prepare(self):
        return True

    def status(self):
        return {
            "camera": "CAM-ROBOT-01",
            "running": self.running,
            "fps": 30.0,
            "faces": [{"status": "AUTHORIZED", "person_id": 1, "name": "Diego", "similarity": 0.82}],
            "timestamp": "2026-09-08T00:00:00+00:00",
            "error": None,
        }

    def start(self):
        was_running = self.running
        self.running = True
        self.starts += 1
        return not was_running

    def stop(self):
        was_running = self.running
        self.running = False
        self.stops += 1
        return was_running

    def people(self):
        return [{"id": 1, "name": "Diego", "enabled": True, "embedding_count": 15}]

    def latest_jpeg(self):
        return None


class ServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pipeline = FakePipeline()
        self.app = create_app(VisionServiceConfig(camera_index=1), self.pipeline)

    def endpoint(self, path: str, method: str):
        route = next(route for route in self.app.routes if getattr(route, "path", None) == path and method in getattr(route, "methods", set()))
        return route.endpoint

    def test_health_and_public_status(self) -> None:
        health = self.endpoint("/health", "GET")()
        self.assertEqual(health, {"status": "ok", "camera": "CAM-ROBOT-01", "camera_index": 1, "state": "READY", "prepared": True, "running": False, "database": "ready", "models": "ready"})
        status = self.endpoint("/api/vision/status", "GET")()
        self.assertNotIn("embedding", str(status))
        self.assertEqual(status["faces"][0]["name"], "Diego")

    def test_start_stop_are_idempotent_at_http_boundary(self) -> None:
        start = self.endpoint("/api/vision/start", "POST")
        stop = self.endpoint("/api/vision/stop", "POST")
        self.assertTrue(start()["running"])
        self.assertTrue(start()["running"])
        self.assertFalse(stop()["running"])
        self.assertFalse(stop()["running"])

    def test_cors_accepts_only_exact_local_or_https_origins(self) -> None:
        with patch.dict(
            os.environ,
            {
                "VISION_CORS_ORIGINS": (
                    "https://vision-lab.example.test,"
                    "http://127.0.0.1:5173"
                )
            },
        ):
            self.assertEqual(
                configured_cors_origins(),
                (
                    "https://vision-lab.example.test",
                    "http://127.0.0.1:5173",
                ),
            )

        with patch.dict(os.environ, {"VISION_CORS_ORIGINS": "*"}):
            with self.assertRaises(ValueError):
                configured_cors_origins()

        for invalid_origin in (
            "http://vision-lab.example.test",
            "https://vision-lab.example.test/path",
        ):
            with patch.dict(os.environ, {"VISION_CORS_ORIGINS": invalid_origin}):
                with self.assertRaises(ValueError):
                    configured_cors_origins()


if __name__ == "__main__":
    unittest.main()
