from datetime import datetime, timezone
from typing import Any, cast

from supabase import Client

from app.services.supabase_client import get_supabase_client


class EmailRepository:
    def __init__(self, client: Client) -> None:
        self._client = client

    @classmethod
    def from_settings(cls, settings: Any) -> "EmailRepository":
        return cls(get_supabase_client(settings))

    def get_user_classification_settings(self, *, user_id: str) -> dict[str, Any] | None:
        """Returns classificationPolicy, aiPreferences for the user (or None if missing)."""
        response = (
            self._client.table("User")
            .select("classificationPolicy,aiPreferences")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        data = cast(list[dict[str, Any]], response.data or [])
        return data[0] if data else None

    def get_email(self, *, email_id: str, user_id: str) -> dict[str, Any] | None:
        response = (
            self._client.table("Email")
            .select("*")
            .eq("id", email_id)
            .eq("userId", user_id)
            .limit(1)
            .execute()
        )
        # supabase-py types response.data as generic JSON; we narrow it at the boundary.
        data = cast(list[dict[str, Any]], response.data or [])
        return data[0] if data else None

    def get_recent_emails_for_grounding(
        self, *, user_id: str, limit: int = 25
    ) -> list[dict[str, Any]]:
        """
        Fetch recent emails usable as labelled few-shot examples: must be COMPLETED
        and have a cached embedding so we can score similarity without re-embedding.
        """
        response = (
            self._client.table("Email")
            .select("id,subject,sender,snippet,category,summary,vigilScore,embedding")
            .eq("userId", user_id)
            .eq("aiStatus", "COMPLETED")
            .not_.is_("embedding", "null")
            .order("receivedAt", desc=True)
            .limit(limit)
            .execute()
        )
        return cast(list[dict[str, Any]], list(response.data or []))

    def get_active_intents(self, *, user_id: str) -> list[dict[str, Any]]:
        response = (
            self._client.table("Intent")
            .select("id,query,deadline,isActive,embedding")
            .eq("userId", user_id)
            .eq("isActive", True)
            .execute()
        )
        # supabase-py types response.data as list[JSON]; we narrow it at the boundary.
        return cast(list[dict[str, Any]], list(response.data or []))

    def get_intent(self, *, intent_id: str, user_id: str) -> dict[str, Any] | None:
        response = (
            self._client.table("Intent")
            .select("id,query,deadline,isActive,embedding")
            .eq("id", intent_id)
            .eq("userId", user_id)
            .limit(1)
            .execute()
        )
        data = cast(list[dict[str, Any]], response.data or [])
        return data[0] if data else None

    def set_intent_embedding(
        self, *, intent_id: str, user_id: str, embedding: list[float] | None
    ) -> None:
        payload: dict[str, Any] = {"embedding": embedding}
        (
            self._client.table("Intent")
            .update(payload)
            .eq("id", intent_id)
            .eq("userId", user_id)
            .execute()
        )

    def set_email_status(self, *, email_id: str, user_id: str, ai_status: str) -> None:
        (
            self._client.table("Email")
            .update({"aiStatus": ai_status})
            .eq("id", email_id)
            .eq("userId", user_id)
            .execute()
        )

    def mark_completed(
        self,
        *,
        email_id: str,
        user_id: str,
        vigil_score: int,
        category: str,
        summary: str,
        actions: list[Any],
        raw: dict[str, Any] | None = None,
        embedding: list[float] | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "aiStatus": "COMPLETED",
            "vigilScore": vigil_score,
            "category": category,
            "summary": summary,
            "actions": actions,
        }
        if raw is not None:
            payload["raw"] = raw
        if embedding is not None:
            payload["embedding"] = embedding
        (
            self._client.table("Email")
            .update(payload)
            .eq("id", email_id)
            .eq("userId", user_id)
            .execute()
        )

    def mark_failed(self, *, email_id: str, user_id: str) -> None:
        (
            self._client.table("Email")
            .update({"aiStatus": "FAILED"})
            .eq("id", email_id)
            .eq("userId", user_id)
            .execute()
        )

    def list_pending_analysis_requests(self, *, limit: int = 25) -> list[dict[str, Any]]:
        response = (
            self._client.table("EmailAnalysisRequest")
            .select("id,userId,emailId,mode,status,createdAt")
            .eq("status", "PENDING")
            .order("createdAt", desc=False)
            .limit(limit)
            .execute()
        )
        return cast(list[dict[str, Any]], list(response.data or []))

    def claim_analysis_request(self, *, request_id: str) -> bool:
        """
        Best-effort claim:
        - Only transitions PENDING -> CLAIMED
        - Returns True if a row was updated
        """
        now = datetime.now(timezone.utc).isoformat()
        response = (
            self._client.table("EmailAnalysisRequest")
            .update({"status": "CLAIMED", "claimedAt": now})
            .eq("id", request_id)
            .eq("status", "PENDING")
            .execute()
        )
        data = cast(list[dict[str, Any]], response.data or [])
        return bool(data)

    def mark_analysis_request_done(self, *, request_id: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        (
            self._client.table("EmailAnalysisRequest")
            .update({"status": "DONE", "processedAt": now, "error": None})
            .eq("id", request_id)
            .execute()
        )

    def mark_analysis_request_failed(self, *, request_id: str, error: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        (
            self._client.table("EmailAnalysisRequest")
            .update({"status": "FAILED", "processedAt": now, "error": error[:1200]})
            .eq("id", request_id)
            .execute()
        )

    def list_emails_needing_analysis(
        self,
        *,
        user_id: str,
        limit: int = 200,
        include_failed: bool = True,
    ) -> list[dict[str, Any]]:
        """
        "Not analyzed" means aiStatus != COMPLETED.
        By default we include FAILED so the user can retry.
        """
        statuses = ["PENDING"]
        if include_failed:
            statuses.append("FAILED")
        response = (
            self._client.table("Email")
            .select("id,userId,aiStatus")
            .eq("userId", user_id)
            .in_("aiStatus", statuses)
            .order("receivedAt", desc=False)
            .limit(limit)
            .execute()
        )
        return cast(list[dict[str, Any]], list(response.data or []))
