import os

# Windows / OpenCV:
# Evita una demora de ~45 s al abrir ciertas webcams mediante MSMF.
# Debe configurarse antes de que OpenCV sea importado/inicializado.
os.environ.setdefault(
    "OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS",
    "0",
)

import asyncio
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from .actuator_client import ActuatorClient, ActuatorClientError
from .config import VisionServiceConfig
from .pipeline import VisionPipeline


def create_app(
    config: VisionServiceConfig | None = None,
    pipeline: VisionPipeline | Any | None = None,
    actuator_client: ActuatorClient | None = None,
) -> FastAPI:
    active_config = config or VisionServiceConfig()
    active_pipeline = pipeline or VisionPipeline(active_config)
    active_actuator = actuator_client
    if active_actuator is None and active_config.actuator_url is not None:
        active_actuator = ActuatorClient(
            active_config.actuator_url,
            active_config.actuator_timeout_seconds,
        )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        # Precarga una sola vez:
        # - SQLite
        # - embeddings
        # - YuNet
        # - SFace
        await asyncio.to_thread(active_pipeline.prepare)

        yield

        active_pipeline.stop()

    app = FastAPI(
        title="OrbiNodo Vision Service",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.state.vision_pipeline = active_pipeline
    app.state.actuator_client = active_actuator

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(active_config.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.get("/health")
    def health() -> dict[str, Any]:
        readiness = active_pipeline.health()

        return {
            "status": (
                "ok"
                if readiness["models"] == "ready"
                else "degraded"
            ),
            "camera": "CAM-ROBOT-01",
            "camera_index": active_config.camera_index,
            **readiness,
        }

    @app.get("/api/vision/status")
    def status() -> dict[str, Any]:
        return active_pipeline.status()

    def actuator_unavailable(configured: bool, message: str) -> JSONResponse:
        return JSONResponse(
            status_code=503,
            content={"configured": configured, "available": False, "error": message},
        )

    @app.get("/api/actuator/status")
    def actuator_status() -> JSONResponse:
        if active_actuator is None:
            return actuator_unavailable(False, "Actuator is not configured.")
        try:
            result = active_actuator.status()
        except ActuatorClientError as error:
            return actuator_unavailable(True, str(error))
        return JSONResponse(
            status_code=200,
            content={**result, "configured": True, "available": True},
        )

    @app.post("/api/actuator/open")
    def actuator_open() -> JSONResponse:
        if active_actuator is None:
            return actuator_unavailable(False, "Actuator is not configured.")
        try:
            result = active_actuator.open()
        except ActuatorClientError as error:
            return actuator_unavailable(True, str(error))
        return JSONResponse(
            status_code=202 if result.get("accepted") is True else 409,
            content={**result, "configured": True, "available": True},
        )

    @app.post("/api/vision/start")
    def start() -> dict[str, Any]:
        active_pipeline.start()
        return active_pipeline.status()

    @app.post("/api/vision/stop")
    def stop() -> dict[str, Any]:
        active_pipeline.stop()
        return active_pipeline.status()

    @app.get("/api/vision/people")
    def people() -> list[dict[str, Any]]:
        return active_pipeline.people()

    @app.get("/stream.mjpg")
    async def stream() -> StreamingResponse:
        async def frames():
            while True:
                jpeg = active_pipeline.latest_jpeg()

                if jpeg is not None:
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n\r\n"
                        + jpeg
                        + b"\r\n"
                    )

                elif not active_pipeline.status()["running"]:
                    return

                await asyncio.sleep(0.05)

        return StreamingResponse(
            frames(),
            media_type="multipart/x-mixed-replace; boundary=frame",
        )

    return app


app = create_app()
