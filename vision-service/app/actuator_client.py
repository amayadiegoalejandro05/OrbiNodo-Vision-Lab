import json
import urllib.error
import urllib.request


class ActuatorClientError(Exception):
    """An actuator request or response could not be handled."""


class ActuatorClient:
    def __init__(self, base_url: str, timeout_seconds: float = 2.0):
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    def health(self) -> dict:
        return self._request("/health", "GET", 200)

    def status(self) -> dict:
        return self._request("/status", "GET", 200)

    def open(self) -> dict:
        return self._request("/open", "POST", 202, allow_busy=True)

    def _request(
        self, path: str, method: str, expected_status: int, allow_busy: bool = False
    ) -> dict:
        try:
            request = urllib.request.Request(self.base_url + path, method=method)
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                if response.status != expected_status:
                    raise ActuatorClientError(
                        f"Unexpected HTTP {response.status} from actuator {path}."
                    )
                payload = response.read()
        except urllib.error.HTTPError as error:
            if allow_busy and error.code == 409:
                try:
                    payload = error.read()
                except OSError as read_error:
                    raise ActuatorClientError(
                        f"Could not read actuator response from {path}."
                    ) from read_error
            else:
                raise ActuatorClientError(
                    f"Unexpected HTTP {error.code} from actuator {path}."
                ) from error
        except urllib.error.URLError as error:
            if isinstance(error.reason, TimeoutError):
                message = f"Actuator request to {path} timed out."
            elif isinstance(error.reason, ConnectionRefusedError):
                message = f"Actuator connection was refused for {path}."
            else:
                message = f"Actuator host is unreachable for {path}."
            raise ActuatorClientError(message) from error
        except TimeoutError as error:
            raise ActuatorClientError(f"Actuator request to {path} timed out.") from error
        except OSError as error:
            raise ActuatorClientError(f"Could not communicate with actuator at {path}.") from error
        except ValueError as error:
            raise ActuatorClientError("Actuator base URL is invalid.") from error

        return self._decode_json(payload, path)

    @staticmethod
    def _decode_json(payload: bytes, path: str) -> dict:
        try:
            result = json.loads(payload)
        except (ValueError, UnicodeError) as error:
            raise ActuatorClientError(f"Invalid JSON from actuator {path}.") from error

        if not isinstance(result, dict):
            raise ActuatorClientError(f"Expected a JSON object from actuator {path}.")
        return result
