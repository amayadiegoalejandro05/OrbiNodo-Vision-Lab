from pathlib import Path
import asyncio
import json
import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.actuator_client import ActuatorClientError
from app.config import VisionServiceConfig, configured_cors_origins
from app.face_detector import FaceDetection
from app.face_landmarker import FaceLandmarkerError, FaceLandmarkerReading
from app.face_recognizer import FaceMatch
from app.pipeline import VisionPipeline
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


    def test_blink_confirmation_opens_actuator_once(self) -> None:
        class BlinkPipeline(FakePipeline):
            def __init__(self) -> None:
                super().__init__()
                self.confirmed = False

            def status(self):
                result = super().status()
                result["active_user"] = {
                    "status": "AUTHORIZED",
                    "person_id": 1,
                    "name": "Diego",
                    "similarity": 0.82,
                }
                result["blink_confirmed"] = self.confirmed
                return result

        pipeline = BlinkPipeline()
        actuator = FakeActuator()
        app = create_app(
            VisionServiceConfig(camera_index=1),
            pipeline,
            actuator,
        )

        async def run_lifespan():
            async with app.router.lifespan_context(app):
                self.assertEqual(actuator.open_calls, 0)

                pipeline.confirmed = True
                await asyncio.sleep(0.20)

                self.assertEqual(actuator.open_calls, 1)

                await asyncio.sleep(0.20)
                self.assertEqual(actuator.open_calls, 1)

        asyncio.run(run_lifespan())


class PipelineActiveUserTests(unittest.TestCase):
    def run_frame(self, faces: list[FaceDetection], matches: dict[int, FaceMatch]):
        pipeline = VisionPipeline(VisionServiceConfig(camera_index=1))
        detector = MagicMock()
        detector.detect.return_value = faces
        recognizer = MagicMock()
        recognizer.embedding.side_effect = lambda _frame, raw: raw
        recognizer.best_candidate.side_effect = lambda query, _candidates: matches.get(query)
        pipeline._prepared = True
        pipeline._detector = detector
        pipeline._recognizer = recognizer

        camera = MagicMock()
        camera.read.return_value = MagicMock()

        def encode(*_args):
            pipeline._stop_event.set()
            return True, SimpleNamespace(tobytes=lambda: b"jpeg")

        fake_cv2 = SimpleNamespace(
            rectangle=lambda *_args: None,
            putText=lambda *_args: None,
            imencode=encode,
            FONT_HERSHEY_SIMPLEX=0,
            LINE_AA=0,
            IMWRITE_JPEG_QUALITY=0,
        )

        with (
            patch("app.pipeline.CameraCapture", return_value=camera),
            patch("app.pipeline.FpsMeter") as fps_meter,
            patch("app.pipeline.FaceLandmarkerAdapter"),
            patch.dict(sys.modules, {"cv2": fake_cv2}),
        ):
            fps_meter.return_value.tick.return_value = 30.0
            pipeline._run()

        camera.open.assert_called_once()
        camera.release.assert_called_once()
        detector.detect.assert_called_once()
        self.assertIsNone(pipeline.status()["error"])
        return pipeline.status(), recognizer

    @staticmethod
    def face(index: int, width: int, height: int) -> FaceDetection:
        return FaceDetection(
            x=0,
            y=0,
            width=width,
            height=height,
            confidence=0.9,
            raw=index,
        )

    def test_no_faces_has_no_active_user(self) -> None:
        status, recognizer = self.run_frame([], {})
        self.assertEqual(status["faces"], [])
        self.assertIsNone(status["active_face_index"])
        self.assertIsNone(status["active_user"])
        recognizer.embedding.assert_not_called()

    def test_largest_face_maps_to_same_public_face(self) -> None:
        faces = [
            self.face(0, 10, 10),
            self.face(1, 30, 20),
            self.face(2, 20, 20),
        ]
        matches = {
            0: FaceMatch(1, "First", 0.8),
            1: FaceMatch(2, "Largest", 0.9),
            2: FaceMatch(3, "Third", 0.7),
        }
        status, recognizer = self.run_frame(faces, matches)

        self.assertEqual(recognizer.embedding.call_count, 3)
        self.assertEqual(len(status["faces"]), 3)
        self.assertEqual(status["active_face_index"], 1)
        self.assertEqual(status["active_user"], status["faces"][1])
        self.assertEqual(status["active_user"]["name"], "Largest")

    def test_largest_unknown_face_remains_active(self) -> None:
        faces = [self.face(0, 10, 10), self.face(1, 30, 20)]
        matches = {
            0: FaceMatch(1, "Known", 0.8),
            1: FaceMatch(2, "Below threshold", 0.1),
        }
        status, _ = self.run_frame(faces, matches)

        self.assertEqual(status["active_face_index"], 1)
        self.assertEqual(status["active_user"], status["faces"][1])
        self.assertEqual(
            status["active_user"],
            {"status": "UNKNOWN", "person_id": None, "name": None, "similarity": 0.1},
        )


