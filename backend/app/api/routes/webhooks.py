from __future__ import annotations

import hmac
import time
from hashlib import sha256

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status

from app.config import Settings
from app.models.webhook import EmailWebhookPayload, IntentWebhookPayload
from app.worker.queue import EmailTask, IntentTask, TaskQueue

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_task_queue(request: Request) -> TaskQueue:
    return request.app.state.task_queue


def _check_authorization(auth_header: str | None, secret: str | None) -> None:
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook secret is not configured",
        )
    expected = f"Bearer {secret}"
    if not auth_header or not hmac.compare_digest(auth_header, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


def _check_hmac_signature(
    *, ts_header: str | None, sig_header: str | None, body: bytes, secret: str
) -> None:
    if not ts_header or not sig_header:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    try:
        ts = int(ts_header)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized"
        ) from exc

    now = int(time.time())
    if ts < now - 300 or ts > now + 60:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    msg = ts_header.encode("utf-8") + b"." + body
    expected = hmac.new(secret.encode("utf-8"), msg, sha256).hexdigest()
    if not hmac.compare_digest(sig_header, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


async def _authorize_webhook(
    *,
    request: Request,
    secret: str | None,
    authorization: str | None,
    x_timestamp: str | None,
    x_signature: str | None,
) -> None:
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook secret is not configured",
        )

    # Prefer signed requests; keep bearer fallback for compatibility.
    if x_timestamp or x_signature:
        body = await request.body()
        _check_hmac_signature(
            ts_header=x_timestamp, sig_header=x_signature, body=body, secret=secret
        )
        return

    _check_authorization(authorization, secret)


@router.post("/email")
async def enqueue_email_webhook(
    payload: EmailWebhookPayload,
    authorization: str | None = Header(default=None),
    x_timestamp: str | None = Header(default=None, alias="X-Timestamp"),
    x_signature: str | None = Header(default=None, alias="X-Signature"),
    request: Request = None,  # type: ignore[assignment]
    settings: Settings = Depends(get_settings),
    task_queue: TaskQueue = Depends(get_task_queue),
) -> dict[str, str]:
    if request is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Missing request"
        )
    await _authorize_webhook(
        request=request,
        secret=settings.internal_ai_secret,
        authorization=authorization,
        x_timestamp=x_timestamp,
        x_signature=x_signature,
    )
    await task_queue.enqueue(EmailTask(email_id=payload.email_id, user_id=payload.user_id))
    return {"status": "queued"}


@router.post("/intent")
async def enqueue_intent_webhook(
    payload: IntentWebhookPayload,
    authorization: str | None = Header(default=None),
    x_timestamp: str | None = Header(default=None, alias="X-Timestamp"),
    x_signature: str | None = Header(default=None, alias="X-Signature"),
    request: Request = None,  # type: ignore[assignment]
    settings: Settings = Depends(get_settings),
    task_queue: TaskQueue = Depends(get_task_queue),
) -> dict[str, str]:
    if request is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Missing request"
        )
    await _authorize_webhook(
        request=request,
        secret=settings.internal_ai_secret,
        authorization=authorization,
        x_timestamp=x_timestamp,
        x_signature=x_signature,
    )
    await task_queue.enqueue(IntentTask(intent_id=payload.intent_id, user_id=payload.user_id))
    return {"status": "queued"}
