from dataclasses import dataclass, field
from pathlib import Path
import math
import os
from urllib.parse import urlsplit

SERVICE_ROOT = Path(__file__).resolve().parents[1]

LOCAL_CORS_ORIGINS = (
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:4176",
    "http://localhost:4176",
)


def configured_cors_origins() -> tuple[str, ...]:
    raw_origins = os.environ.get("VISION_CORS_ORIGINS", "").strip()
    if not raw_origins:
        return LOCAL_CORS_ORIGINS

    origins = tuple(
        origin.strip().rstrip("/")
        for origin in raw_origins.split(",")
        if origin.strip()
    )

    if not origins:
        raise ValueError("VISION_CORS_ORIGINS must contain at least one origin.")

    for origin in origins:
        parsed = urlsplit(origin)
        try:
            port = parsed.port
        except ValueError as error:
            raise ValueError("VISION_CORS_ORIGINS contains an invalid port.") from error

        has_exact_origin_shape = (
            bool(parsed.hostname)
            and not parsed.username
            and not parsed.password
            and parsed.path in ("", "/")
            and not parsed.query
            and not parsed.fragment
        )
        is_https = parsed.scheme == "https" and has_exact_origin_shape
        is_local = (
            parsed.scheme == "http"
            and parsed.hostname in ("127.0.0.1", "localhost")
            and port is not None
            and has_exact_origin_shape
        )
        if origin == "*" or not (is_https or is_local):
            raise ValueError(
                "VISION_CORS_ORIGINS only accepts exact HTTPS origins or explicit localhost origins."
            )

    return origins


def configured_actuator_url() -> str | None:
    url = os.environ.get("VISION_ACTUATOR_URL", "").strip()
    if not url:
        return None

    if any(character.isspace() for character in url):
        raise ValueError("VISION_ACTUATOR_URL must be a valid HTTP or HTTPS base URL.")

    try:
        parsed = urlsplit(url)
        parsed.port  # Reject malformed ports.
    except ValueError as error:
        raise ValueError("VISION_ACTUATOR_URL must be a valid HTTP or HTTPS base URL.") from error

    if not (
        parsed.scheme in ("http", "https")
        and parsed.hostname
        and parsed.username is None
        and parsed.password is None
        and parsed.path in ("", "/")
        and "?" not in url
        and "#" not in url
    ):
        raise ValueError("VISION_ACTUATOR_URL must be a valid HTTP or HTTPS base URL.")

    return url.rstrip("/")


def configured_actuator_timeout_seconds() -> float:
    raw_timeout = os.environ.get("VISION_ACTUATOR_TIMEOUT_SECONDS", "2.0").strip()
    try:
        timeout = float(raw_timeout)
    except ValueError as error:
        raise ValueError("VISION_ACTUATOR_TIMEOUT_SECONDS must be greater than zero.") from error

    if not math.isfinite(timeout) or timeout <= 0:
        raise ValueError("VISION_ACTUATOR_TIMEOUT_SECONDS must be greater than zero.")
    return timeout


@dataclass(frozen=True)
class VisionServiceConfig:
    camera_index: int = int(os.environ.get("VISION_CAMERA_INDEX", "1"))
    host: str = os.environ.get("VISION_SERVICE_HOST", "127.0.0.1")
    port: int = int(os.environ.get("VISION_SERVICE_PORT", "8765"))
    detector_model: Path = SERVICE_ROOT / "models" / "face_detection_yunet_2023mar.onnx"
    recognizer_model: Path = SERVICE_ROOT / "models" / "face_recognition_sface_2021dec.onnx"
    database_path: Path = SERVICE_ROOT / "data" / "vision_faces.db"
    detector_score_threshold: float = 0.8
    detector_nms_threshold: float = 0.3
    detector_top_k: int = 5000
    enrollment_samples: int = 15
    enrollment_sample_interval_seconds: float = 0.75
    # Experimental starting point from OpenCV SFace documentation. It must be
    # calibrated locally; it is not a production biometric decision threshold.
    cosine_match_threshold: float = 0.363
    cors_origins: tuple[str, ...] = field(default_factory=configured_cors_origins)
    actuator_url: str | None = field(default_factory=configured_actuator_url)
    actuator_timeout_seconds: float = field(default_factory=configured_actuator_timeout_seconds)
