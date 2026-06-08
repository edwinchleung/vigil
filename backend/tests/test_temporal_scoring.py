from datetime import date, datetime, timezone

from app.services.temporal_scoring import (
    BOOST_DAYS_0_1,
    BOOST_DAYS_2_3,
    BOOST_DAYS_4_7,
    BOOST_OVERDUE,
    adjust_vigil_score_for_intent_deadlines,
)


def test_no_deadline_leaves_score_unchanged() -> None:
    now = datetime(2026, 4, 27, 12, 0, tzinfo=timezone.utc)
    out = adjust_vigil_score_for_intent_deadlines(
        50,
        [{"query": "q", "deadline": None}],
        now=now,
    )
    assert out == 50


def test_overdue_adds_overdue_boost() -> None:
    now = datetime(2026, 4, 27, 12, 0, tzinfo=timezone.utc)
    out = adjust_vigil_score_for_intent_deadlines(
        40,
        [{"query": "q", "deadline": "2026-04-26T00:00:00Z"}],
        now=now,
    )
    assert out == 40 + BOOST_OVERDUE


def test_within_one_calendar_day() -> None:
    now = datetime(2026, 4, 27, 12, 0, tzinfo=timezone.utc)
    out = adjust_vigil_score_for_intent_deadlines(
        40,
        [{"query": "q", "deadline": "2026-04-28T00:00:00Z"}],
        now=now,
    )
    assert out == 40 + BOOST_DAYS_0_1


def test_two_to_three_days() -> None:
    now = datetime(2026, 4, 27, 12, 0, tzinfo=timezone.utc)
    out = adjust_vigil_score_for_intent_deadlines(
        40,
        [{"query": "q", "deadline": "2026-04-29T00:00:00Z"}],
        now=now,
    )
    assert out == 40 + BOOST_DAYS_2_3


def test_four_to_seven_days() -> None:
    now = datetime(2026, 4, 27, 12, 0, tzinfo=timezone.utc)
    out = adjust_vigil_score_for_intent_deadlines(
        40,
        [{"query": "q", "deadline": "2026-05-01T00:00:00Z"}],
        now=now,
    )
    assert out == 40 + BOOST_DAYS_4_7


def test_beyond_seven_days_no_boost() -> None:
    now = datetime(2026, 4, 27, 12, 0, tzinfo=timezone.utc)
    out = adjust_vigil_score_for_intent_deadlines(
        40,
        [{"query": "q", "deadline": "2026-05-10T00:00:00Z"}],
        now=now,
    )
    assert out == 40


def test_clamps_at_100() -> None:
    now = datetime(2026, 4, 27, 12, 0, tzinfo=timezone.utc)
    out = adjust_vigil_score_for_intent_deadlines(
        95,
        [{"query": "q", "deadline": "2026-04-28T00:00:00Z"}],
        now=now,
    )
    assert out == 100


def test_uses_tightest_deadline_among_intents() -> None:
    now = datetime(2026, 4, 27, 12, 0, tzinfo=timezone.utc)
    intents = [
        {"query": "a", "deadline": "2026-12-01T00:00:00Z"},
        {"query": "b", "deadline": "2026-04-30T00:00:00Z"},
    ]
    out = adjust_vigil_score_for_intent_deadlines(40, intents, now=now)
    assert out == 40 + BOOST_DAYS_2_3


def test_plain_date_deadline() -> None:
    now = datetime(2026, 4, 27, 12, 0, tzinfo=timezone.utc)
    out = adjust_vigil_score_for_intent_deadlines(
        40,
        [{"query": "q", "deadline": date(2026, 4, 28)}],
        now=now,
    )
    assert out == 40 + BOOST_DAYS_0_1
