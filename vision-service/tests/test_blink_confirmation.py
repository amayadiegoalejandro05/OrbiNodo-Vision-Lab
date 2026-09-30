from dataclasses import FrozenInstanceError
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.blink_confirmation import BlinkConfirmationReading, BlinkConfirmationTracker


class BlinkConfirmationTrackerTests(unittest.TestCase):
    def tracker(self, target_blinks: int = 3) -> BlinkConfirmationTracker:
        return BlinkConfirmationTracker(0.20, 0.60, target_blinks)

    def complete_blink(self, tracker: BlinkConfirmationTracker) -> BlinkConfirmationReading:
        tracker.update(0.10)
        tracker.update(0.70)
        return tracker.update(0.10)

    def test_invalid_parameters_raise_value_error(self) -> None:
        invalid = (
            (-0.01, 0.60, 3),
            (0.60, 0.60, 3),
            (0.70, 0.60, 3),
            (0.20, 1.01, 3),
            (float("nan"), 0.60, 3),
            (0.20, float("inf"), 3),
            ("0.20", 0.60, 3),
            (0.20, 0.60, 0),
            (0.20, 0.60, -1),
            (0.20, 0.60, True),
            (0.20, 0.60, 1.5),
        )
        for open_threshold, closed_threshold, target in invalid:
            with self.subTest(parameters=(open_threshold, closed_threshold, target)):
                with self.assertRaises(ValueError):
                    BlinkConfirmationTracker(open_threshold, closed_threshold, target)

    def test_none_does_not_invent_or_advance_state(self) -> None:
        tracker = self.tracker()
        initial = tracker.reading
        self.assertEqual(tracker.update(None), initial)
        self.assertEqual(initial, BlinkConfirmationReading(None, "WAIT_OPEN", 0, 3, False))
        opened = tracker.update(0.10)
        self.assertEqual(tracker.update(None), opened)

    def test_open_initializes_wait_closed(self) -> None:
        reading = self.tracker().update(0.20)
        self.assertEqual(reading.eye_state, "OPEN")
        self.assertEqual(reading.phase, "WAIT_CLOSED")
        self.assertEqual(reading.blink_count, 0)

    def test_initial_closed_does_not_count(self) -> None:
        tracker = self.tracker()
        reading = tracker.update(0.60)
        self.assertEqual(reading.eye_state, "CLOSED")
        self.assertEqual(reading.phase, "WAIT_OPEN")
        self.assertEqual(reading.blink_count, 0)
        self.assertEqual(tracker.update(0.10).phase, "WAIT_CLOSED")
        self.assertEqual(tracker.reading.blink_count, 0)

    def test_complete_open_closed_open_counts_one(self) -> None:
        tracker = self.tracker()
        self.assertEqual(tracker.update(0.10).phase, "WAIT_CLOSED")
        self.assertEqual(tracker.update(0.70).phase, "WAIT_REOPEN")
        reading = tracker.update(0.10)
        self.assertEqual(reading, BlinkConfirmationReading("OPEN", "WAIT_CLOSED", 1, 3, False))

    def test_repeated_open_does_not_count(self) -> None:
        tracker = self.tracker()
        for _ in range(4):
            reading = tracker.update(0.10)
        self.assertEqual(reading.phase, "WAIT_CLOSED")
        self.assertEqual(reading.blink_count, 0)

    def test_repeated_closed_does_not_count(self) -> None:
        tracker = self.tracker()
        tracker.update(0.10)
        for _ in range(4):
            reading = tracker.update(0.70)
        self.assertEqual(reading.phase, "WAIT_REOPEN")
        self.assertEqual(reading.blink_count, 0)

    def test_hysteresis_keeps_previous_eye_state(self) -> None:
        tracker = self.tracker()
        self.assertIsNone(tracker.update(0.40).eye_state)
        tracker.update(0.10)
        self.assertEqual(tracker.update(0.40).eye_state, "OPEN")
        tracker.update(0.70)
        reading = tracker.update(0.40)
        self.assertEqual(reading.eye_state, "CLOSED")
        self.assertEqual(reading.phase, "WAIT_REOPEN")
        self.assertEqual(reading.blink_count, 0)

    def test_three_complete_blinks_confirm(self) -> None:
        tracker = self.tracker()
        for _ in range(3):
            reading = self.complete_blink(tracker)
        self.assertEqual(reading.blink_count, 3)
        self.assertTrue(reading.confirmed)

    def test_blinks_after_confirmation_do_not_increment(self) -> None:
        tracker = self.tracker()
        for _ in range(3):
            self.complete_blink(tracker)
        for _ in range(2):
            reading = self.complete_blink(tracker)
        self.assertEqual(reading.blink_count, 3)
        self.assertTrue(reading.confirmed)

    def test_reset_clears_state_and_allows_new_cycle(self) -> None:
        tracker = self.tracker(target_blinks=1)
        self.assertTrue(self.complete_blink(tracker).confirmed)
        tracker.reset()
        self.assertEqual(
            tracker.reading,
            BlinkConfirmationReading(None, "WAIT_OPEN", 0, 1, False),
        )
        self.assertTrue(self.complete_blink(tracker).confirmed)

    def test_target_blinks_is_configurable(self) -> None:
        tracker = self.tracker(target_blinks=5)
        for _ in range(3):
            reading = self.complete_blink(tracker)
        self.assertEqual(reading.target_blinks, 5)
        self.assertEqual(reading.blink_count, 3)
        self.assertFalse(reading.confirmed)
        for _ in range(2):
            reading = self.complete_blink(tracker)
        self.assertEqual(reading.blink_count, 5)
        self.assertTrue(reading.confirmed)

    def test_reading_is_immutable(self) -> None:
        reading = self.tracker().reading
        with self.assertRaises(FrozenInstanceError):
            reading.blink_count = 1


if __name__ == "__main__":
    unittest.main()
