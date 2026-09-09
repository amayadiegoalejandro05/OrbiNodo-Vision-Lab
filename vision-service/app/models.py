from .config import VisionServiceConfig


def required_model_paths(config: VisionServiceConfig) -> tuple[str, str]:
    return str(config.detector_model), str(config.recognizer_model)
