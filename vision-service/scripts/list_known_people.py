from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.config import VisionServiceConfig
from app.face_database import FaceDatabase


def main() -> None:
    database = FaceDatabase(VisionServiceConfig().database_path)
    database.initialize()
    people = database.list_known_people()
    if not people:
        print("No hay personas registradas.")
        return
    print("id\tname\tenabled\tembeddings")
    for person_id, name, enabled, count in people:
        print(f"{person_id}\t{name}\t{enabled}\t{count}")


if __name__ == "__main__":
    main()
