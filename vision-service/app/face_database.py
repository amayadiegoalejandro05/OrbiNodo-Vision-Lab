from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import struct
from typing import Iterable, Iterator

SFACE_EMBEDDING_LENGTH = 128
EMBEDDING_DTYPE = "float32 little-endian"

SCHEMA = """
CREATE TABLE IF NOT EXISTS known_people (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS face_embeddings (
  id INTEGER PRIMARY KEY,
  person_id INTEGER NOT NULL REFERENCES known_people(id) ON DELETE CASCADE,
  embedding BLOB NOT NULL,
  quality REAL,
  created_at TEXT NOT NULL
);
"""


def serialize_embedding(values: Iterable[float]) -> bytes:
    embedding = tuple(float(value) for value in values)
    if len(embedding) != SFACE_EMBEDDING_LENGTH:
        raise ValueError(f"SFace requiere {SFACE_EMBEDDING_LENGTH} valores float32.")
    return struct.pack(f"<{SFACE_EMBEDDING_LENGTH}f", *embedding)


def deserialize_embedding(blob: bytes) -> tuple[float, ...]:
    expected_size = SFACE_EMBEDDING_LENGTH * 4
    if len(blob) != expected_size:
        raise ValueError("BLOB de embedding inválido.")
    return struct.unpack(f"<{SFACE_EMBEDDING_LENGTH}f", blob)


class FaceDatabase:
    """SQLite local; se inicializa sólo mediante una futura acción explícita de enrollment."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.executescript(SCHEMA)

    @staticmethod
    def now() -> str:
        return datetime.now(timezone.utc).isoformat()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path)
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def get_person_by_name(self, name: str) -> tuple[int, str, bool] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT id, name, enabled FROM known_people WHERE name = ? COLLATE NOCASE", (name,)
            ).fetchone()
        return None if row is None else (int(row[0]), str(row[1]), bool(row[2]))

    def get_or_create_person(self, name: str, *, add_samples: bool = False) -> tuple[int, bool]:
        cleaned_name = name.strip()
        if not cleaned_name:
            raise ValueError("El nombre no puede estar vacio.")
        self.initialize()
        existing = self.get_person_by_name(cleaned_name)
        if existing is not None:
            if not add_samples:
                raise ValueError(f"La persona '{existing[1]}' ya existe. Use --add-samples para agregar embeddings.")
            return existing[0], False
        now = self.now()
        with self._connect() as connection:
            cursor = connection.execute(
                "INSERT INTO known_people (name, enabled, created_at, updated_at) VALUES (?, 1, ?, ?)",
                (cleaned_name, now, now),
            )
            return int(cursor.lastrowid), True

    def add_embedding(self, person_id: int, embedding: Iterable[float], quality: float | None = None) -> None:
        blob = serialize_embedding(embedding)
        now = self.now()
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO face_embeddings (person_id, embedding, quality, created_at) VALUES (?, ?, ?, ?)",
                (person_id, blob, quality, now),
            )
            connection.execute("UPDATE known_people SET updated_at = ? WHERE id = ?", (now, person_id))

    def list_known_people(self) -> list[tuple[int, str, bool, int]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT person.id, person.name, person.enabled, COUNT(embedding.id)
                FROM known_people AS person
                LEFT JOIN face_embeddings AS embedding ON embedding.person_id = person.id
                GROUP BY person.id, person.name, person.enabled
                ORDER BY person.id
                """
            ).fetchall()
        return [(int(row[0]), str(row[1]), bool(row[2]), int(row[3])) for row in rows]

    def load_enabled_embeddings(self) -> list[tuple[int, str, tuple[float, ...]]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT person.id, person.name, embedding.embedding
                FROM known_people AS person
                JOIN face_embeddings AS embedding ON embedding.person_id = person.id
                WHERE person.enabled = 1
                ORDER BY person.id, embedding.id
                """
            ).fetchall()
        return [(int(row[0]), str(row[1]), deserialize_embedding(bytes(row[2]))) for row in rows]
