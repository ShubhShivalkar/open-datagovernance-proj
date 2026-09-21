"""
Abstract base class for all AI provider implementations.

Each provider receives a structured schema (as produced by connectors)
and returns enriched catalogue metadata for tables and columns.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class RelationshipSuggestion:
    from_table:  str
    from_column: str
    to_table:    str
    to_column:   str
    cardinality: str = "many-to-one"
    label:       str = ""
    confidence:  str = "medium"   # "high" | "medium" | "low"


@dataclass
class ColumnDescription:
    name: str
    description: str
    business_name: str = ""        # Human-friendly display name
    data_category: str = ""        # e.g. "identifier", "timestamp", "metric", "dimension"
    pii_likelihood: str = "none"   # "none" | "low" | "medium" | "high"
    sample_values: list = field(default_factory=list)


@dataclass
class TableDescription:
    name: str
    description: str
    business_purpose: str = ""     # What business question this table answers
    domain: str = ""               # e.g. "finance", "marketing", "operations"
    columns: list[ColumnDescription] = field(default_factory=list)


class BaseAIProvider(ABC):
    """Abstract base for LLM providers used in catalogue generation."""

    PROVIDER_NAME: str = ""

    def __init__(self, api_key: str, model: str = "", **kwargs):
        self.api_key = api_key
        self.model = model
        self.extra_config = kwargs

    @abstractmethod
    def generate_table_descriptions(
        self,
        table_name: str,
        schema_info: dict,
        context: str = "",
        sample_rows: list[dict] | None = None,
    ) -> TableDescription:
        """
        Generate a full TableDescription (including per-column metadata)
        for a single table.

        Args:
            table_name: The table identifier (may include schema prefix).
            schema_info: The connector's dict for this table:
                {
                  "schema": str,
                  "columns": [{"name", "data_type", "nullable", ...}],
                  "row_count_estimate": int | None,
                }
            context: Optional additional context about the database or business domain.
            sample_rows: Optional list of row dicts from get_sample_data(). When
                         provided, actual values are embedded in the prompt so the
                         model can infer enums, PII patterns, date formats, etc.

        Returns:
            A populated TableDescription.
        """

    def infer_relationships(
        self,
        tables: list[dict],
        context: str = "",
    ) -> list[RelationshipSuggestion]:
        """
        Infer table relationships from AI-generated descriptions.

        Args:
            tables: List of dicts:
                {table_name, description, columns: [{name, description,
                 is_primary_key, is_foreign_key, data_category}]}
            context: Optional business context string.

        Returns:
            List of RelationshipSuggestion (medium/high confidence only).
            Default: returns [] — override in concrete providers.
        """
        return []

    # ------------------------------------------------------------------
    # Shared prompt helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_prompt(
        table_name: str,
        schema_info: dict,
        context: str,
        sample_rows: list[dict] | None = None,
    ) -> str:
        import json as _json

        col_lines = []
        for col in schema_info.get("columns", []):
            flags = []
            if col.get("is_primary_key"):
                flags.append("PRIMARY KEY")
            if col.get("is_foreign_key"):
                ref = col.get("foreign_key_references", {})
                flags.append(f"FK → {ref.get('table', '?')}.{ref.get('column', '?')}")
            if not col.get("nullable"):
                flags.append("NOT NULL")
            flag_str = f"  [{', '.join(flags)}]" if flags else ""
            comment = f"  -- {col['comment']}" if col.get("comment") else ""
            col_lines.append(
                f"  {col['name']} ({col['data_type']}){flag_str}{comment}"
            )

        row_count = schema_info.get("row_count_estimate")
        row_hint = f"\nApproximate row count: {row_count:,}" if row_count else ""

        context_block = f"\nBusiness context: {context}" if context else ""

        # Embed sample rows when available (local LLM — data stays on-premise)
        sample_block = ""
        if sample_rows:
            safe_rows = [
                {k: (str(v)[:80] if v is not None else None) for k, v in row.items()}
                for row in sample_rows
            ]
            sample_block = (
                "\n\nSample data (first few rows — use to infer meaning, not to store):\n"
                + _json.dumps(safe_rows, default=str, indent=2)
            )

        prompt = f"""You are a senior data analyst building a data catalogue for an enterprise analytics platform.

Analyse the following database table and produce clear, accurate documentation.{context_block}

Table: {table_name}{row_hint}
Columns:
{chr(10).join(col_lines)}{sample_block}

Return a JSON object with this exact structure:
{{
  "description": "<2-3 sentence plain-English description of what this table stores and its role>",
  "business_purpose": "<one sentence: what business question or process this table supports>",
  "domain": "<single word business domain, e.g. finance, marketing, operations, hr, product>",
  "columns": [
    {{
      "name": "<column name — must match exactly>",
      "description": "<clear description of what this column stores>",
      "business_name": "<human-friendly display name>",
      "data_category": "<one of: identifier, timestamp, metric, dimension, flag, text, json, other>",
      "pii_likelihood": "<one of: none, low, medium, high>"
    }}
  ]
}}

Rules:
- Every column in the input must appear in the output columns array, in the same order.
- Be concise but precise. Avoid filler phrases like "This column stores...".
- Infer meaning from column names, data types, and relationships — do not hallucinate specific business logic.
- pii_likelihood=high for: email, ssn, phone, passport, credit card, full name, address fields.
- pii_likelihood=medium for: username, ip_address, device_id, birth_date.
- Return ONLY the JSON object, no markdown fences."""

        return prompt

    @staticmethod
    def _parse_response(raw_json: str, table_name: str, schema_info: dict) -> TableDescription:
        import json, re

        # Strip potential markdown fences
        cleaned = re.sub(r"^```json?\s*|\s*```$", "", raw_json.strip(), flags=re.MULTILINE)

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError:
            # Fallback: return empty descriptions rather than crashing
            return TableDescription(
                name=table_name,
                description="[AI generation failed — please edit manually]",
                columns=[
                    ColumnDescription(name=col["name"], description="")
                    for col in schema_info.get("columns", [])
                ],
            )

        col_map = {c["name"]: c for c in data.get("columns", [])}
        columns = []
        for col in schema_info.get("columns", []):
            ai_col = col_map.get(col["name"], {})
            columns.append(
                ColumnDescription(
                    name=col["name"],
                    description=ai_col.get("description", ""),
                    business_name=ai_col.get("business_name", ""),
                    data_category=ai_col.get("data_category", "other"),
                    pii_likelihood=ai_col.get("pii_likelihood", "none"),
                )
            )

        return TableDescription(
            name=table_name,
            description=data.get("description", ""),
            business_purpose=data.get("business_purpose", ""),
            domain=data.get("domain", ""),
            columns=columns,
        )
