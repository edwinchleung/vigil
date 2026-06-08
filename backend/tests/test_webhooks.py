from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_webhook_requires_authorization_header() -> None:
    app = create_app(Settings(internal_ai_secret="secret", enable_worker=False))
    with TestClient(app) as client:
        response = client.post(
            "/api/webhooks/email",
            json={"email_id": "email-1", "user_id": "user-1"},
        )
    assert response.status_code == 401


def _sign(secret: str, ts: str, body: bytes) -> str:
    import hmac
    from hashlib import sha256

    return hmac.new(secret.encode("utf-8"), ts.encode("utf-8") + b"." + body, sha256).hexdigest()


def test_webhook_enqueues_and_returns_quick_ack() -> None:
    app = create_app(Settings(internal_ai_secret="secret", enable_worker=False))
    with TestClient(app) as client:
        # Backwards-compatible bearer auth.
        response = client.post(
            "/api/webhooks/email",
            json={"email_id": "email-1", "user_id": "user-1"},
            headers={"Authorization": "Bearer secret"},
        )
        assert response.status_code == 200
        assert response.json() == {"status": "queued"}
        assert app.state.task_queue.qsize() == 1


def test_intent_webhook_enqueues_and_returns_quick_ack() -> None:
    app = create_app(Settings(internal_ai_secret="secret", enable_worker=False))
    with TestClient(app) as client:
        # Backwards-compatible bearer auth.
        response = client.post(
            "/api/webhooks/intent",
            json={"intent_id": "intent-1", "user_id": "user-1"},
            headers={"Authorization": "Bearer secret"},
        )
        assert response.status_code == 200
        assert response.json() == {"status": "queued"}
        assert app.state.task_queue.qsize() == 1


def test_signed_webhook_enqueues() -> None:
    app = create_app(Settings(internal_ai_secret="secret", enable_worker=False))
    with TestClient(app) as client:
        body = b'{"email_id":"email-1","user_id":"user-1"}'
        import time

        ts = str(int(time.time()))
        sig = _sign("secret", ts, body)
        response = client.post(
            "/api/webhooks/email",
            content=body,
            headers={"X-Timestamp": ts, "X-Signature": sig, "Content-Type": "application/json"},
        )
        assert response.status_code == 200
        assert response.json() == {"status": "queued"}
        assert app.state.task_queue.qsize() == 1