class PipelineBlinkTests(unittest.TestCase):
    @staticmethod
    def face(person_id: int) -> FaceDetection:
        return FaceDetection(0, 0, 20, 20, 0.9, person_id)

    def run_frames(self, face_batches, readings, *, model_error=False):
        pipeline = VisionPipeline(VisionServiceConfig(camera_index=1))
        pipeline._prepared = True
        detector = MagicMock()
        detector.detect.side_effect = face_batches
        recognizer = MagicMock()
        recognizer.embedding.side_effect = lambda _frame, raw: raw
        recognizer.best_candidate.side_effect = lambda raw, _candidates: (
            FaceMatch(raw, f"Person {raw}", 0.9) if raw > 0 else None
        )
        pipeline._detector = detector
        pipeline._recognizer = recognizer

        camera = MagicMock()
        camera.read.return_value = MagicMock()
        snapshots = []
        publish = pipeline._publish

        def capture(*args):
            publish(*args)
            snapshots.append(pipeline.status())

        pipeline._publish = capture

        def encode(*_args):
            if len(snapshots) + 1 == len(face_batches):
                pipeline._stop_event.set()
            return True, SimpleNamespace(tobytes=lambda: b"jpeg")

        fake_cv2 = SimpleNamespace(
            rectangle=lambda *_args: None,
            putText=lambda *_args: None,
            imencode=encode,
            FONT_HERSHEY_SIMPLEX=0,
            LINE_AA=0,
            IMWRITE_JPEG_QUALITY=0,
        )
        landmarker = MagicMock()
        landmarker.detect.side_effect = readings
        landmarker_type = MagicMock(return_value=landmarker)
        if model_error:
            landmarker_type.side_effect = FaceLandmarkerError("model unavailable")

        with (
            patch("app.pipeline.CameraCapture", return_value=camera),
            patch("app.pipeline.FpsMeter") as fps_meter,
            patch("app.pipeline.FaceLandmarkerAdapter", landmarker_type),
            patch.dict(sys.modules, {"cv2": fake_cv2}),
        ):
            fps_meter.return_value.tick.return_value = 30.0
            pipeline._run()

        self.assertIsNone(pipeline.status()["error"])
        self.assertEqual(pipeline.status()["blink_count"], 0)
        self.assertFalse(pipeline.status()["blink_confirmed"])
        camera.release.assert_called_once()
        if not model_error:
            landmarker.close.assert_called_once()
        return pipeline, snapshots, landmarker

    @staticmethod
    def reading(score):
        return FaceLandmarkerReading(478, score, score)

    def test_initial_blink_status(self) -> None:
        pipeline = VisionPipeline(VisionServiceConfig())
        self.assertEqual(
            {key: pipeline.status()[key] for key in ("blink_count", "blink_target", "blink_confirmed")},
            {"blink_count": 0, "blink_target": 3, "blink_confirmed": False},
        )

    def test_single_authorized_face_counts_one_blink(self) -> None:
        faces = [[self.face(1)]] * 3
        _, snapshots, landmarker = self.run_frames(
            faces, [self.reading(score) for score in (0.10, 0.70, 0.10)]
        )
        self.assertEqual([item["blink_count"] for item in snapshots], [0, 0, 1])
        self.assertEqual(landmarker.detect.call_count, 3)

    def test_three_cycles_confirm(self) -> None:
        scores = [0.10, 0.70, 0.10, 0.70, 0.10, 0.70, 0.10]
        _, snapshots, _ = self.run_frames(
            [[self.face(1)]] * len(scores), [self.reading(score) for score in scores]
        )
        self.assertEqual(snapshots[-1]["blink_count"], 3)
        self.assertEqual(snapshots[-1]["blink_target"], 3)
        self.assertTrue(snapshots[-1]["blink_confirmed"])

    def test_unknown_resets_progress(self) -> None:
        _, snapshots, landmarker = self.run_frames(
            [[self.face(1)]] * 3 + [[self.face(0)]],
            [self.reading(score) for score in (0.10, 0.70, 0.10)],
        )
        self.assertEqual([item["blink_count"] for item in snapshots], [0, 0, 1, 0])
        self.assertEqual(landmarker.detect.call_count, 3)

    def test_no_face_resets_progress(self) -> None:
        _, snapshots, landmarker = self.run_frames(
            [[self.face(1)]] * 3 + [[]],
            [self.reading(score) for score in (0.10, 0.70, 0.10)],
        )
        self.assertEqual(snapshots[-1]["blink_count"], 0)
        self.assertEqual(landmarker.detect.call_count, 3)

    def test_multiple_faces_reset_progress(self) -> None:
        _, snapshots, landmarker = self.run_frames(
            [[self.face(1)]] * 3 + [[self.face(1), self.face(2)]],
            [self.reading(score) for score in (0.10, 0.70, 0.10)],
        )
        self.assertEqual(snapshots[-1]["blink_count"], 0)
        self.assertEqual(landmarker.detect.call_count, 3)

    def test_person_change_resets_before_new_scores(self) -> None:
        _, snapshots, _ = self.run_frames(
            [[self.face(1)]] * 3 + [[self.face(2)]],
            [self.reading(score) for score in (0.10, 0.70, 0.10, 0.70)],
        )
        self.assertEqual(snapshots[2]["blink_count"], 1)
        self.assertEqual(snapshots[3]["blink_count"], 0)

    def test_missing_landmarker_reading_does_not_invent_blink(self) -> None:
        _, snapshots, _ = self.run_frames(
            [[self.face(1)]] * 4,
            [self.reading(0.10), None, self.reading(0.70), self.reading(0.10)],
        )
        self.assertEqual([item["blink_count"] for item in snapshots], [0, 0, 0, 1])

    def test_landmarker_error_resets_but_pipeline_continues(self) -> None:
        _, snapshots, landmarker = self.run_frames(
            [[self.face(1)]] * 5,
            [self.reading(0.10), self.reading(0.70), self.reading(0.10),
             FaceLandmarkerError("inference failed"), self.reading(0.10)],
        )
        self.assertEqual([item["blink_count"] for item in snapshots], [0, 0, 1, 0, 0])
        self.assertEqual(landmarker.detect.call_count, 5)

    def test_landmarker_initialization_failure_keeps_recognition_running(self) -> None:
        _, snapshots, _ = self.run_frames([[self.face(1)]], [], model_error=True)
        self.assertEqual(snapshots[0]["active_user"]["status"], "AUTHORIZED")
        self.assertEqual(snapshots[0]["blink_count"], 0)


if __name__ == "__main__":
    unittest.main()
