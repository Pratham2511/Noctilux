"""
LLM Service — Gemini 2.5 Flash (primary) + Groq + Ollama local mode.
API key is passed per-request from VS Code SecretStorage. Nothing stored server-side.
"""
from openai import AsyncOpenAI


def _get_client(provider: str, api_key: str) -> tuple[AsyncOpenAI, str]:
    if provider == "gemini":
        return AsyncOpenAI(
            api_key=api_key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        ), "gemini-2.5-flash"
    elif provider == "groq":
        return AsyncOpenAI(
            api_key=api_key,
            base_url="https://api.groq.com/openai/v1",
        ), "llama-3.3-70b-versatile"
    else:  # local / ollama
        return AsyncOpenAI(
            api_key="not-needed",
            base_url="http://localhost:11434/v1",
        ), "sqlcoder:latest"


SQL_PROMPT = """You are Verbis, an expert database assistant.
Convert natural language questions into precise, optimized SQL.
Rules:
1. Use ONLY tables and columns present in the provided schema.
2. Always add LIMIT unless the user explicitly asks for all rows.
3. Add brief SQL comments for complex joins or subqueries.
4. If the question is ambiguous, ask a clarifying question instead of guessing.
5. Return ONLY the SQL. No markdown fences. No explanation unless asked."""


async def generate_sql(
    nl_query: str,
    schema_context: str,
    dialect: str = "postgresql",
    provider: str = "gemini",
    api_key: str = "",
) -> str:
    client, model = _get_client(provider, api_key)
    r = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SQL_PROMPT},
            {"role": "user", "content": (
                f"Dialect: {dialect}\nSchema:\n{schema_context}\n\nQuestion: {nl_query}\n\nSQL:"
            )},
        ],
        temperature=0.1,
        max_tokens=2048,
    )
    return r.choices[0].message.content.strip()


async def generate_nosql(
    nl_query: str,
    schema_context: str,
    provider: str = "gemini",
    api_key: str = "",
) -> str:
    client, model = _get_client(provider, api_key)
    r = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content":
                "Convert natural language to a MongoDB query or aggregation pipeline. "
                "Return only valid JSON. No markdown."},
            {"role": "user", "content":
                f"Schema:\n{schema_context}\n\nQuestion: {nl_query}\n\nQuery:"},
        ],
        temperature=0.1,
        max_tokens=2048,
    )
    return r.choices[0].message.content.strip()


async def explain_plan(
    sql: str,
    execution_plan: str,
    provider: str = "gemini",
    api_key: str = "",
) -> str:
    client, model = _get_client(provider, api_key)
    r = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content":
                "Translate this database execution plan into plain English. "
                "Identify the most expensive step. Suggest one concrete improvement."},
            {"role": "user", "content": f"SQL:\n{sql}\n\nPlan:\n{execution_plan}"},
        ],
        temperature=0.2,
        max_tokens=1024,
    )
    return r.choices[0].message.content.strip()


async def generate_narrative(
    results_summary: str,
    user_query: str,
    provider: str = "gemini",
    api_key: str = "",
) -> str:
    client, model = _get_client(provider, api_key)
    r = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content":
                "You are a data analyst. Summarize query results into a clear narrative. "
                "State the top 3 findings, any anomalies, and one actionable recommendation."},
            {"role": "user", "content":
                f"Question: {user_query}\n\nResults:\n{results_summary}\n\nNarrative:"},
        ],
        temperature=0.4,
        max_tokens=1024,
    )
    return r.choices[0].message.content.strip()
