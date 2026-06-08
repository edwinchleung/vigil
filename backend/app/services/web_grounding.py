from __future__ import annotations

import json
import re
from typing import Any

import httpx


def _safe_query_from_email_text(email_text: str) -> str | None:
    """
    Extract a minimal, privacy-aware query string.
    We avoid copying the full email body into a web query.
    """
    if not email_text:
        return None
    # Prefer sender domain if present.
    m = re.search(r"From:\s*(.+)", email_text)
    from_line = (m.group(1).strip() if m else "")[:200]
    domain = None
    dm = re.search(r"@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})", from_line)
    if dm:
        domain = dm.group(1).lower()

    sm = re.search(r"Subject:\s*(.+)", email_text)
    subject = (sm.group(1).strip() if sm else "")[:140]

    bits = [b for b in [domain, subject] if b]
    if not bits:
        return None
    q = " ".join(bits)
    q = re.sub(r"\s+", " ", q).strip()
    return q if len(q) >= 6 else None


def fetch_tavily_snippets(
    *, api_key: str, query: str, max_results: int = 4
) -> list[dict[str, Any]]:
    url = "https://api.tavily.com/search"
    payload = {
        "api_key": api_key,
        "query": query,
        "max_results": max_results,
        "search_depth": "basic",
        "include_answer": False,
        "include_raw_content": False,
    }
    max_bytes = 1_000_000
    body: bytes = b""
    with httpx.Client(timeout=15.0) as client:
        with client.stream("POST", url, json=payload) as resp:
            resp.raise_for_status()
            for chunk in resp.iter_bytes():
                if not chunk:
                    continue
                body += chunk
                if len(body) > max_bytes:
                    raise RuntimeError("Tavily response too large")
    try:
        data = json.loads(body.decode("utf-8"))
    except Exception:  # noqa: BLE001
        return []

    results = data.get("results") if isinstance(data, dict) else None
    if not isinstance(results, list):
        return []
    out: list[dict[str, Any]] = []
    for r in results[:max_results]:
        if not isinstance(r, dict):
            continue
        title = r.get("title")
        url = r.get("url")
        content = r.get("content") or r.get("snippet")
        if not isinstance(title, str) or not isinstance(url, str) or not isinstance(content, str):
            continue
        out.append({"title": title[:140], "url": url[:300], "snippet": content[:400]})
    return out


def build_web_context_block(email_text: str, *, tavily_api_key: str | None) -> str:
    if not tavily_api_key:
        return ""
    query = _safe_query_from_email_text(email_text)
    if not query:
        return ""
    try:
        snippets = fetch_tavily_snippets(api_key=tavily_api_key, query=query, max_results=4)
    except Exception:  # noqa: BLE001
        return ""
    if not snippets:
        return ""
    lines = ["Web context (snippets):"]
    for s in snippets:
        lines.append(f"- {s['title']} ({s['url']}) — {s['snippet']}")
    return "\n".join(lines)


def build_web_context_block_with_meta(
    email_text: str, *, tavily_api_key: str | None
) -> tuple[str, dict[str, Any]]:
    if not tavily_api_key:
        return "", {"enabled": False, "reason": "missing_api_key"}
    query = _safe_query_from_email_text(email_text)
    if not query:
        return "", {"enabled": True, "reason": "no_query"}
    try:
        snippets = fetch_tavily_snippets(api_key=tavily_api_key, query=query, max_results=4)
    except Exception as exc:  # noqa: BLE001
        return "", {"enabled": True, "query": query, "error": str(exc)}
    if not snippets:
        return "", {"enabled": True, "query": query, "snippets_count": 0}
    lines = ["Web context (snippets):"]
    for s in snippets:
        lines.append(f"- {s['title']} ({s['url']}) — {s['snippet']}")
    return "\n".join(lines), {"enabled": True, "query": query, "snippets_count": len(snippets)}
