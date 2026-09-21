"""Anthropic Claude provider."""

import anthropic
from ai.base import BaseAIProvider, TableDescription


class AnthropicProvider(BaseAIProvider):
    PROVIDER_NAME = "anthropic"
    DEFAULT_MODEL = "claude-sonnet-4-6"

    def __init__(self, api_key: str, model: str = "", **kwargs):
        super().__init__(api_key, model or self.DEFAULT_MODEL, **kwargs)
        self._client = anthropic.Anthropic(api_key=api_key)

    def generate_table_descriptions(
        self,
        table_name: str,
        schema_info: dict,
        context: str = "",
        sample_rows: list[dict] | None = None,
    ) -> TableDescription:
        prompt = self._build_prompt(table_name, schema_info, context, sample_rows)

        message = self._client.messages.create(
            model=self.model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = message.content[0].text
        return self._parse_response(raw, table_name, schema_info)
