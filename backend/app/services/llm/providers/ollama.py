from __future__ import annotations

import json
from typing import Any

import httpx

from app.services.llm.base import ClassificationResult, LLMClassifier
from app.services.llm.normalize import parse_and_normalize_classification
from app.services.llm.prompting import (
    CORE_CLASSIFICATION_SYSTEM_PROMPT,
    build_classification_prompt,
    build_messages_for_json_response,
)


class OllamaClassifier(LLMClassifier):
    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        timeout_s: float = 60.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
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
        schema = {
            "type": "object",
            "properties": {
                "reasoning": {"type": "string", "maxLength": 240},
                "category": {"type": "string", "enum": ["Critical", "Relevant", "Low-Value"]},
                "vigilScore": {"type": "integer", "minimum": 0, "maximum": 100},
                "summary": {"type": "string"},
                "actions": {"type": "array", "items": {"type": "string"}, "maxItems": 5},
            },
            "required": ["reasoning", "category", "vigilScore", "summary", "actions"],
            "additionalProperties": False,
        }

        # Some models ignore structured output on `/api/chat`; `/api/generate` is more reliable.
        messages = build_messages_for_json_response(prompt)
        system = messages[0].get("content", "") if messages else CORE_CLASSIFICATION_SYSTEM_PROMPT
        full_prompt = f"{system}\n\n{prompt}".strip()
        payload = {
            "model": self._model,
            "prompt": full_prompt,
            "stream": False,
            "format": schema,
            "options": {"temperature": 0.0},
        }
        url = f"{self._base_url}/api/generate"
        with httpx.Client(timeout=self._timeout) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()

        # `/api/generate` returns {"response": "..."}
        content = data.get("response") if isinstance(data, dict) else None
        if not isinstance(content, str):
            raise ValueError(f"Unexpected Ollama response shape: {json.dumps(data)[:500]}")
        return parse_and_normalize_classification(content)
