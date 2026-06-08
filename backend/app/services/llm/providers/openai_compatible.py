from __future__ import annotations

import json
from typing import Any

import httpx

from app.services.llm.base import ClassificationResult, LLMClassifier
from app.services.llm.normalize import parse_and_normalize_classification
from app.services.llm.prompting import build_classification_prompt, build_messages_for_json_response


class OpenAICompatibleClassifier(LLMClassifier):
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        timeout_s: float = 60.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._model = model
        self._timeout = timeout_s

    def classify_email(
        self,
        *,
        email_text: str,
        matching_intents: list[dict[str, Any]],
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
        url = f"{self._base_url}/v1/chat/completions"
        headers = {"Authorization": f"Bearer {self._api_key}"}

        def _run(*, temperature: float) -> str:
            payload: dict[str, Any] = {
                "model": self._model,
                "messages": build_messages_for_json_response(prompt),
                "temperature": temperature,
                # Many OpenAI-compatible hosts support this; if ignored, we still parse content.
                "response_format": {"type": "json_object"},
            }
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
            try:
                content = data["choices"][0]["message"]["content"]
            except Exception as e:  # noqa: BLE001
                raise ValueError(
                    f"Unexpected OpenAI-compatible response shape: {json.dumps(data)[:500]}"
                ) from e
            if not isinstance(content, str):
                raise ValueError(
                    f"OpenAI-compatible content was not a string: {json.dumps(data)[:500]}"
                )
            return content

        try:
            return parse_and_normalize_classification(_run(temperature=0.1))
        except Exception:  # noqa: BLE001
            return parse_and_normalize_classification(_run(temperature=0.0))
