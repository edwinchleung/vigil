from __future__ import annotations

from datetime import datetime
from typing import Any

from app.services.embeddings import EmbeddingService
from app.services.email_repository import EmailRepository


def _intent_to_text(intent_row: dict[str, Any]) -> str:
    # Keep this stable so embeddings are comparable over time.
    parts = [f"Intent: {intent_row.get('query') or ''}"]
    deadline = intent_row.get("deadline")
    if isinstance(deadline, str) and deadline.strip():
        parts.append(f"Deadline: {deadline.strip()}")
    elif isinstance(deadline, datetime):
        parts.append(f"Deadline: {deadline.isoformat()}")
    return "\n".join(parts)


def upsert_intent_embedding(
    *,
    repo: EmailRepository,
    embedder: EmbeddingService,
    intent_id: str,
    user_id: str,
) -> None:
    intent_row = repo.get_intent(intent_id=intent_id, user_id=user_id)
    if intent_row is None:
        raise ValueError(f"Intent not found for id={intent_id}")
    if not intent_row.get("isActive", False):
        # Keep existing embedding by default; matcher ignores inactive intents anyway.
        return
    text = _intent_to_text(intent_row)
    embedding = embedder.embed_text(text)
    repo.set_intent_embedding(intent_id=intent_id, user_id=user_id, embedding=embedding)
