from __future__ import annotations

import base64
import re
from email import policy
from email.parser import BytesParser
from html.parser import HTMLParser
from typing import Any


class _HTMLTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._chunks: list[str] = []

    def handle_data(self, data: str) -> None:  # noqa: D401
        if data:
            self._chunks.append(data)

    def get_text(self) -> str:
        return " ".join(self._chunks)


def _strip_html(html: str) -> str:
    parser = _HTMLTextExtractor()
    parser.feed(html)
    return parser.get_text()


def decode_base64url(data: str) -> bytes:
    s = (data or "").strip()
    if not s:
        return b""
    # Gmail uses base64url without padding.
    pad = "=" * ((4 - (len(s) % 4)) % 4)
    return base64.urlsafe_b64decode(s + pad)


def _iter_gmail_parts(payload: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    stack = [payload]
    while stack:
        part = stack.pop()
        if isinstance(part, dict):
            out.append(part)
            parts = part.get("parts")
            if isinstance(parts, list):
                for child in reversed(parts):
                    if isinstance(child, dict):
                        stack.append(child)
    return out


def _extract_gmail_body_text(provider_raw: dict[str, Any]) -> str:
    payload = provider_raw.get("payload")
    if not isinstance(payload, dict):
        return ""

    parts = _iter_gmail_parts(payload)
    text_plain: list[str] = []
    text_html: list[str] = []

    for part in parts:
        mime = (part.get("mimeType") or "").lower()
        body = part.get("body")
        if not isinstance(body, dict):
            continue
        data = body.get("data")
        if not isinstance(data, str) or not data.strip():
            continue
        decoded = decode_base64url(data)
        try:
            s = decoded.decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            continue
        if mime == "text/plain":
            text_plain.append(s)
        elif mime == "text/html":
            text_html.append(_strip_html(s))

    if text_plain:
        return "\n".join(t.strip() for t in text_plain if t.strip())
    if text_html:
        return "\n".join(t.strip() for t in text_html if t.strip())

    # Fallback: decode RFC822 from `raw` if present.
    raw_rfc822 = provider_raw.get("raw")
    if isinstance(raw_rfc822, str) and raw_rfc822.strip():
        return _extract_rfc822_body_text(raw_rfc822)
    return ""


def _extract_gmail_body_text_with_source(provider_raw: dict[str, Any]) -> tuple[str, str]:
    payload = provider_raw.get("payload")
    if not isinstance(payload, dict):
        return "", "none"

    parts = _iter_gmail_parts(payload)
    text_plain: list[str] = []
    text_html: list[str] = []

    for part in parts:
        mime = (part.get("mimeType") or "").lower()
        body = part.get("body")
        if not isinstance(body, dict):
            continue
        data = body.get("data")
        if not isinstance(data, str) or not data.strip():
            continue
        decoded = decode_base64url(data)
        try:
            s = decoded.decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            continue
        if mime == "text/plain":
            text_plain.append(s)
        elif mime == "text/html":
            text_html.append(_strip_html(s))

    if text_plain:
        return "\n".join(t.strip() for t in text_plain if t.strip()), "mime:text/plain"
    if text_html:
        return "\n".join(t.strip() for t in text_html if t.strip()), "mime:text/html"

    raw_rfc822 = provider_raw.get("raw")
    if isinstance(raw_rfc822, str) and raw_rfc822.strip():
        return _extract_rfc822_body_text(raw_rfc822), "rfc822:raw"
    return "", "none"


def _extract_graph_body_text(provider_raw: dict[str, Any]) -> str:
    body = provider_raw.get("body")
    if isinstance(body, dict):
        content = body.get("content")
        content_type = (body.get("contentType") or "").lower()
        if isinstance(content, str) and content.strip():
            if content_type == "html":
                return _strip_html(content)
            return content
    return ""


def _extract_graph_body_text_with_source(provider_raw: dict[str, Any]) -> tuple[str, str]:
    body = provider_raw.get("body")
    if isinstance(body, dict):
        content = body.get("content")
        content_type = (body.get("contentType") or "").lower()
        if isinstance(content, str) and content.strip():
            if content_type == "html":
                return _strip_html(content), "body:html"
            if content_type:
                return content, f"body:{content_type}"
            return content, "body:text"
    return "", "none"


def _extract_rfc822_body_text(raw_base64url: str) -> str:
    try:
        msg_bytes = decode_base64url(raw_base64url)
        message = BytesParser(policy=policy.default).parsebytes(msg_bytes)
    except Exception:  # noqa: BLE001
        return ""

    text_plain: list[str] = []
    text_html: list[str] = []
    for part in message.walk():
        if part.is_multipart():
            continue
        ctype = (part.get_content_type() or "").lower()
        try:
            payload = part.get_content()
        except Exception:  # noqa: BLE001
            payload = None
        if not isinstance(payload, str):
            continue
        if ctype == "text/plain":
            text_plain.append(payload)
        elif ctype == "text/html":
            text_html.append(_strip_html(payload))

    if text_plain:
        return "\n".join(t.strip() for t in text_plain if t.strip())
    if text_html:
        return "\n".join(t.strip() for t in text_html if t.strip())
    return ""


def extract_email_body_text(email_row: dict[str, Any]) -> str:
    """
    Extracts best-effort human-readable body text from `Email.raw` provider payloads.
    Supports:
    - Gmail: `raw` (RFC822 base64url) and/or `payload.parts[].body.data` (base64url)
    - Microsoft Graph: `body.content`
    """
    provider_raw = email_row.get("raw")
    if not isinstance(provider_raw, dict):
        return ""
    provider = (email_row.get("provider") or "").strip().lower()
    if provider == "google":
        return _extract_gmail_body_text(provider_raw)
    if provider == "microsoft-entra-id":
        return _extract_graph_body_text(provider_raw)

    # Unknown provider: try common Graph-like shape, then Gmail raw RFC822.
    graphish = _extract_graph_body_text(provider_raw)
    if graphish:
        return graphish
    raw_rfc822 = provider_raw.get("raw")
    if isinstance(raw_rfc822, str) and raw_rfc822.strip():
        return _extract_rfc822_body_text(raw_rfc822)
    return ""


def extract_email_body_text_with_meta(email_row: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    provider_raw = email_row.get("raw")
    if not isinstance(provider_raw, dict):
        return "", {"source": "none", "provider": (email_row.get("provider") or "")}

    provider = (email_row.get("provider") or "").strip().lower()
    if provider == "google":
        text, source = _extract_gmail_body_text_with_source(provider_raw)
        return text, {"provider": provider, "source": source, "body_len": len(text)}
    if provider == "microsoft-entra-id":
        text, source = _extract_graph_body_text_with_source(provider_raw)
        return text, {"provider": provider, "source": source, "body_len": len(text)}

    text, source = _extract_graph_body_text_with_source(provider_raw)
    if text:
        return text, {"provider": provider, "source": source, "body_len": len(text)}
    raw_rfc822 = provider_raw.get("raw")
    if isinstance(raw_rfc822, str) and raw_rfc822.strip():
        text = _extract_rfc822_body_text(raw_rfc822)
        return text, {"provider": provider, "source": "rfc822:raw", "body_len": len(text)}
    return "", {"provider": provider, "source": "none", "body_len": 0}


_URL_RE = re.compile(r"https?://[^\s<>()\"\']+", re.IGNORECASE)


def extract_links(text: str, *, limit: int = 8) -> list[str]:
    if not text:
        return []
    links: list[str] = []
    for m in _URL_RE.finditer(text):
        url = m.group(0).rstrip(".,;:!?)\"]'")
        if url and url not in links:
            links.append(url)
        if len(links) >= limit:
            break
    return links


def compact_text(text: str, *, max_chars: int) -> str:
    if not text:
        return ""
    normalized = "\n".join(line.rstrip() for line in text.splitlines())
    normalized = re.sub(r"\n{3,}", "\n\n", normalized).strip()
    if len(normalized) <= max_chars:
        return normalized
    return normalized[: max_chars - 1].rstrip() + "…"
