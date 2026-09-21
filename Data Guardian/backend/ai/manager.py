"""
AI Manager — resolves provider from settings and orchestrates catalogue generation.
"""

from __future__ import annotations

import os
from django.conf import settings
from .base import BaseAIProvider, TableDescription
from .providers import AnthropicProvider, OpenAIProvider, OllamaProvider

_PROVIDER_REGISTRY: dict = {}
if AnthropicProvider is not None:
    _PROVIDER_REGISTRY["anthropic"] = AnthropicProvider
if OpenAIProvider is not None:
    _PROVIDER_REGISTRY["openai"] = OpenAIProvider
if OllamaProvider is not None:
    _PROVIDER_REGISTRY["ollama"] = OllamaProvider


def get_ai_provider(
    provider_name: str | None = None,
    api_key: str | None = None,
    model: str | None = None,
) -> BaseAIProvider:
    """
    Instantiate an AI provider.

    Resolution order:
      1. Explicit arguments
      2. Environment variables: AI_PROVIDER, AI_API_KEY, AI_MODEL
    """
    provider_name = provider_name or os.getenv("AI_PROVIDER", "ollama")
    api_key = api_key or os.getenv("AI_API_KEY", "")
    model = model or os.getenv("AI_MODEL", "")
    base_url = os.getenv("AI_BASE_URL", "")

    cls = _PROVIDER_REGISTRY.get(provider_name.lower())
    if cls is None:
        raise ValueError(
            f"Unknown AI provider '{provider_name}'. "
            f"Supported: {', '.join(_PROVIDER_REGISTRY)}"
        )

    return cls(api_key=api_key, model=model, base_url=base_url)


def generate_catalogue_for_schema(
    schema: dict,
    context: str = "",
    provider: BaseAIProvider | None = None,
) -> dict[str, TableDescription]:
    """
    Generate AI descriptions for every table in a connector schema dict.

    Args:
        schema: Output of connector.get_schema()
        context: Optional business context string passed to the AI
        provider: Optional pre-built provider (uses get_ai_provider() if None)

    Returns:
        dict mapping table_key → TableDescription
    """
    if provider is None:
        provider = get_ai_provider()

    results: dict[str, TableDescription] = {}
    for table_name, table_info in schema.items():
        results[table_name] = provider.generate_table_descriptions(
            table_name=table_name,
            schema_info=table_info,
            context=context,
        )

    return results
