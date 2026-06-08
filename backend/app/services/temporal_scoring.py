"""Boost vigilScore when matched intents have upcoming or past deadlines (Milestone 4)."""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from typing import Any

# Tunable: extra points added to the LLM base score (then clamped 0..100).
BOOST_OVERDUE = 12
BOOST_DAYS_0_1 = 10
BOOST_DAYS_2_3 = 6
BOOST_DAYS_4_7 = 3


def _parse_deadline(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(s)
        except ValueError:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    if isinstance(value, date) and not isinstance(value, datetime):
        return datetime.combine(value, time.min, tzinfo=timezone.utc)
    return None


def _calendar_days_until(deadline: datetime, now: datetime) -> int:
    return (deadline.date() - now.date()).days


def adjust_vigil_score_for_intent_deadlines(
    base_score: int,
    matching_intents: list[dict[str, Any]],
    *,
    now: datetime | None = None,
) -> int:
    """
    Use the tightest (minimum) calendar-day distance among matched intents that have
    a parseable deadline. Overdue and imminent deadlines add a bounded boost; score is
    always clamped to 0..100.
    """
    now_ = now if now is not None else datetime.now(timezone.utc)
    if now_.tzinfo is None:
        now_ = now_.replace(tzinfo=timezone.utc)
    else:
        now_ = now_.astimezone(timezone.utc)

    min_days: int | None = None
    for intent in matching_intents:
        if not isinstance(intent, dict):
            continue
        dt = _parse_deadline(intent.get("deadline"))
        if dt is None:
            continue
        d = _calendar_days_until(dt, now_)
        if min_days is None or d < min_days:
            min_days = d

    if min_days is None:
        return max(0, min(100, int(base_score)))

    if min_days < 0:
        boost = BOOST_OVERDUE
    elif min_days <= 1:
        boost = BOOST_DAYS_0_1
    elif min_days <= 3:
        boost = BOOST_DAYS_2_3
    elif min_days <= 7:
        boost = BOOST_DAYS_4_7
    else:
        boost = 0

    out = int(base_score) + boost
    return max(0, min(100, out))
