from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Any

# Kept in sync with settings defaults in pipeline + config.
_DEFAULT_GROUNDING_FLOOR = 0.55
_DEFAULT_GROUNDING_LIMIT = 3

# Policy text: prevent oversized prompts and mild injection surface.
_MAX_CLASSIFICATION_POLICY_LEN = 4000

_GROUNDING_FLOOR_MIN = 0.1
_GROUNDING_FLOOR_MAX = 0.95
_GROUNDING_LIMIT_MIN = 1
_GROUNDING_LIMIT_MAX = 10
_INTENT_MATCH_MIN = 1
_INTENT_MATCH_MAX = 15


@dataclass(frozen=True)
class ResolvedAiPreferences:
    """Per-user RAG / intent selection overrides after validation."""

    grounding_similarity_floor: float
    grounding_example_limit: int
    intent_match_limit: int
    source: str  # "defaults" | "user"


def _clamp_int(n: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, n))


def _clamp_float(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def sanitize_classification_policy(text: str | None) -> str:
    if not text:
        return ""
    t = (text or "").replace("\x00", "")
    t = re.sub(r"\r\n|\r", "\n", t).strip()
    if len(t) > _MAX_CLASSIFICATION_POLICY_LEN:
        t = t[: _MAX_CLASSIFICATION_POLICY_LEN - 1].rstrip() + "…"
    return t


def policy_fingerprint(policy: str, raw_prefs: Any) -> str:
    """Short stable id for debug logs (not cryptographic)."""
    payload = f"{policy}\n{raw_prefs!r}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]


def _as_float(v: Any) -> float | None:
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v.strip())
        except ValueError:
            return None
    return None


def _as_int(v: Any) -> int | None:
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v)
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        try:
            return int(s)
        except ValueError:
            try:
                return int(float(s))
            except ValueError:
                return None
    return None


def parse_and_resolve_ai_preferences(
    raw: Any,
    *,
    default_intent_match_limit: int,
) -> ResolvedAiPreferences:
    """
    Parse User.aiPreferences JSON. Unknown keys ignored.
    Expected optional keys: groundingSimilarityFloor, groundingExampleLimit, intentMatchLimit
    """
    if not isinstance(raw, dict):
        return ResolvedAiPreferences(
            grounding_similarity_floor=_DEFAULT_GROUNDING_FLOOR,
            grounding_example_limit=_DEFAULT_GROUNDING_LIMIT,
            intent_match_limit=default_intent_match_limit,
            source="defaults",
        )

    floor = _as_float(raw.get("groundingSimilarityFloor"))
    g_limit = _as_int(raw.get("groundingExampleLimit"))
    i_limit = _as_int(raw.get("intentMatchLimit"))

    has_any = floor is not None or g_limit is not None or i_limit is not None
    if not has_any:
        return ResolvedAiPreferences(
            grounding_similarity_floor=_DEFAULT_GROUNDING_FLOOR,
            grounding_example_limit=_DEFAULT_GROUNDING_LIMIT,
            intent_match_limit=default_intent_match_limit,
            source="defaults",
        )

    resolved_floor = (
        _DEFAULT_GROUNDING_FLOOR
        if floor is None
        else _clamp_float(floor, _GROUNDING_FLOOR_MIN, _GROUNDING_FLOOR_MAX)
    )

    resolved_g = (
        _DEFAULT_GROUNDING_LIMIT
        if g_limit is None
        else _clamp_int(g_limit, _GROUNDING_LIMIT_MIN, _GROUNDING_LIMIT_MAX)
    )  # noqa: E501

    resolved_i = (
        default_intent_match_limit
        if i_limit is None
        else _clamp_int(i_limit, _INTENT_MATCH_MIN, _INTENT_MATCH_MAX)
    )  # noqa: E501

    return ResolvedAiPreferences(
        grounding_similarity_floor=resolved_floor,
        grounding_example_limit=resolved_g,
        intent_match_limit=resolved_i,
        source="user",
    )
