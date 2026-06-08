from __future__ import annotations

import re
from urllib.parse import urlsplit, urlunsplit

_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")
_BEARER_RE = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b")
_LONG_TOKEN_RE = re.compile(r"\b[A-Za-z0-9._~+/=-]{48,}\b")

_SENSITIVE_KV_RE = re.compile(
    r"(?i)\b(token|access_token|refresh_token|code|signature|sig|key|api_key|apikey|jwt)\s*=\s*([^\s&]{6,})"
)


def strip_url_secrets(url: str) -> str:
    """
    Remove query+fragment from URLs to avoid leaking tokens to LLMs.
    """
    try:
        parts = urlsplit(url)
    except Exception:  # noqa: BLE001
        return url
    if not parts.scheme or not parts.netloc:
        return url
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def redact_text_for_llm(text: str) -> str:
    """
    Best-effort redaction for untrusted email/web text before sending to LLM providers.
    Keeps readability but strips common credential/token shapes.
    """
    if not text:
        return ""
    out = text
    out = _SENSITIVE_KV_RE.sub(lambda m: f"{m.group(1)}=<redacted>", out)
    out = _BEARER_RE.sub("Bearer <redacted>", out)
    out = _JWT_RE.sub("<redacted_jwt>", out)
    out = _LONG_TOKEN_RE.sub("<redacted_token>", out)
    return out
