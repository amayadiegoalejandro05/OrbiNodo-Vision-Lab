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
from fastapi.responses import StreamingResponse

from .config import VisionServiceConfig
from .pipeline import VisionPipeline


def create_app(
    config: VisionServiceConfig | None = None,
    pipeline: VisionPipeline | Any | None = None,
) -> FastAPI:
    active_config = config or VisionServiceConfig()
    active_pipeline = pipeline or VisionPipeline(active_config)

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