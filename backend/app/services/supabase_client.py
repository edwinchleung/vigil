from supabase import Client, create_client

from app.config import Settings

_client: Client | None = None


def get_supabase_client(settings: Settings) -> Client:
    global _client
    if _client is not None:
        return _client
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    _client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _client
