import asyncio
import logging
from typing import Any

from app.config import Settings
from app.services.email_repository import EmailRepository
from app.services.email_content import (
    compact_text,
    extract_email_body_text_with_meta,
    extract_links,
)
from app.services.embeddings import EmbeddingService
from app.services.intent_matcher import (
    cosine_similarity,
    parse_embedding,
    top_matching_intents,
    top_matching_intents_scored,
)
from app.services.intent_embeddings import upsert_intent_embedding
from app.services.llm.registry import get_llm_classifier
from app.services.llm.redaction import redact_text_for_llm, strip_url_secrets
from app.services.temporal_scoring import adjust_vigil_score_for_intent_deadlines
from app.services.user_preferences import (
    parse_and_resolve_ai_preferences,
    policy_fingerprint,
    sanitize_classification_policy,
)
from app.services.web_grounding import build_web_context_block_with_meta
from app.worker.queue import EmailTask, IntentTask, Task

logger = logging.getLogger(__name__)

_pipeline_lock = asyncio.Lock()
_pipeline_instance: "EmailPipeline | None" = None

_GROUNDING_SIMILARITY_FLOOR = 0.55
_GROUNDING_LIMIT = 3
_KNOWN_CATEGORIES = ("Critical", "Relevant", "Low-Value")


def _email_to_text(email_row: dict[str, Any]) -> str:
    subject = (email_row.get("subject") or "").strip()
    sender = (email_row.get("sender") or "").strip()
    snippet = (email_row.get("snippet") or "").strip()

    body, _meta = extract_email_body_text_with_meta(email_row)
    body = compact_text(body, max_chars=12_000)
    links = extract_links(body, limit=8)

    parts = [
        f"Subject: {subject}",
        f"From: {sender}",
        f"Snippet: {snippet}",
    ]
    if body:
        parts.append("Body:\n" + body)
    if links:
        parts.append("Links:\n" + "\n".join(f"- {u}" for u in links))
    return "\n".join(parts).strip()


def _format_grounding_example(row: dict[str, Any], sim: float) -> str:
    subject = str(row.get("subject") or "").strip()[:140]
    sender = str(row.get("sender") or "").strip()[:120]
    snippet = str(row.get("snippet") or "").strip().replace("\n", " ")[:200]
    category = str(row.get("category") or "").strip() or "Low-Value"
    score = row.get("vigilScore")
    summary = str(row.get("summary") or "").strip().replace("\n", " ")[:200]

    return (
        "<example>\n"
        f"<email>\nSubject: {subject}\nFrom: {sender}\nSnippet: {snippet}\n</email>\n"
        f'Output: {{"category":"{category}","vigilScore":{score},"summary":"{summary}"}} '
        f"(sim={sim:.2f})\n"
        "</example>"
    )


def _build_grounding_block(
    *,
    current_email_id: str,
    current_embedding: list[float],
    recent_rows: list[dict[str, Any]],
    limit: int = _GROUNDING_LIMIT,
    similarity_floor: float = _GROUNDING_SIMILARITY_FLOOR,
) -> tuple[str, dict[str, Any]]:
    """
    Score recent labelled emails by cached cosine similarity, drop weak matches,
    diversify by category, and render scenario-rich few-shot examples.
    Returns (rendered_block, debug_dict).
    """
    scored: list[tuple[float, dict[str, Any]]] = []
    considered = 0
    for row in recent_rows:
        if str(row.get("id") or "") == current_email_id:
            continue
        emb = parse_embedding(row.get("embedding"))
        if not emb:
            continue
        considered += 1
        sim = cosine_similarity(current_embedding, emb)
        if sim < similarity_floor:
            continue
        scored.append((sim, row))

    scored.sort(key=lambda item: item[0], reverse=True)

    # Per-category diversity: at most 1 example per category, then fill with leftovers.
    by_category: dict[str, tuple[float, dict[str, Any]]] = {}
    leftovers: list[tuple[float, dict[str, Any]]] = []
    for sim, row in scored:
        cat = str(row.get("category") or "").strip()
        if cat in _KNOWN_CATEGORIES and cat not in by_category:
            by_category[cat] = (sim, row)
        else:
            leftovers.append((sim, row))

    chosen: list[tuple[float, dict[str, Any]]] = []
    for cat in _KNOWN_CATEGORIES:
        if cat in by_category:
            chosen.append(by_category[cat])
        if len(chosen) >= limit:
            break
    for item in leftovers:
        if len(chosen) >= limit:
            break
        chosen.append(item)

    examples = [_format_grounding_example(row, sim) for sim, row in chosen]
    block = "\n".join(examples)
    debug = {
        "considered": considered,
        "kept": len(chosen),
        "top": [
            {
                "sim": round(float(sim), 4),
                "email_id": row.get("id"),
                "subject": str(row.get("subject") or "")[:120],
                "category": row.get("category"),
                "vigilScore": row.get("vigilScore"),
            }
            for sim, row in chosen
        ],
    }
    return block, debug


