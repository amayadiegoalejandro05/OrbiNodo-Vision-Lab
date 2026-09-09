from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.face_database import FaceDatabase, deserialize_embedding, serialize_embedding
from app.face_recognizer import SFaceRecognizer


class _Matcher:
    def cosine_similarity(self, _query, candidate) -> float:
        return float(candidate)

    best_candidate = SFaceRecognizer.best_candidate
    best_match = SFaceRecognizer.best_match


class FaceDatabaseTests(unittest.TestCase):
    def test_embedding_round_trip(self) -> None:
        values = [float(index) / 10 for index in range(128)]
        for expected, recovered in zip(values, deserialize_embedding(serialize_embedding(values)), strict=True):
            self.assertAlmostEqual(expected, recovered, places=6)

    def test_create_read_and_disabled_person(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database = FaceDatabase(Path(temp_dir) / "faces.db")
            person_id, created = database.get_or_create_person("Diego")
            self.assertTrue(created)
            database.add_embedding(person_id, [0.0] * 128, quality=0.9)
            self.assertEqual(database.list_known_people(), [(person_id, "Diego", True, 1)])
            self.assertEqual(len(database.load_enabled_embeddings()), 1)
            with database._connect() as connection:
                connection.execute("UPDATE known_people SET enabled = 0 WHERE id = ?", (person_id,))
            self.assertEqual(database.load_enabled_embeddings(), [])

    def test_existing_name_requires_explicit_add_samples(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database = FaceDatabase(Path(temp_dir) / "faces.db")
            person_id, _ = database.get_or_create_person("Diego")
            with self.assertRaises(ValueError):
                database.get_or_create_person("diego")
            self.assertEqual(database.get_or_create_person("diego", add_samples=True), (person_id, False))

    def test_best_matching_sample_per_person_is_selected(self) -> None:
        matcher = _Matcher()
        candidates = [(1, "Diego", 0.42), (1, "Diego", 0.76), (2, "Ana", 0.71)]
        best = SFaceRecognizer.best_candidate(matcher, object(), candidates)
        self.assertEqual((best.person_id, best.name, best.similarity), (1, "Diego", 0.76))
        accepted = SFaceRecognizer.best_match(matcher, object(), candidates, threshold=0.75)
        self.assertEqual(accepted, best)
        self.assertIsNone(SFaceRecognizer.best_match(matcher, object(), candidates, threshold=0.8))


if __name__ == "__main__":
    unittest.main()
