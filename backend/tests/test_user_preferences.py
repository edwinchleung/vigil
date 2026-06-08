from __future__ import annotations

import pytest

from app.services.user_preferences import (
    parse_and_resolve_ai_preferences,
    policy_fingerprint,
    sanitize_classification_policy,
)


def test_sanitize_classification_policy_strips_nuls_and_truncates() -> None:
    long = "x" * 5000
    out = sanitize_classification_policy("a\x00b\n" + long)
    assert "\x00" not in out
    assert out.endswith("…")
    assert len(out) == 4000


def test_sanitize_empty() -> None:
    assert sanitize_classification_policy(None) == ""
    assert sanitize_classification_policy("  ") == ""


def test_policy_fingerprint_stable() -> None:
    a = policy_fingerprint("role: ic", {"groundingSimilarityFloor": 0.6})
    b = policy_fingerprint("role: ic", {"groundingSimilarityFloor": 0.6})
    c = policy_fingerprint("role: pm", {"groundingSimilarityFloor": 0.6})
    assert a == b
    assert a != c
    assert len(a) == 12


def test_parse_defaults_when_missing() -> None:
    r = parse_and_resolve_ai_preferences(None, default_intent_match_limit=5)
    assert r.grounding_similarity_floor == 0.55
    assert r.grounding_example_limit == 3
    assert r.intent_match_limit == 5
    assert r.source == "defaults"


def test_parse_clamps() -> None:
    r = parse_and_resolve_ai_preferences(
        {
            "groundingSimilarityFloor": 0.99,
            "groundingExampleLimit": 100,
            "intentMatchLimit": 2,
        },
        default_intent_match_limit=5,
    )
    assert r.grounding_similarity_floor == 0.95
    assert r.grounding_example_limit == 10
    assert r.intent_match_limit == 2
    assert r.source == "user"


@pytest.mark.parametrize(
    "raw,expected_i",
    [
        ({}, 5),
        ({"intentMatchLimit": 20}, 15),
    ],
)
def test_intent_match_clamp(
    raw: dict,
    expected_i: int,
) -> None:
    r = parse_and_resolve_ai_preferences(raw, default_intent_match_limit=5)
    assert r.intent_match_limit == expected_i
