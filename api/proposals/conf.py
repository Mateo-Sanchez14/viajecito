"""Settings of the proposals app, read lazily with defaults (the orchestrator adds the env parsing
to ``config/settings`` at integration)."""

from django.conf import settings


def public_origin() -> str:
    return str(getattr(settings, "PUBLIC_ORIGIN", "http://localhost:3000")).rstrip("/")


def llm_classifier_enabled() -> bool:
    return bool(getattr(settings, "PROPOSALS_LLM_CLASSIFIER_ENABLED", False))


def llm_base_url() -> str:
    return str(getattr(settings, "PROPOSALS_LLM_BASE_URL", ""))


def llm_api_key() -> str:
    return str(getattr(settings, "PROPOSALS_LLM_API_KEY", ""))


def llm_model() -> str:
    return str(getattr(settings, "PROPOSALS_LLM_MODEL", ""))
