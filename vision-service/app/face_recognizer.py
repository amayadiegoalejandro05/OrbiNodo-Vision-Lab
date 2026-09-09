from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class FaceMatch:
    person_id: int
    name: str
    similarity: float


class SFaceRecognizer:
    """Adaptador mínimo para SFace; enrollment y política quedan para una fase posterior."""

    def __init__(self, model_path: Path) -> None:
        if not model_path.is_file():
            raise FileNotFoundError(f"No se encontró el modelo SFace: {model_path}")
        import cv2

        self._cv2 = cv2
        self._recognizer = cv2.FaceRecognizerSF.create(str(model_path), "")

    def embedding(self, frame, yunet_face):
        aligned_face = self._recognizer.alignCrop(frame, yunet_face)
        return self._recognizer.feature(aligned_face)

    def cosine_similarity(self, first_embedding, second_embedding) -> float:
        return float(self._recognizer.match(first_embedding, second_embedding, self._cv2.FaceRecognizerSF_FR_COSINE))

    def best_match(self, query_embedding, candidates: Iterable[tuple[int, str, object]], threshold: float) -> FaceMatch | None:
        """Return the highest official SFace cosine score across enabled samples."""
        best = self.best_candidate(query_embedding, candidates)
        return best if best is not None and best.similarity >= threshold else None

    def best_candidate(self, query_embedding, candidates: Iterable[tuple[int, str, object]]) -> FaceMatch | None:
        best: FaceMatch | None = None
        for person_id, name, candidate_embedding in candidates:
            similarity = self.cosine_similarity(query_embedding, candidate_embedding)
            if best is None or similarity > best.similarity:
                best = FaceMatch(person_id=person_id, name=name, similarity=similarity)
        return best
