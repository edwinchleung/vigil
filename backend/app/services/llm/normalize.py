from __future__ import annotations

import json
import re
from typing import Any

from app.services.llm.base import ClassificationResult


def _parse_json_object(content: str) -> dict[str, Any]:
    raw = (content or "").strip()
    if not raw:
        raw = "{}"

    # Be defensive: some providers may return leading/trailing text despite instructions.
    if not raw.startswith("{") or not raw.endswith("}"):
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1 and end > start:
            raw = raw[start : end + 1]

    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("LLM response was not a JSON object")
    return parsed


def normalize_classification_dict(raw: dict[str, Any]) -> ClassificationResult:
    # `reasoning` is a hidden chain-of-thought field; we read and discard it so the
    # persisted ClassificationResult stays at 4 fields. Truncated for safety.
    _ = str(raw.get("reasoning", ""))[:240]

    category = str(raw.get("category", "")).strip().lower()
    category_map = {
        "critical": "Critical",
        "relevant": "Relevant",
        "low-value": "Low-Value",
        "low value": "Low-Value",
    }
    normalized_category = category_map.get(category, "Low-Value")

    score = raw.get("vigilScore", 0)
    try:
        score_int = int(score)
    except (TypeError, ValueError):
        score_int = 0
    score_int = max(0, min(score_int, 100))

    summary = str(raw.get("summary", "")).strip() or "No summary generated."
    if len(summary) > 240:
        summary = summary[:239].rstrip() + "…"

    actions = raw.get("actions", [])
    if not isinstance(actions, list):
        actions = []
    normalized_actions: list[Any] = []
    for item in actions[:5]:
        if isinstance(item, str):
            s = re.sub(r"\s+", " ", item).strip()
            if s:
                normalized_actions.append(s[:120])
        # Ignore non-strings to keep stable schema.

    return ClassificationResult(
        category=normalized_category,
        vigilScore=score_int,
        summary=summary,
        actions=normalized_actions,
    )


def parse_and_normalize_classification(content: str) -> ClassificationResult:
    return normalize_classification_dict(_parse_json_object(content))
