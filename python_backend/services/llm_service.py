"""
LLM Service — Gemini 2.5 Flash (primary) + Groq fallback + Ollama local mode.
The API key is passed per-request from the VS Code extension (SecretStorage).
No API key is stored in any server-side file or environment variable.
"""

from openai import AsyncOpenAI
from typing import Optional


def _get_client(provider: str, api_key: str) -> tuple[AsyncOpenAI, str]:
    """Return (client, model_name) for the given provider."""
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
    else:  # local / ollama
        return (
            AsyncOpenAI(
                api_key="not-needed",
                base_url="http://localhost:11434/v1",
            ),
            "sqlcoder:latest",
        )


SQL_SYSTEM_PROMPT = """You are Noctilux, an expert database assistant.
Convert natural language questions into precise, optimized SQL queries.
Rules:
1. Use ONLY tables and columns present in the provided schema.
2. Always add a LIMIT clause unless the user explicitly asks for all rows.
3. Add brief SQL comments explaining complex joins or subqueries.
4. If the question is ambiguous, output a clarifying question instead of guessing.
5. Return ONLY the SQL query. No markdown fences. No explanation unless asked."""


async def generate_sql(
    nl_query: str,
    schema_context: str,
    dialect: str = "postgresql",
    provider: str = "gemini",
    api_key: str = "",
) -> str:
    client, model = _get_client(provider, api_key)
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SQL_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Dialect: {dialect}\n\n"
                    f"Schema:\n{schema_context}\n\n"
                    f"Question: {nl_query}\n\n"
                    f"SQL:"
                ),
            },
        ],
        temperature=0.1,
        max_tokens=2048,
    )
    return response.choices[0].message.content.strip()


async def generate_nosql(
    nl_query: str,
    schema_context: str,
    provider: str = "gemini",
    api_key: str = "",
) -> str:
    client, model = _get_client(provider, api_key)
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "Convert natural language into a MongoDB query or aggregation pipeline. "
                    "Return only valid JSON. No markdown."
                ),
            },
            {
                "role": "user",
                "content": f"Schema:\n{schema_context}\n\nQuestion: {nl_query}\n\nQuery:",
            },
        ],
        temperature=0.1,
        max_tokens=2048,
    )
    return response.choices[0].message.content.strip()


async def explain_plan(
    sql: str,
    execution_plan: str,
    provider: str = "gemini",
    api_key: str = "",
) -> str:
    client, model = _get_client(provider, api_key)
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "Translate this database execution plan into plain English. "
                    "Identify the most expensive step and suggest one concrete improvement."
                ),
            },
            {
                "role": "user",
                "content": f"SQL:\n{sql}\n\nExecution Plan:\n{execution_plan}",
            },
        ],
        temperature=0.2,
        max_tokens=1024,
    )
    return response.choices[0].message.content.strip()


async def generate_narrative(
    results_summary: str,
    user_query: str,
    provider: str = "gemini",
    api_key: str = "",
) -> str:
    client, model = _get_client(provider, api_key)
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a data analyst. Summarize query results into a clear narrative. "
                    "Identify top 3 findings, trends, anomalies, and one actionable recommendation."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"User question: {user_query}\n\n"
                    f"Results summary:\n{results_summary}\n\n"
                    f"Narrative:"
                ),
            },
        ],
        temperature=0.4,
        max_tokens=1024,
    )
    return response.choices[0].message.content.strip()
