from dataclasses import dataclass
from datetime import datetime, timezone
import logging
from threading import Event, RLock, Thread, current_thread
from time import perf_counter, sleep
from typing import Any

from .active_user import select_active_face_index
from .blink_confirmation import BlinkConfirmationTracker
from .camera import CameraCapture, FpsMeter
from .config import VisionServiceConfig
from .face_database import FaceDatabase
from .face_detector import YuNetFaceDetector
from .face_landmarker import FaceLandmarkerAdapter, FaceLandmarkerError
from .face_recognizer import SFaceRecognizer

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PublicFace:
    status: str
    person_id: int | None
    name: str | None
    similarity: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "person_id": self.person_id,
            "name": self.name,
            "similarity": round(self.similarity, 3),
        }


class VisionPipeline:
    """One process-level prepared engine and one shared camera worker."""

    def __init__(self, config: VisionServiceConfig) -> None:
        self.config = config
        self._lock = RLock()
        self._prepare_event = Event()
        self._stop_event = Event()
        self._thread: Thread | None = None

        self._prepared = False
        self._preparing = False
        self._state = "INITIALIZING"

        self._database: FaceDatabase | None = None
        self._candidates: list[tuple[int, str, Any]] = []
        self._detector: YuNetFaceDetector | None = None
        self._recognizer: SFaceRecognizer | None = None

        self._running = False
        self._fps = 0.0
        self._faces: list[PublicFace] = []
        self._active_face_index: int | None = None
        self._active_user: PublicFace | None = None
        self._blink_tracker = BlinkConfirmationTracker(
            config.blink_open_threshold,
            config.blink_closed_threshold,
            config.blink_target,
        )
        self._blink_person_id: int | None = None
        self._timestamp: str | None = None
        self._jpeg: bytes | None = None
        self._error: str | None = None

    @staticmethod
    def _log_duration(stage: str, started_at: float) -> None:
        logger.info(
            "vision.prepare %s=%.3fs",
            stage,
            perf_counter() - started_at,
        )

    def prepare(self) -> bool:
        """Load models and enabled embeddings once, without opening the webcam."""
        with self._lock:
            if self._prepared:
                return True

            if self._preparing:
                wait_for_prepare = True
            else:
                self._preparing = True
                self._prepare_event.clear()
                self._state = "INITIALIZING"
                self._error = None
                wait_for_prepare = False

        if wait_for_prepare:
            self._prepare_event.wait()
            with self._lock:
                return self._prepared

        try:
            import numpy as np

            started_at = perf_counter()
            database = FaceDatabase(self.config.database_path)
            database.initialize()
            self._log_duration("database.initialize", started_at)

            started_at = perf_counter()
            candidates = [
                (
                    person_id,
                    name,
                    np.asarray(embedding, dtype=np.float32).reshape(1, -1),
                )
                for person_id, name, embedding
                in database.load_enabled_embeddings()
            ]
            self._log_duration(
                "database.load_enabled_embeddings",
                started_at,
            )

            started_at = perf_counter()
            detector = YuNetFaceDetector(
                self.config.detector_model,
                self.config.detector_score_threshold,
                self.config.detector_nms_threshold,
                self.config.detector_top_k,
            )
            self._log_duration("yunet.load", started_at)

            started_at = perf_counter()
            recognizer = SFaceRecognizer(
                self.config.recognizer_model,
            )
            self._log_duration("sface.load", started_at)

            # Warm-up técnico de YuNet sin abrir la webcam.
            started_at = perf_counter()
            detector.detect(
                np.zeros((240, 320, 3), dtype=np.uint8)
            )
            self._log_duration("yunet.warmup", started_at)

            # SFace requiere un rostro alineado válido para su inferencia.
            logger.info(
                "vision.prepare "
                "sface.warmup=skipped(no valid aligned face)"
            )

            with self._lock:
                self._database = database
                self._candidates = candidates
                self._detector = detector
                self._recognizer = recognizer
                self._prepared = True
                self._preparing = False
                self._state = "READY"
                self._error = None

            return True

        except Exception as error:
            message = f"Vision engine preparation failed: {error}"
            logger.exception(message)

            with self._lock:
                self._preparing = False
                self._prepared = False
                self._state = "ERROR"
                self._error = message

            return False

        finally:
            self._prepare_event.set()

    def reload_people(self) -> bool:
        """Explicit enrollment refresh; never called by the frame loop."""
        with self._lock:
            database = self._database
            prepared = self._prepared

        if not prepared or database is None:
            return False

        import numpy as np

        started_at = perf_counter()

        candidates = [
            (
                person_id,
                name,
                np.asarray(embedding, dtype=np.float32).reshape(1, -1),
            )
            for person_id, name, embedding
            in database.load_enabled_embeddings()
        ]

        logger.info(
            "vision.reload_people load_enabled_embeddings=%.3fs",
            perf_counter() - started_at,
        )

        with self._lock:
            self._candidates = candidates

        return True

    def start(self) -> bool:
        with self._lock:
            if not self._prepared or self._preparing:
                return False

            if self._thread is not None and self._thread.is_alive():
                return False

            self._stop_event.clear()
            self._running = True
            self._state = "RUNNING"
            self._error = None
            self._fps = 0.0
            self._faces = []
            self._active_face_index = None
            self._active_user = None
            self._blink_tracker.reset()
            self._blink_person_id = None
            self._timestamp = None
            self._jpeg = None

            self._thread = Thread(
                target=self._run,
                name="vision-pipeline",
                daemon=True,
            )
            self._thread.start()

            return True

    def stop(self) -> bool:
        with self._lock:
            thread = self._thread

            if thread is None or not thread.is_alive():
                self._running = False
                self._thread = None

                if self._prepared and self._state != "ERROR":
                    self._state = "READY"

                return False

            self._stop_event.set()

        thread.join(timeout=3.0)

        with self._lock:
            if thread.is_alive():
                # El worker aún está cerrándose. No declarar READY
                # mientras el thread siga realmente activo.
                self._running = True
                self._error = (
                    "Vision worker did not stop within 3 seconds."
                )
                return False

            self._running = False
            self._thread = None

            if self._prepared and self._state != "ERROR":
                self._state = "READY"

        return True

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {
                "camera": "CAM-ROBOT-01",
                "state": self._state,
                "prepared": self._prepared,
                "running": self._running,
                "fps": round(self._fps, 1),
                "faces": [
                    face.as_dict()
                    for face in self._faces
                ],
                "active_face_index": self._active_face_index,
                "active_user": (
                    self._active_user.as_dict()
                    if self._active_user is not None
                    else None
                ),
                "blink_count": self._blink_tracker.reading.blink_count,
                "blink_target": self._blink_tracker.reading.target_blinks,
                "blink_confirmed": self._blink_tracker.reading.confirmed,
                "timestamp": self._timestamp,
                "error": self._error,
            }

    def latest_jpeg(self) -> bytes | None:
        with self._lock:
            return self._jpeg

    def people(self) -> list[dict[str, Any]]:
        with self._lock:
            database = self._database

        if database is None:
            return []

        return [
            {
                "id": person_id,
                "name": name,
                "enabled": enabled,
                "embedding_count": count,
            }
            for person_id, name, enabled, count
            in database.list_known_people()
        ]

    def health(self) -> dict[str, Any]:
        with self._lock:
            database_status = (
                "ready"
                if self._database is not None
                else (
                    "error"
                    if self._state == "ERROR"
                    else "initializing"
                )
            )

            models_status = (
                "ready"
                if (
                    self._detector is not None
                    and self._recognizer is not None
                )
                else (
                    "error"
                    if self._state == "ERROR"
                    else "initializing"
                )
            )

            return {
                "state": self._state,
                "prepared": self._prepared,
                "running": self._running,
                "database": database_status,
                "models": models_status,
            }

    def _set_error(self, message: str | None) -> None:
        with self._lock:
            self._error = message

    def _publish(
        self,
        jpeg: bytes,
        faces: list[PublicFace],
        fps: float,
        active_face_index: int | None = None,
        active_user: PublicFace | None = None,
    ) -> None:
        with self._lock:
            self._jpeg = jpeg
            self._faces = faces
            self._active_face_index = active_face_index
            self._active_user = active_user
            self._fps = fps
            self._timestamp = datetime.now(timezone.utc).isoformat()
            self._error = None

    def _run(self) -> None:
        camera: CameraCapture | None = None
        landmarker: FaceLandmarkerAdapter | None = None

        try:
            import cv2

            with self._lock:
                detector = self._detector
                recognizer = self._recognizer

            if detector is None or recognizer is None:
                raise RuntimeError(
                    "Vision engine is not prepared."
                )

            try:
                landmarker = FaceLandmarkerAdapter(self.config.face_landmarker_model)
            except FaceLandmarkerError:
                logger.warning("Face Landmarker unavailable; blink confirmation disabled.")

            fps_meter = FpsMeter()

            # Mide desde que inicia el worker hasta el primer JPEG.
            start_at = perf_counter()

            camera = CameraCapture(
                self.config.camera_index
            )

            camera_open_started = perf_counter()
            camera.open()

            logger.info(
                "vision.start camera.open=%.3fs",
                perf_counter() - camera_open_started,
            )

            first_read_logged = False
            first_detection_logged = False
            first_recognition_logged = False
            first_jpeg_logged = False

            consecutive_frame_errors = 0
            max_consecutive_frame_errors = 30

            while not self._stop_event.is_set():
                # ------------------------------------------
                # 1. Captura
                # ------------------------------------------
                try:
                    started_at = perf_counter()
                    frame = camera.read()

                    if not first_read_logged:
                        logger.info(
                            "vision.start "
                            "camera.first_read=%.3fs",
                            perf_counter() - started_at,
                        )
                        first_read_logged = True

                    consecutive_frame_errors = 0

                except Exception as error:
                    consecutive_frame_errors += 1

                    message = (
                        "Temporary camera read error: "
                        f"{error}"
                    )
                    self._set_error(message)

                    logger.warning(
                        "%s (%d/%d)",
                        message,
                        consecutive_frame_errors,
                        max_consecutive_frame_errors,
                    )

                    if (
                        consecutive_frame_errors
                        >= max_consecutive_frame_errors
                    ):
                        raise RuntimeError(
                            "Camera failed for "
                            f"{max_consecutive_frame_errors} "
                            "consecutive reads."
                        ) from error

                    sleep(0.05)
                    continue

                # ------------------------------------------
                # 2. Detección
                # ------------------------------------------
                try:
                    started_at = perf_counter()
                    detected_faces = detector.detect(frame)

                    if not first_detection_logged:
                        logger.info(
                            "vision.start "
                            "first_detection=%.3fs",
                            perf_counter() - started_at,
                        )
                        first_detection_logged = True

                except Exception as error:
                    self._set_error(
                        f"Temporary YuNet error: {error}"
                    )
                    logger.warning(
                        "Temporary YuNet error: %s",
                        error,
                    )
                    detected_faces = []

                active_face_index = select_active_face_index(detected_faces)
                # Recognition draws on frame; keep a clean full-frame image for MediaPipe.
                landmarker_frame = (
                    frame.copy()
                    if len(detected_faces) == 1 and landmarker is not None
                    else None
                )
                public_faces: list[PublicFace] = []
                public_faces_by_index: list[PublicFace | None] = [None] * len(detected_faces)

                with self._lock:
                    # reload_people() reemplaza la lista completa,
                    # por lo que esta referencia es consistente
                    # durante el frame actual.
                    candidates = self._candidates

                # ------------------------------------------
                # 3. Reconocimiento por rostro
                # ------------------------------------------
                for face_index, face in enumerate(detected_faces):
                    try:
                        started_at = perf_counter()

                        query = recognizer.embedding(
                            frame,
                            face.raw,
                        )

                        candidate = (
                            recognizer.best_candidate(
                                query,
                                candidates,
                            )
                        )

                        if not first_recognition_logged:
                            logger.info(
                                "vision.start "
                                "first_recognition=%.3fs",
                                perf_counter() - started_at,
                            )
                            first_recognition_logged = True

                        authorized = (
                            candidate is not None
                            and candidate.similarity
                            >= self.config.cosine_match_threshold
                        )

                        public = PublicFace(
                            status=(
                                "AUTHORIZED"
                                if authorized
                                else "UNKNOWN"
                            ),
                            person_id=(
                                candidate.person_id
                                if authorized
                                and candidate is not None
                                else None
                            ),
                            name=(
                                candidate.name
                                if authorized
                                and candidate is not None
                                else None
                            ),
                            similarity=(
                                candidate.similarity
                                if candidate is not None
                                else 0.0
                            ),
                        )

                        public_faces.append(public)
                        public_faces_by_index[face_index] = public

                        color = (
                            (0, 255, 100)
                            if authorized
                            else (0, 80, 255)
                        )

                        label_name = (
                            public.name
                            if authorized and public.name
                            else "UNKNOWN"
                        )

                        label = (
                            f"{label_name} "
                            f"{public.similarity:.3f}"
                        )

                        cv2.rectangle(
                            frame,
                            (face.x, face.y),
                            (
                                face.x + face.width,
                                face.y + face.height,
                            ),
                            color,
                            2,
                        )

                        cv2.putText(
                            frame,
                            label,
                            (
                                face.x,
                                max(20, face.y - 8),
                            ),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.55,
                            color,
                            2,
                            cv2.LINE_AA,
                        )

                    except Exception as error:
                        # Un rostro problemático no debe tumbar
                        # todo el pipeline.
                        self._set_error(
                            "Temporary face-processing error: "
                            f"{error}"
                        )

                        logger.warning(
                            "Face skipped due to error: %s",
                            error,
                        )

                        continue

                active_user = (
                    public_faces_by_index[active_face_index]
                    if active_face_index is not None
                    else None
                )

                eligible_for_blink = (
                    len(detected_faces) == 1
                    and active_user is not None
                    and active_user.status == "AUTHORIZED"
                    and active_user.person_id is not None
                    and landmarker is not None
                )
                if not eligible_for_blink:
                    with self._lock:
                        self._blink_tracker.reset()
                        self._blink_person_id = None
                else:
                    person_id = active_user.person_id
                    with self._lock:
                        if person_id != self._blink_person_id:
                            self._blink_tracker.reset()
                            self._blink_person_id = person_id

                    try:
                        reading = landmarker.detect(landmarker_frame)
                        with self._lock:
                            if (
                                reading is not None
                                and reading.eye_blink_left is not None
                                and reading.eye_blink_right is not None
                            ):
                                score = min(reading.eye_blink_left, reading.eye_blink_right)
                                self._blink_tracker.update(score)
                            else:
                                self._blink_tracker.update(None)
                    except FaceLandmarkerError:
                        logger.warning("Face Landmarker inference failed; blink progress reset.")
                        with self._lock:
                            self._blink_tracker.reset()
                            self._blink_person_id = person_id

                # ------------------------------------------
                # 4. FPS + JPEG
                # ------------------------------------------
                fps = fps_meter.tick()

                cv2.putText(
                    frame,
                    f"Vision Service {fps:.1f} FPS",
                    (12, 28),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 255, 180),
                    2,
                    cv2.LINE_AA,
                )

                try:
                    encoded, buffer = cv2.imencode(
                        ".jpg",
                        frame,
                        [cv2.IMWRITE_JPEG_QUALITY, 85],
                    )

                    if not encoded:
                        self._set_error(
                            "OpenCV could not encode "
                            "the frame as JPEG."
                        )
                        continue

                    self._publish(
                        buffer.tobytes(),
                        public_faces,
                        fps,
                        active_face_index,
                        active_user,
                    )

                    if not first_jpeg_logged:
                        logger.info(
                            "vision.start "
                            "first_jpeg_published=%.3fs",
                            perf_counter() - start_at,
                        )
                        first_jpeg_logged = True

                except Exception as error:
                    self._set_error(
                        "Temporary JPEG encoding error: "
                        f"{error}"
                    )

                    logger.warning(
                        "Temporary JPEG encoding error: %s",
                        error,
                    )

                    continue

        except Exception as error:
            message = f"Vision Pipeline stopped: {error}"
            logger.exception(message)

            self._set_error(message)

            with self._lock:
                self._state = "ERROR"

        finally:
            if landmarker is not None:
                try:
                    landmarker.close()
                except FaceLandmarkerError:
                    logger.warning("Face Landmarker could not be closed cleanly.")

            if camera is not None:
                try:
                    camera.release()
                except Exception as error:
                    logger.warning(
                        "vision.stop camera.release failed: %s",
                        error,
                    )

            with self._lock:
                self._blink_tracker.reset()
                self._blink_person_id = None
                self._running = False

                if (
                    self._prepared
                    and self._state != "ERROR"
                ):
                    self._state = "READY"

                if self._thread is current_thread():
                    self._thread = None
