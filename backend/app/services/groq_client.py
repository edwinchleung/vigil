from __future__ import annotations

from typing import Any

from app.services.llm.providers.groq import GroqClassifier


class GroqClient:
    """Backwards-compat wrapper around the new provider module.

    Existing code expects a dict output; the new LLM abstraction returns a typed result.
    """

    def __init__(self, api_key: str, model: str) -> None:
        self._impl = GroqClassifier(api_key=api_key, model=model)

    def classify_email(
        self, *, email_text: str, matching_intents: list[dict[str, Any]]
    ) -> dict[str, Any]:
        result = self._impl.classify_email(email_text=email_text, matching_intents=matching_intents)
        return {
            "category": result.category,
            "vigilScore": result.vigilScore,
            "summary": result.summary,
            "actions": result.actions,
        }
