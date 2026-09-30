import io
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.actuator_client import ActuatorClient, ActuatorClientError


class ActuatorClientTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = ActuatorClient("http://192.0.2.10/", timeout_seconds=2.0)

    def mock_response(self, status: int, body: bytes) -> MagicMock:
        response = MagicMock()
        response.status = status
        response.read.return_value = body
        response.__enter__.return_value = response
        return response

    def test_health_get_returns_json(self) -> None:
        body = b'{"status":"ok","device":"phylo-access-actuator","transport":"wifi-http"}'
        with patch(
            "app.actuator_client.urllib.request.urlopen",
            return_value=self.mock_response(200, body),
        ) as urlopen:
            result = self.client.health()

        self.assertEqual(result["status"], "ok")
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "http://192.0.2.10/health")
        self.assertEqual(request.get_method(), "GET")
        self.assertEqual(urlopen.call_args.kwargs["timeout"], 2.0)

    def test_status_get_returns_state_and_servo_angle(self) -> None:
        with patch(
            "app.actuator_client.urllib.request.urlopen",
            return_value=self.mock_response(200, b'{"state":"CLOSED","servo_angle":0}'),
        ) as urlopen:
            result = self.client.status()

        self.assertEqual(result, {"state": "CLOSED", "servo_angle": 0})
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "http://192.0.2.10/status")
        self.assertEqual(request.get_method(), "GET")

    def test_open_accepted_posts_without_body(self) -> None:
        with patch(
            "app.actuator_client.urllib.request.urlopen",
            return_value=self.mock_response(202, b'{"accepted":true,"state":"OPENING"}'),
        ) as urlopen:
            result = self.client.open()

        self.assertEqual(result, {"accepted": True, "state": "OPENING"})
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "http://192.0.2.10/open")
        self.assertEqual(request.get_method(), "POST")
        self.assertIsNone(request.data)

    def test_open_busy_returns_conflict_json(self) -> None:
        error = urllib.error.HTTPError(
            "http://192.0.2.10/open",
            409,
            "Conflict",
            None,
            io.BytesIO(b'{"accepted":false,"state":"OPEN_HOLD"}'),
        )
        with patch("app.actuator_client.urllib.request.urlopen", side_effect=error):
            result = self.client.open()

        self.assertEqual(result, {"accepted": False, "state": "OPEN_HOLD"})

    def test_invalid_json_raises_client_error(self) -> None:
        with patch(
            "app.actuator_client.urllib.request.urlopen",
            return_value=self.mock_response(200, b"not json"),
        ):
            with self.assertRaises(ActuatorClientError):
                self.client.health()

    def test_connection_refused_raises_client_error(self) -> None:
        error = urllib.error.URLError(ConnectionRefusedError("connection refused"))
        with patch("app.actuator_client.urllib.request.urlopen", side_effect=error):
            with self.assertRaises(ActuatorClientError):
                self.client.health()

    def test_timeout_raises_client_error(self) -> None:
        error = urllib.error.URLError(TimeoutError("timed out"))
        with patch("app.actuator_client.urllib.request.urlopen", side_effect=error):
            with self.assertRaises(ActuatorClientError):
                self.client.status()

    def test_unexpected_http_raises_client_error(self) -> None:
        error = urllib.error.HTTPError(
            "http://192.0.2.10/health", 503, "Unavailable", None, io.BytesIO(b"")
        )
        with patch("app.actuator_client.urllib.request.urlopen", side_effect=error):
            with self.assertRaises(ActuatorClientError):
                self.client.health()


if __name__ == "__main__":
    unittest.main()
