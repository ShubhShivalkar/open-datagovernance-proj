"""OpenAI provider."""

import json
import re
import openai
from ai.base import BaseAIProvider, TableDescription, RelationshipSuggestion


class OpenAIProvider(BaseAIProvider):
    PROVIDER_NAME = "openai"
    DEFAULT_MODEL   = "gpt-4o"
    DEFAULT_TIMEOUT = 60.0   # seconds; override in subclasses for slow local models

    def __init__(self, api_key: str, model: str = "", base_url: str = "", **kwargs):
        super().__init__(api_key, model or self.DEFAULT_MODEL, **kwargs)
        self._client = openai.OpenAI(
            api_key=api_key,
            timeout=self.DEFAULT_TIMEOUT,
            **({"base_url": base_url} if base_url else {}),
        )

    def generate_table_descriptions(
        self,
        table_name: str,
        schema_info: dict,
        context: str = "",
        sample_rows: list[dict] | None = None,
    ) -> TableDescription:
        prompt = self._build_prompt(table_name, schema_info, context, sample_rows)

        response = self._client.chat.completions.create(
            model=self.model,
            max_tokens=2048,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": "You are a data catalogue expert. Always respond with valid JSON.",
                },
                {"role": "user", "content": prompt},
            ],
        )

        raw = response.choices[0].message.content
        return self._parse_response(raw, table_name, schema_info)

    def infer_relationships(
        self,
        tables: list[dict],
        context: str = "",
    ) -> list[RelationshipSuggestion]:
        if not tables:
            return []

        # Build a compact schema summary for the prompt
        table_blocks = []
        for t in tables:
            col_lines = []
            for col in t.get("columns", []):
                flags = []
                if col.get("is_primary_key"):
                    flags.append("PK")
                if col.get("is_foreign_key"):
                    flags.append("FK — already detected, skip")
                flag_str = f" [{', '.join(flags)}]" if flags else ""
                desc = col.get("description", "").strip()
                desc_str = f": {desc}" if desc else ""
                col_lines.append(f"    {col['name']}{flag_str}{desc_str}")

            block = f"Table: {t['table_name']}"
            if t.get("description"):
                block += f"\n  Purpose: {t['description'].strip()}"
            block += "\n  Columns:\n" + "\n".join(col_lines)
            table_blocks.append(block)

        context_line = f"\nBusiness context: {context}\n" if context else ""
        schema_text = "\n\n".join(table_blocks)

        prompt = f"""You are a senior data architect. Given the database tables below, identify LOGICAL relationships that are NOT already covered by explicit FK constraints (those columns are marked "FK — already detected, skip" — do not include them).

{context_line}Focus on:
- Columns whose description implies a reference to another table's primary key
- Parent/child or lookup relationships revealed by the table descriptions
- Columns that reference other tables but do not follow the _id naming convention

{schema_text}

Return ONLY a JSON array. Each element must have:
  "from_table"  — the table that holds the referencing column (child/FK side)
  "from_column" — the column that stores the reference
  "to_table"    — the table being referenced (parent/PK side)
  "to_column"   — the column being referenced (usually the PK)
  "cardinality" — one of: many-to-one, one-to-many, one-to-one, many-to-many
  "label"       — short human-readable description (e.g. "placed by customer")
  "confidence"  — high, medium, or low

Only include relationships with confidence medium or high.
If no additional relationships exist beyond the FK constraints, return [].
Return ONLY the JSON array, no explanation."""

        try:
            response = self._client.chat.completions.create(
                model=self.model,
                max_tokens=1024,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a data architect. Respond with a valid JSON array only.",
                    },
                    {"role": "user", "content": prompt},
                ],
            )
            raw = response.choices[0].message.content or "[]"
        except Exception:
            return []

        cleaned = re.sub(r"^```json?\s*|\s*```$", "", raw.strip(), flags=re.MULTILINE)

        try:
            data = json.loads(cleaned)
            if not isinstance(data, list):
                return []
        except json.JSONDecodeError:
            return []

        valid_cards = {"many-to-one", "one-to-many", "one-to-one", "many-to-many"}
        results = []
        for item in data:
            if not isinstance(item, dict):
                continue
            if item.get("confidence", "medium") == "low":
                continue
            ft  = str(item.get("from_table",  "") or "").strip()
            fc  = str(item.get("from_column", "") or "").strip()
            tt  = str(item.get("to_table",   "") or "").strip()
            tc  = str(item.get("to_column",  "") or "").strip()
            if not (ft and fc and tt and tc):
                continue
            card = item.get("cardinality", "many-to-one")
            if card not in valid_cards:
                card = "many-to-one"
            results.append(RelationshipSuggestion(
                from_table=ft,
                from_column=fc,
                to_table=tt,
                to_column=tc,
                cardinality=card,
                label=str(item.get("label", "") or "").strip(),
                confidence=item.get("confidence", "medium"),
            ))

        return results