class EmailPipeline:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._repo = EmailRepository.from_settings(settings)
        self._embedder = EmbeddingService(settings.embedding_model_name)
        self._llm = get_llm_classifier(settings)

    def _zero_retention_enabled(self, _user_id: str) -> bool:
        # Temporary milestone decision until `User.zeroRetention` exists in schema.
        return False

    async def process(self, task: EmailTask) -> None:
        self._repo.set_email_status(
            email_id=task.email_id,
            user_id=task.user_id,
            ai_status="PROCESSING",
        )
        email_row = self._repo.get_email(email_id=task.email_id, user_id=task.user_id)
        if email_row is None:
            raise ValueError(f"Email not found for id={task.email_id}")

        user_row = self._repo.get_user_classification_settings(user_id=task.user_id) or {}
        policy_raw = user_row.get("classificationPolicy")
        policy_text = (
            sanitize_classification_policy(policy_raw) if isinstance(policy_raw, str) else ""
        )
        raw_ai_prefs = user_row.get("aiPreferences")
        resolved_prefs = parse_and_resolve_ai_preferences(
            raw_ai_prefs,
            default_intent_match_limit=self._settings.intent_match_limit,
        )
        policy_fp = policy_fingerprint(policy_text, raw_ai_prefs)

        debug_on = bool(getattr(self._settings, "rag_debug_logs", False))
        if debug_on and (policy_text or resolved_prefs.source == "user"):
            logger.info(
                "User classification context",
                extra={
                    "email_id": task.email_id,
                    "user_id": task.user_id,
                    "policy_fingerprint": policy_fp,
                    "ai_prefs_source": resolved_prefs.source,
                },
            )

        body, body_meta = extract_email_body_text_with_meta(email_row)
        body_compact = compact_text(body, max_chars=12_000)
        links = extract_links(body_compact, limit=8)
        links_safe = [strip_url_secrets(u) for u in links]
        body_compact = redact_text_for_llm(body_compact)

        subject = (email_row.get("subject") or "").strip()
        sender = (email_row.get("sender") or "").strip()
        snippet = (email_row.get("snippet") or "").strip()
        snippet = redact_text_for_llm(snippet)
        parts = [
            f"Subject: {subject}",
            f"From: {sender}",
            f"Snippet: {snippet}",
        ]
        if body_compact:
            parts.append("Body:\n" + body_compact)
        if links_safe:
            parts.append("Links:\n" + "\n".join(f"- {u}" for u in links_safe))
        email_text = redact_text_for_llm("\n".join(parts).strip())

        if debug_on:
            logger.info(
                "RAG debug: extracted email body",
                extra={
                    "email_id": task.email_id,
                    "user_id": task.user_id,
                    "provider": body_meta.get("provider"),
                    "body_source": body_meta.get("source"),
                    "body_len": body_meta.get("body_len"),
                    "body_len_compact": len(body_compact),
                    "links_count": len(links),
                },
            )

        email_embedding = self._embedder.embed_text(email_text)

        recent = self._repo.get_recent_emails_for_grounding(user_id=task.user_id, limit=25)
        examples_block, grounding_debug = _build_grounding_block(
            current_email_id=task.email_id,
            current_embedding=email_embedding,
            recent_rows=recent,
            limit=resolved_prefs.grounding_example_limit,
            similarity_floor=resolved_prefs.grounding_similarity_floor,
        )
        if debug_on:
            logger.info(
                "RAG debug: internal grounding",
                extra={
                    "email_id": task.email_id,
                    "user_id": task.user_id,
                    "recent_rows": len(recent),
                    "considered": grounding_debug.get("considered"),
                    "kept": grounding_debug.get("kept"),
                    "top": grounding_debug.get("top"),
                    "similarity_floor": resolved_prefs.grounding_similarity_floor,
                    "grounding_limit": resolved_prefs.grounding_example_limit,
                },
            )

        web_context_block = ""
        if getattr(self._settings, "web_grounding_enabled", False):
            web_context_block, web_meta = build_web_context_block_with_meta(
                email_text, tavily_api_key=getattr(self._settings, "tavily_api_key", None)
            )
            if debug_on:
                logger.info(
                    "RAG debug: web grounding",
                    extra={
                        "email_id": task.email_id,
                        "user_id": task.user_id,
                        "web_grounding_enabled": True,
                        "added_web_context": bool(web_context_block),
                        "snippets_count": web_meta.get("snippets_count"),
                        "reason": web_meta.get("reason"),
                        "error": web_meta.get("error"),
                    },
                )

        intents = self._repo.get_active_intents(user_id=task.user_id)
        if debug_on:
            try:
                scored_intents = top_matching_intents_scored(
                    email_embedding=email_embedding,
                    intents=intents,
                    limit=resolved_prefs.intent_match_limit,
                )
                logger.info(
                    "RAG debug: intent matching",
                    extra={
                        "email_id": task.email_id,
                        "user_id": task.user_id,
                        "active_intents": len(intents),
                        "selected": [
                            {
                                "id": i.get("id"),
                                "similarity": round(float(i.get("similarity") or 0.0), 4),
                                "query": str(i.get("query") or "")[:120],
                            }
                            for i in scored_intents
                        ],
                    },
                )
            except Exception:  # noqa: BLE001
                logger.info(
                    "RAG debug: intent matching (failed)",
                    extra={
                        "email_id": task.email_id,
                        "user_id": task.user_id,
                        "active_intents": len(intents),
                    },
                )
        matching_intents = top_matching_intents(
            email_embedding=email_embedding,
            intents=intents,
            limit=resolved_prefs.intent_match_limit,
        )
        if debug_on:
            logger.info(
                "RAG debug: final LLM input length",
                extra={
                    "email_id": task.email_id,
                    "user_id": task.user_id,
                    "email_text_len": len(email_text),
                    "examples_block_len": len(examples_block),
                    "web_context_block_len": len(web_context_block),
                },
            )
        classification = self._llm.classify_email(
            email_text=email_text,
            matching_intents=matching_intents,
            similar_examples_block=examples_block,
            web_context_block=web_context_block,
            classification_policy=policy_text,
        )
        final_score = adjust_vigil_score_for_intent_deadlines(
            classification.vigilScore,
            matching_intents,
        )

        raw_payload: dict[str, Any] | None = None
        if self._zero_retention_enabled(task.user_id):
            raw_payload = {}

        self._repo.mark_completed(
            email_id=task.email_id,
            user_id=task.user_id,
            vigil_score=final_score,
            category=classification.category,
            summary=classification.summary,
            actions=classification.actions,
            raw=raw_payload,
            embedding=email_embedding,
        )

    async def process_with_failure_handling(self, task: EmailTask) -> None:
        try:
            await self.process(task)
        except Exception:  # noqa: BLE001
            logger.exception(
                "Pipeline failed", extra={"email_id": task.email_id, "user_id": task.user_id}
            )
            self._repo.mark_failed(email_id=task.email_id, user_id=task.user_id)
            raise


async def get_pipeline(settings: Settings) -> EmailPipeline:
    global _pipeline_instance
    if _pipeline_instance is not None:
        return _pipeline_instance
    async with _pipeline_lock:
        if _pipeline_instance is None:
            _pipeline_instance = EmailPipeline(settings)
    return _pipeline_instance


async def process_email_task(task: EmailTask, settings: Settings) -> None:
    pipeline = await get_pipeline(settings)
    await pipeline.process_with_failure_handling(task)


async def process_intent_task(task: IntentTask, settings: Settings) -> None:
    pipeline = await get_pipeline(settings)
    # Reuse the pipeline’s repo + embedder; this keeps model choice consistent.
    repo = getattr(pipeline, "_repo")
    embedder = getattr(pipeline, "_embedder")
    upsert_intent_embedding(
        repo=repo, embedder=embedder, intent_id=task.intent_id, user_id=task.user_id
    )


async def process_task(task: Task, settings: Settings) -> None:
    if isinstance(task, EmailTask):
        await process_email_task(task, settings)
        return
    if isinstance(task, IntentTask):
        await process_intent_task(task, settings)
        return
    raise RuntimeError(f"Unsupported task type: {type(task).__name__}")
