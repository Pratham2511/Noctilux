"""
Text2Schema Service — NL description → normalized database schema.

Research: arXiv 2503.23886 (Text2Schema, Oct 2025)
"Schema design demands domain expertise. Research on directly generating
schemas from natural language requirements remains unexplored."

Verbis implements this as a production VS Code feature — the first IDE
extension to support the complete database lifecycle:
create → query → optimize → explain.
"""

import json
from openai import AsyncOpenAI


def _get_client(provider: str, api_key: str) -> tuple:
    """Returns (AsyncOpenAI client, model_name). Defined locally — not imported."""
    if provider == "gemini":
        return (
            AsyncOpenAI(
                api_key=api_key,
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            ),
            "gemini-2.5-flash",
        )
    elif provider == "groq":
        return (
            AsyncOpenAI(
                api_key=api_key,
                base_url="https://api.groq.com/openai/v1",
            ),
            "llama-3.3-70b-versatile",
        )
    else:
        return (
            AsyncOpenAI(api_key="not-needed", base_url="http://localhost:11434/v1"),
            "sqlcoder:latest",
        )


SCHEMA_SYSTEM_PROMPT = """You are an expert database architect inside Verbis.
Convert natural language requirements into a production-ready relational schema.

Rules:
1. Extract all entities (nouns representing things to store).
2. Identify one-to-many and many-to-many relationships.
3. Use standard SQL types: INT, VARCHAR(N), TEXT, DECIMAL(p,s), BOOLEAN, TIMESTAMP, DATE.
4. Every table must have an id column as PRIMARY KEY (INT, auto-increment).
5. Add FOREIGN KEY columns for all relationships.
6. For many-to-many relationships, create a junction table.
7. Normalize to 3NF — no redundant columns.
8. Add NOT NULL where logically required.
9. Add created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP to every table.
10. Use snake_case for all names.

Return ONLY a JSON object — no markdown, no explanation:
{
  "tables": [
    {
      "name": "table_name",
      "description": "what this table stores",
      "columns": [
        {
          "name": "id",
          "type": "INT",
          "constraints": ["PRIMARY KEY", "AUTO_INCREMENT"],
          "foreign_key": null
        },
        {
          "name": "customer_id",
          "type": "INT",
          "constraints": ["NOT NULL"],
          "foreign_key": {"references_table": "customers", "references_column": "id"}
        }
      ],
      "indexes": ["customer_id", "created_at"]
    }
  ],
  "relationships": [
    {
      "from_table": "orders",
      "to_table": "customers",
      "type": "many_to_one",
      "description": "Each order belongs to one customer"
    }
  ]
}"""


async def generate_schema_from_nl(
    description: str,
    dialect: str = "postgresql",
    provider: str = "gemini",
    api_key: str = "",
) -> dict:
    """Convert NL description into structured schema JSON."""
    client, model = _get_client(provider, api_key)
    r = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SCHEMA_SYSTEM_PROMPT},
            {"role": "user", "content": f"Dialect: {dialect}\nRequirements:\n{description}\n\nSchema JSON:"},
        ],
        temperature=0.1,
        max_tokens=4096,
    )
    raw = r.choices[0].message.content.strip()
    raw = raw.replace("```json", "").replace("```", "").strip()
    return json.loads(raw)


def schema_to_ddl(schema: dict, dialect: str = "postgresql") -> str:
    """
    Convert structured schema JSON to executable DDL.

    CRITICAL: Foreign keys are emitted as TABLE-LEVEL CONSTRAINT clauses,
    NOT inline in the column definition. Inline FK syntax works in SQLite
    but FAILS in PostgreSQL and MySQL. This is portable across all dialects.
    """
    statements = []

    auto_inc_type = {
        "postgresql": "SERIAL",
        "mysql": "INT AUTO_INCREMENT",
        "sqlite": "INTEGER",
    }.get(dialect, "SERIAL")

    for table in schema.get("tables", []):
        cols = []
        fk_clauses = []

        for col in table.get("columns", []):
            constraints = col.get("constraints", [])
            col_type = col["type"]

            if "AUTO_INCREMENT" in constraints and "PRIMARY KEY" in constraints:
                col_type = auto_inc_type
                constraints = [c for c in constraints if c != "AUTO_INCREMENT"]

            col_def = f"  {col['name']} {col_type}"
            if "PRIMARY KEY" in constraints:
                col_def += " PRIMARY KEY"
            if "NOT NULL" in constraints and "PRIMARY KEY" not in constraints:
                col_def += " NOT NULL"
            if "UNIQUE" in constraints:
                col_def += " UNIQUE"
            if col["name"] == "created_at":
                col_def += " DEFAULT CURRENT_TIMESTAMP"
            cols.append(col_def)

            fk = col.get("foreign_key")
            if fk:
                fk_clauses.append(
                    f"  CONSTRAINT fk_{table['name']}_{col['name']} "
                    f"FOREIGN KEY ({col['name']}) "
                    f"REFERENCES {fk['references_table']}({fk['references_column']})"
                )

        all_cols = cols + fk_clauses
        table_comment = f"-- {table.get('description', table['name'])}"
        ddl = f"{table_comment}\nCREATE TABLE IF NOT EXISTS {table['name']} (\n" + ",\n".join(all_cols) + "\n);"
        statements.append(ddl)

        for idx_col in table.get("indexes", []):
            statements.append(
                f"CREATE INDEX IF NOT EXISTS idx_{table['name']}_{idx_col} "
                f"ON {table['name']}({idx_col});"
            )

    return "\n\n".join(statements)


def schema_to_mermaid(schema: dict) -> str:
    """Convert schema JSON to Mermaid ER diagram source for live rendering."""
    lines = ["erDiagram"]
    for table in schema.get("tables", []):
        lines.append(f"  {table['name'].upper()} {{")
        for col in table.get("columns", []):
            cs = col.get("constraints", [])
            marker = "PK" if "PRIMARY KEY" in cs else ("FK" if col.get("foreign_key") else "")
            lines.append(f"    {col['type']} {col['name']}{' ' + marker if marker else ''}")
        lines.append("  }")
    for rel in schema.get("relationships", []):
        rel_map = {
            "one_to_many": "||--o{",
            "many_to_one": "}o--||",
            "many_to_many": "}o--o{",
            "one_to_one": "||--||",
        }
        sym = rel_map.get(rel["type"], "||--o{")
        desc = rel.get("description", rel["type"])[:30]
        lines.append(f'  {rel["from_table"].upper()} {sym} {rel["to_table"].upper()} : "{desc}"')
    return "\n".join(lines)


def count_tables(ddl: str) -> int:
    """Count CREATE TABLE statements in generated DDL."""
    return sum(1 for line in ddl.split('\n') if 'CREATE TABLE' in line.upper())


async def refine_schema(
    existing_schema: dict,
    refinement: str,
    dialect: str = "postgresql",
    provider: str = "gemini",
    api_key: str = "",
) -> dict:
    """Apply a NL refinement request to an existing schema. Returns the COMPLETE updated schema."""
    client, model = _get_client(provider, api_key)
    r = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SCHEMA_SYSTEM_PROMPT},
            {"role": "user", "content": (
                f"Existing schema:\n{json.dumps(existing_schema, indent=2)}\n\n"
                f"Refinement: {refinement}\n\n"
                f"Return the COMPLETE updated schema JSON including all existing tables:"
            )},
        ],
        temperature=0.1,
        max_tokens=4096,
    )
    raw = r.choices[0].message.content.strip()
    raw = raw.replace("```json", "").replace("```", "").strip()
    return json.loads(raw)
