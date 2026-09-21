"""Ollama provider — uses Ollama's OpenAI-compatible local API."""

from .openai_provider import OpenAIProvider


class OllamaProvider(OpenAIProvider):
    """Ollama local LLM provider — routes through Ollama's OpenAI-compatible API."""

    PROVIDER_NAME   = "ollama"
    DEFAULT_MODEL   = "llama3.2"
    DEFAULT_BASE_URL = "http://localhost:11434/v1"
    # Local models can be slow — 5 minutes per request avoids spurious timeouts
    DEFAULT_TIMEOUT = 300.0

    def __init__(self, api_key: str = "ollama", model: str = "", base_url: str = "", **kwargs):
        super().__init__(
            api_key=api_key or "ollama",
            model=model or self.DEFAULT_MODEL,
            base_url=base_url or self.DEFAULT_BASE_URL,
            **kwargs,
        )
