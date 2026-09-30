from pathlib import Path
import asyncio
import json
import os
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.actuator_client import ActuatorClientError
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


class FakeActuator:
    def __init__(self, open_result=None, error=None) -> None:
        self.open_result = open_result or {"accepted": True, "state": "OPENING"}
        self.error = error
        self.status_calls = 0
        self.open_calls = 0

    def status(self):
        self.status_calls += 1
        if self.error is not None:
            raise self.error
        return {"state": "CLOSED", "servo_angle": 0}

    def open(self):
        self.open_calls += 1
        if self.error is not None:
            raise self.error
        return self.open_result


class ServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pipeline = FakePipeline()
        self.app = create_app(VisionServiceConfig(camera_index=1), self.pipeline)

    def endpoint(self, path: str, method: str):
        route = next(route for route in self.app.routes if getattr(route, "path", None) == path and method in getattr(route, "methods", set()))
        return route.endpoint

    def actuator_endpoint(self, app, path: str, method: str):
        route = next(
            route for route in app.routes
            if getattr(route, "path", None) == path
            and method in getattr(route, "methods", set())
        )
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

    def test_actuator_unconfigured_returns_503(self) -> None:
        self.assertIsNone(self.app.state.actuator_client)
        for path, method in (
            ("/api/actuator/status", "GET"),
            ("/api/actuator/open", "POST"),
        ):
            response = self.actuator_endpoint(self.app, path, method)()
            self.assertEqual(response.status_code, 503)
            self.assertEqual(
                json.loads(response.body),
                {
                    "configured": False,
                    "available": False,
                    "error": "Actuator is not configured.",
                },
            )

    def test_actuator_status_returns_200_with_esp32_data(self) -> None:
        actuator = FakeActuator()
        config = VisionServiceConfig(camera_index=1, actuator_url="http://192.0.2.10")
        with patch("app.service.ActuatorClient") as client_type:
            app = create_app(config, self.pipeline, actuator)
        client_type.assert_not_called()
        self.assertIs(app.state.actuator_client, actuator)

        response = self.actuator_endpoint(app, "/api/actuator/status", "GET")()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            json.loads(response.body),
            {"configured": True, "available": True, "state": "CLOSED", "servo_angle": 0},
        )
        self.assertEqual(actuator.status_calls, 1)

    def test_actuator_open_accepted_returns_202(self) -> None:
        actuator = FakeActuator()
        app = create_app(VisionServiceConfig(camera_index=1), self.pipeline, actuator)
        response = self.actuator_endpoint(app, "/api/actuator/open", "POST")()

        self.assertEqual(response.status_code, 202)
        self.assertEqual(
            json.loads(response.body),
            {"configured": True, "available": True, "accepted": True, "state": "OPENING"},
        )
        self.assertEqual(actuator.open_calls, 1)

    def test_actuator_open_busy_returns_409(self) -> None:
        actuator = FakeActuator({"accepted": False, "state": "OPEN_HOLD"})
        app = create_app(VisionServiceConfig(camera_index=1), self.pipeline, actuator)
        response = self.actuator_endpoint(app, "/api/actuator/open", "POST")()

        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            json.loads(response.body),
            {"configured": True, "available": True, "accepted": False, "state": "OPEN_HOLD"},
        )
        self.assertEqual(actuator.open_calls, 1)

    def test_actuator_unreachable_returns_503(self) -> None:
        actuator = FakeActuator(error=ActuatorClientError("Actuator host is unreachable."))
        app = create_app(VisionServiceConfig(camera_index=1), self.pipeline, actuator)
        for path, method in (
            ("/api/actuator/status", "GET"),
            ("/api/actuator/open", "POST"),
        ):
            response = self.actuator_endpoint(app, path, method)()
            self.assertEqual(response.status_code, 503)
            self.assertEqual(
                json.loads(response.body),
                {
                    "configured": True,
                    "available": False,
                    "error": "Actuator host is unreachable.",
                },
            )

    def test_configured_actuator_is_created_without_request(self) -> None:
        config = VisionServiceConfig(
            camera_index=1,
            actuator_url="http://192.0.2.10",
            actuator_timeout_seconds=1.5,
        )
        with patch("app.service.ActuatorClient") as client_type:
            app = create_app(config, self.pipeline)

            async def run_lifespan():
                async with app.router.lifespan_context(app):
                    pass

            asyncio.run(run_lifespan())

        client_type.assert_called_once_with("http://192.0.2.10", 1.5)
        self.assertIs(app.state.actuator_client, client_type.return_value)
        client_type.return_value.status.assert_not_called()
        client_type.return_value.open.assert_not_called()


if __name__ == "__main__":
    unittest.main()
