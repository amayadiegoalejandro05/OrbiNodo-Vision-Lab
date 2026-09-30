from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.active_user import select_active_face_index
from app.face_detector import FaceDetection


def face(width: int, height: int) -> FaceDetection:
    return FaceDetection(
        x=0,
        y=0,
        width=width,
        height=height,
        confidence=0.9,
        raw=None,
    )


class ActiveUserTests(unittest.TestCase):
    def test_empty_faces_returns_none(self) -> None:
        self.assertIsNone(select_active_face_index([]))

    def test_one_face_returns_zero(self) -> None:
        self.assertEqual(select_active_face_index([face(20, 30)]), 0)

    def test_two_faces_selects_larger_area(self) -> None:
        self.assertEqual(select_active_face_index([face(10, 10), face(20, 10)]), 1)

    def test_four_faces_selects_largest_beyond_second(self) -> None:
        faces = [face(10, 10), face(20, 10), face(30, 20), face(10, 20)]
        self.assertEqual(select_active_face_index(faces), 2)

    def test_equal_areas_keep_first(self) -> None:
        self.assertEqual(select_active_face_index([face(20, 10), face(10, 20)]), 0)


if __name__ == "__main__":
    unittest.main()
