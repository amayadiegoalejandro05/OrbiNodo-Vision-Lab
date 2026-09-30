from dataclasses import dataclass
import math


@dataclass(frozen=True)
class BlinkConfirmationReading:
    eye_state: str | None
    phase: str
    blink_count: int
    target_blinks: int
    confirmed: bool


class BlinkConfirmationTracker:
    def __init__(
        self,
        open_threshold: float,
        closed_threshold: float,
        target_blinks: int = 3,
    ) -> None:
        try:
            valid_thresholds = (
                not isinstance(open_threshold, bool)
                and not isinstance(closed_threshold, bool)
                and math.isfinite(open_threshold)
                and math.isfinite(closed_threshold)
                and 0 <= open_threshold < closed_threshold <= 1
            )
        except (TypeError, ValueError):
            valid_thresholds = False

        if not valid_thresholds:
            raise ValueError("Thresholds must satisfy 0 <= open < closed <= 1.")
        if not isinstance(target_blinks, int) or isinstance(target_blinks, bool) or target_blinks < 1:
            raise ValueError("target_blinks must be a positive integer.")

        self.open_threshold = open_threshold
        self.closed_threshold = closed_threshold
        self.target_blinks = target_blinks
        self.reset()

    @property
    def reading(self) -> BlinkConfirmationReading:
        return BlinkConfirmationReading(
            eye_state=self._eye_state,
            phase=self._phase,
            blink_count=self._blink_count,
            target_blinks=self.target_blinks,
            confirmed=self._confirmed,
        )

    def update(self, score: float | None) -> BlinkConfirmationReading:
        if score is None:
            return self.reading

        if score <= self.open_threshold:
            self._eye_state = "OPEN"
        elif score >= self.closed_threshold:
            self._eye_state = "CLOSED"

        if self._confirmed:
            return self.reading

        if self._phase == "WAIT_OPEN" and self._eye_state == "OPEN":
            self._phase = "WAIT_CLOSED"
        elif self._phase == "WAIT_CLOSED" and self._eye_state == "CLOSED":
            self._phase = "WAIT_REOPEN"
        elif self._phase == "WAIT_REOPEN" and self._eye_state == "OPEN":
            self._blink_count += 1
            self._confirmed = self._blink_count >= self.target_blinks
            self._phase = "WAIT_CLOSED"

        return self.reading

    def reset(self) -> None:
        self._eye_state: str | None = None
        self._phase = "WAIT_OPEN"
        self._blink_count = 0
        self._confirmed = False
