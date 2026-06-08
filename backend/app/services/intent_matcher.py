import math
from typing import Any


def parse_embedding(raw_embedding: Any) -> list[float] | None:
    if raw_embedding is None:
        return None
    if isinstance(raw_embedding, list):
        return [float(value) for value in raw_embedding]
    if isinstance(raw_embedding, str):
        stripped = raw_embedding.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            inner = stripped[1:-1].strip()
            if not inner:
                return []
            return [float(part.strip()) for part in inner.split(",")]
    return None


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return -1.0
    dot = sum(a * b for a, b in zip(left, right, strict=False))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0.0 or right_norm == 0.0:
        return -1.0
    return dot / (left_norm * right_norm)


def top_matching_intents(
    *,
    email_embedding: list[float],
    intents: list[dict[str, Any]],
    limit: int,
) -> list[dict[str, Any]]:
    scored: list[tuple[float, dict[str, Any]]] = []
    for intent in intents:
        intent_embedding = parse_embedding(intent.get("embedding"))
        if intent_embedding is None:
            continue
        score = cosine_similarity(email_embedding, intent_embedding)
        scored.append((score, intent))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [intent for _, intent in scored[:limit]]


def top_matching_intents_scored(
    *,
    email_embedding: list[float],
    intents: list[dict[str, Any]],
    limit: int,
) -> list[dict[str, Any]]:
    scored: list[tuple[float, dict[str, Any]]] = []
    for intent in intents:
        intent_embedding = parse_embedding(intent.get("embedding"))
        if intent_embedding is None:
            continue
        score = cosine_similarity(email_embedding, intent_embedding)
        scored.append((score, intent))
    scored.sort(key=lambda item: item[0], reverse=True)
    out: list[dict[str, Any]] = []
    for score, intent in scored[:limit]:
        copy = dict(intent)
        copy["similarity"] = float(score)
        out.append(copy)
    return out
