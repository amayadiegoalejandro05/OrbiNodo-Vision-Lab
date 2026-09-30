from app.face_detector import FaceDetection


def select_active_face_index(faces: list[FaceDetection]) -> int | None:
    if not faces:
        return None

    best_index = 0
    best_area = faces[0].width * faces[0].height

    for index, face in enumerate(faces[1:], start=1):
        area = face.width * face.height
        if area > best_area:
            best_index = index
            best_area = area

    return best_index
