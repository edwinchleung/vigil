from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    host: str = "127.0.0.1"
    port: int = 8000
    # Comma-separated origins, e.g. "http://localhost:3000"
    cors_origins: str = "http://localhost:3000"
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    groq_api_key: str | None = None
    # LLM provider abstraction (defaults keep existing behavior unless overridden).
    llm_provider: str = "groq"
    llm_model: str | None = None
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    # Compatibility aliases (optional)
    ollama_base_url: str | None = None
    openai_base_url: str | None = None
    openai_api_key: str | None = None
    internal_ai_secret: str | None = None
    queue_maxsize: int = 1000
    enable_worker: bool = True
    analysis_request_poll_interval_sec: float = 2.0
    analysis_request_batch_size: int = 25
    analysis_all_unanalyzed_limit: int = 200
    queue_backpressure_high_watermark: int = 800
    embedding_model_name: str = "all-MiniLM-L6-v2"
    intent_match_limit: int = 5
    groq_model: str = "llama-3.1-8b-instant"

    # Optional web grounding (disabled by default)
    web_grounding_enabled: bool = False
    tavily_api_key: str | None = None

    # Optional debug logging (off by default)
    rag_debug_logs: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]
