from __future__ import annotations

from groq import Groq

from app.services.llm.base import ClassificationResult, LLMClassifier
from app.services.llm.normalize import parse_and_normalize_classification
from app.services.llm.prompting import build_classification_prompt, build_messages_for_json_response


class GroqClassifier(LLMClassifier):
    def __init__(self, *, api_key: str, model: str) -> None:
        self._client = Groq(api_key=api_key)
        self._model = model

    def classify_email(
        self,
        *,
        email_text: str,
        matching_intents: list[dict],
        similar_examples_block: str = "",
        web_context_block: str = "",
        classification_policy: str = "",
    ) -> ClassificationResult:
        prompt = build_classification_prompt(
            email_text=email_text,
            matching_intents=matching_intents,
            similar_examples_block=similar_examples_block,
            web_context_block=web_context_block,
            classification_policy=classification_policy,
        )

        def _run(*, temperature: float) -> str:
            completion = self._client.chat.completions.create(
                model=self._model,
                # Groq SDK has a narrow message type; we cast at the boundary.
                messages=build_messages_for_json_response(prompt),  # pyright: ignore[reportArgumentType]
                temperature=temperature,
                response_format={"type": "json_object"},
            )
            return completion.choices[0].message.content or "{}"

        try:
            return parse_and_normalize_classification(_run(temperature=0.1))
        except Exception:  # noqa: BLE001
            # Single retry at temp=0 for better determinism / formatting.
            return parse_and_normalize_classification(_run(temperature=0.0))
