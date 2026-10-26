# Tests for pick_forecast (run: pytest)
from datetime import datetime, timezone
from main import pick_forecast

CUTOFF = datetime(2026, 1, 14, 9, 0, tzinfo=timezone.utc)


def row(start, pub, gen):
    return {"startTime": start, "publishTime": pub, "generation": gen}


def test_forecast_after_cutoff_is_never_chosen():
    rows = [
        row("2026-01-15T10:00:00Z", "2026-01-14T07:30:00Z", 100),  # before cutoff
        row("2026-01-15T10:00:00Z", "2026-01-14T09:00:01Z", 999),  # 1 second after cutoff
        row("2026-01-15T10:00:00Z", "2026-01-14T11:30:00Z", 888),  # after cutoff
    ]
    assert pick_forecast(rows, CUTOFF)["2026-01-15T10:00:00Z"]["generation"] == 100


def test_latest_before_cutoff_wins_and_cutoff_is_inclusive():
    rows = [
        row("2026-01-15T10:00:00Z", "2026-01-13T20:00:00Z", 1),
        row("2026-01-15T10:00:00Z", "2026-01-14T09:00:00Z", 2),  # exactly at cutoff
    ]
    assert pick_forecast(rows, CUTOFF)["2026-01-15T10:00:00Z"]["generation"] == 2


def test_target_with_no_earlier_forecast_stays_empty():
    rows = [row("2026-01-15T11:00:00Z", "2026-01-14T10:00:00Z", 5)]  # only a late forecast
    assert "2026-01-15T11:00:00Z" not in pick_forecast(rows, CUTOFF)