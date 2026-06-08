from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class ClassificationResult:
    category: str
    vigilScore: int
    summary: str
    actions: list[Any]


class LLMClassifier(Protocol):
    def classify_email(
        self,
        *,
        email_text: str,
        matching_intents: list[dict[str, Any]],
        similar_examples_block: str = "",
        web_context_block: str = "",
        classification_policy: str = "",
    ) -> ClassificationResult: ...
