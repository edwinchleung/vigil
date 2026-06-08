from __future__ import annotations

from app.services.llm.prompting import (
    CORE_CLASSIFICATION_SYSTEM_PROMPT,
    build_classification_prompt,
    build_messages_for_json_response,
)


def test_build_classification_prompt_includes_user_preferences_when_set() -> None:
    p = build_classification_prompt(
        email_text="Subject: Hi\n",
        matching_intents=[],
        classification_policy="Prioritize anything from legal@",
    )
    assert "<user_preferences>" in p
    assert "Prioritize anything from legal@" in p
    assert "</user_preferences>" in p
    assert "## User-specific preferences" in p


def test_build_classification_prompt_omits_empty_policy() -> None:
    p = build_classification_prompt(
        email_text="Subject: Hi\n",
        matching_intents=[],
        classification_policy="   ",
    )
    assert "<user_preferences>" not in p


def test_core_system_in_messages() -> None:
    m = build_messages_for_json_response("user body")
    assert m[0]["role"] == "system"
    assert m[0]["content"] == CORE_CLASSIFICATION_SYSTEM_PROMPT
    assert m[1]["content"] == "user body"
