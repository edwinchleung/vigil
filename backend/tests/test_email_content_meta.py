from __future__ import annotations

import base64

from app.services.email_content import extract_email_body_text_with_meta


def _b64url(s: str) -> str:
    return base64.urlsafe_b64encode(s.encode("utf-8")).decode("ascii").rstrip("=")


def test_gmail_prefers_text_plain_parts() -> None:
    email_row = {
        "provider": "google",
        "raw": {
            "payload": {
                "mimeType": "multipart/alternative",
                "parts": [
                    {"mimeType": "text/plain", "body": {"data": _b64url("hello plain")}},
                    {"mimeType": "text/html", "body": {"data": _b64url("<b>hello</b>")}},
                ],
            }
        },
    }
    text, meta = extract_email_body_text_with_meta(email_row)
    assert "hello plain" in text
    assert meta["source"] == "mime:text/plain"


def test_gmail_falls_back_to_html_when_no_plain() -> None:
    email_row = {
        "provider": "google",
        "raw": {
            "payload": {
                "mimeType": "text/html",
                "parts": [
                    {"mimeType": "text/html", "body": {"data": _b64url("<div>hi</div>")}},
                ],
            }
        },
    }
    text, meta = extract_email_body_text_with_meta(email_row)
    assert "hi" in text
    assert meta["source"] == "mime:text/html"
