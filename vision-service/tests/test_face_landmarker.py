from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.face_landmarker import (
    FaceLandmarkerAdapter,
    FaceLandmarkerError,
    FaceLandmarkerReading,
)


class FaceLandmarkerAdapterTests(unittest.TestCase):
    def make_adapter(self):
        backend = MagicMock()
        with (
            patch("app.face_landmarker.Path.is_file", return_value=True),
            patch(
                "app.face_landmarker.vision.FaceLandmarker.create_from_options",
                return_value=backend,
            ) as factory,
        ):
            adapter = FaceLandmarkerAdapter("face_landmarker.task")
        return adapter, backend, factory.call_args.args[0]

    def test_missing_model_raises_specific_error(self) -> None:
        with patch("app.face_landmarker.Path.is_file", return_value=False):
            with self.assertRaises(FaceLandmarkerError):
                FaceLandmarkerAdapter("missing.task")

    def test_constructor_uses_synchronous_single_face_blendshapes(self) -> None:
        adapter, backend, options = self.make_adapter()
        self.assertEqual(options.base_options.model_asset_path, "face_landmarker.task")
        self.assertEqual(options.running_mode.name, "IMAGE")
        self.assertEqual(options.num_faces, 1)
        self.assertTrue(options.output_face_blendshapes)
        self.assertIsNone(options.result_callback)
        adapter.close()
        backend.close.assert_called_once()

    def test_invalid_frame_raises_specific_error(self) -> None:
        adapter, backend, _ = self.make_adapter()
        invalid_frames = (
            None,
            np.empty((0, 2, 3), dtype=np.uint8),
            np.zeros((2, 2), dtype=np.uint8),
            np.zeros((2, 2, 4), dtype=np.uint8),
            np.zeros((2, 2, 3), dtype=np.float32),
        )
        for frame in invalid_frames:
            with self.subTest(shape=getattr(frame, "shape", None)):
                with self.assertRaises(FaceLandmarkerError):
                    adapter.detect(frame)
        backend.detect.assert_not_called()
        adapter.close()

    def test_no_face_returns_none(self) -> None:
        adapter, backend, _ = self.make_adapter()
        backend.detect.return_value = SimpleNamespace(face_landmarks=[], face_blendshapes=[])
        self.assertIsNone(adapter.detect(np.zeros((2, 2, 3), dtype=np.uint8)))
        adapter.close()

    def test_face_extracts_landmark_count_and_named_blendshapes(self) -> None:
        adapter, backend, _ = self.make_adapter()
        backend.detect.return_value = SimpleNamespace(
            face_landmarks=[[object()] * 478],
            face_blendshapes=[
                [
                    SimpleNamespace(category_name="eyeBlinkRight", score=0.7),
                    SimpleNamespace(category_name="jawOpen", score=0.2),
                    SimpleNamespace(category_name="eyeBlinkLeft", score=0.4),
                ]
            ],
        )
        reading = adapter.detect(np.array([[[1, 2, 3]]], dtype=np.uint8))

        self.assertEqual(reading, FaceLandmarkerReading(478, 0.4, 0.7))
        image = backend.detect.call_args.args[0]
        np.testing.assert_array_equal(
            image.numpy_view(), np.array([[[3, 2, 1]]], dtype=np.uint8)
        )
        adapter.close()

    def test_missing_blendshapes_are_none(self) -> None:
        adapter, backend, _ = self.make_adapter()
        backend.detect.return_value = SimpleNamespace(
            face_landmarks=[[object()] * 478], face_blendshapes=[]
        )
        self.assertEqual(
            adapter.detect(np.zeros((2, 2, 3), dtype=np.uint8)),
            FaceLandmarkerReading(478, None, None),
        )
        adapter.close()

    def test_one_missing_blendshape_is_none(self) -> None:
        adapter, backend, _ = self.make_adapter()
        backend.detect.return_value = SimpleNamespace(
            face_landmarks=[[object()] * 478],
            face_blendshapes=[
                [SimpleNamespace(category_name="eyeBlinkLeft", score=0.3)]
            ],
        )
        self.assertEqual(
            adapter.detect(np.zeros((2, 2, 3), dtype=np.uint8)),
            FaceLandmarkerReading(478, 0.3, None),
        )
        adapter.close()

    def test_close_is_idempotent(self) -> None:
        adapter, backend, _ = self.make_adapter()
        adapter.close()
        adapter.close()
        backend.close.assert_called_once()
        with self.assertRaises(FaceLandmarkerError):
            adapter.detect(np.zeros((2, 2, 3), dtype=np.uint8))

    def test_context_manager_closes_backend(self) -> None:
        adapter, backend, _ = self.make_adapter()
        with adapter as entered:
            self.assertIs(entered, adapter)
        backend.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
