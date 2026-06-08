from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from app.config import Settings
from app.services.llm.base import LLMClassifier
from app.services.llm.providers.groq import GroqClassifier
from app.services.llm.providers.ollama import OllamaClassifier
from app.services.llm.providers.openai_compatible import OpenAICompatibleClassifier


@dataclass(frozen=True)
class LLMProviderConfig:
    provider: str
    model: str
    base_url: str | None
    api_key: str | None


ProviderFactory = Callable[[Settings, LLMProviderConfig], LLMClassifier]


def _default_provider_config(settings: Settings) -> LLMProviderConfig:
    provider = (getattr(settings, "llm_provider", None) or "groq").strip().lower()
    model = (getattr(settings, "llm_model", None) or "").strip()
    base_url = (getattr(settings, "llm_base_url", None) or "").strip() or None
    api_key = (getattr(settings, "llm_api_key", None) or "").strip() or None

    # Convenience aliases (keep compatibility with common env names)
    if provider == "ollama":
        base_url = base_url or (getattr(settings, "ollama_base_url", None) or "").strip() or None
        model = model or "gemma2:2b"
    elif provider in {"openai_compatible", "openai"}:
        base_url = base_url or (getattr(settings, "openai_base_url", None) or "").strip() or None
        api_key = api_key or (getattr(settings, "openai_api_key", None) or "").strip() or None
    elif provider == "groq":
        model = model or settings.groq_model
        api_key = api_key or settings.groq_api_key

    return LLMProviderConfig(provider=provider, model=model, base_url=base_url, api_key=api_key)


def _build_groq(settings: Settings, cfg: LLMProviderConfig) -> LLMClassifier:
    if not cfg.api_key:
        raise RuntimeError("GROQ_API_KEY (or LLM_API_KEY) is required when LLM_PROVIDER=groq")
    return GroqClassifier(api_key=cfg.api_key, model=cfg.model or settings.groq_model)


def _build_ollama(_settings: Settings, cfg: LLMProviderConfig) -> LLMClassifier:
    base_url = cfg.base_url or "http://localhost:11434"
    return OllamaClassifier(base_url=base_url, model=cfg.model)


def _build_openai_compatible(_settings: Settings, cfg: LLMProviderConfig) -> LLMClassifier:
    if not cfg.base_url:
        raise RuntimeError(
            "LLM_BASE_URL (or OPENAI_BASE_URL) is required when LLM_PROVIDER=openai_compatible"
        )
    if not cfg.api_key:
        raise RuntimeError(
            "LLM_API_KEY (or OPENAI_API_KEY) is required when LLM_PROVIDER=openai_compatible"
        )
    if not cfg.model:
        raise RuntimeError("LLM_MODEL is required when LLM_PROVIDER=openai_compatible")
    return OpenAICompatibleClassifier(base_url=cfg.base_url, api_key=cfg.api_key, model=cfg.model)


_REGISTRY: dict[str, ProviderFactory] = {
    "groq": _build_groq,
    "ollama": _build_ollama,
    "openai_compatible": _build_openai_compatible,
}


def get_llm_classifier(settings: Settings) -> LLMClassifier:
    cfg = _default_provider_config(settings)
    factory = _REGISTRY.get(cfg.provider)
    if factory is None:
        supported = ", ".join(sorted(_REGISTRY.keys()))
        raise RuntimeError(f"Unsupported LLM_PROVIDER={cfg.provider!r}. Supported: {supported}")
    return factory(settings, cfg)
