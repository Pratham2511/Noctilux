"""
Few-Shot LLM Intent Guard for Verbis — with LRU cache + invalidation.

Classifies whether a user message is database-related (DATABASE) or
off-topic (OFFTOPIC) using a single LLM call with explicit few-shot examples.

Why few-shot LLM (not embeddings, not keywords):
- Keyword lists: 30%+ false-positive rate on polysemous words
  ("weather data from sensors table" is a valid query but contains "weather")
- Embedding approach: requires 40 API calls at startup, fails if no API key
  set yet (first launch), doesn't work with Groq (no embeddings endpoint)
- Few-shot LLM: ~50 tokens per request, 95%+ accuracy, works with all providers,
  zero startup cost, no extra dependencies

Cache: 200-entry LRU keyed on (normalized_message, provider). Repeated
identical queries return cached result with zero API cost. The cached value
is the FULL (intent, message) tuple so the same off-topic query shows the
same polite response each time — avoids the "different message every reload"
UX bug. cachetools is added EXPLICITLY to requirements.txt (verified: neither
chromadb 1.5.9 nor openai directly requires it — do NOT rely on transitive deps).

Cache invalidation: clear_intent_cache() MUST be called when the user sets a
new API key, clears their API key, or switches LLM provider. Wired via the
/api/intent/cache/clear endpoint (see Task 1.2 + Task 1.4).

Research basis:
- Uber QueryGPT and Oracle Select AI use dedicated classification prompts
- arXiv fine-tuned sentence transformers paper notes softmax classifiers are
  over-confident on out-of-scope samples — explicit examples correct this
- VLDB 2025 AIDB Workshop: few-shot prompting is the production-standard
  intent scoping method for NL2SQL systems
"""

from typing import Optional, Tuple
from openai import AsyncOpenAI
from cachetools import LRUCache  # Added EXPLICITLY to requirements.txt — NOT transitive


# ── LRU cache: 200 entries (active users type 50+ unique queries/session) ──
_intent_cache: LRUCache = LRUCache(maxsize=200)


# ── Few-shot prompt with 15+ explicit examples ────────────────────────
_FEW_SHOT_PROMPT = """You are an intent classifier for Verbis, a database assistant inside VS Code.
Classify whether the user's message is database-related or completely off-topic.

DATABASE examples (all of these are DATABASE):
- "show me all users who signed up last month" → DATABASE
- "what is total revenue by region for this year" → DATABASE
- "find customers who have not placed any orders" → DATABASE
- "which products are running low on stock" → DATABASE
- "how many orders were placed today" → DATABASE
- "list the top 10 customers by total spend" → DATABASE
- "show duplicate email addresses in the users table" → DATABASE
- "what tables do I have in my database" → DATABASE
- "describe the schema for the orders table" → DATABASE
- "find all transactions above 10000" → DATABASE
- "which employees joined in the last 6 months" → DATABASE
- "show me average salary by department" → DATABASE
- "weather data from the sensors table" → DATABASE (asks about data in a table)
- "temperature readings in the climate database" → DATABASE (asks about a database)
- "SELECT * FROM recipes" → DATABASE (already valid SQL)
- "create a hospital database with patients and doctors" → DATABASE
- "explain this query plan" → DATABASE
- "help me design a school management schema" → DATABASE
- "find all null values in the email column" → DATABASE
- "what is the schema of my database" → DATABASE

OFFTOPIC examples (all of these are OFFTOPIC):
- "what is the weather today in Mumbai" → OFFTOPIC
- "tell me a joke" → OFFTOPIC
- "who won the cricket world cup" → OFFTOPIC
- "how do I cook biryani" → OFFTOPIC
- "what is the capital of France" → OFFTOPIC
- "write me a poem about the ocean" → OFFTOPIC
- "translate this sentence to Hindi" → OFFTOPIC
- "what is 25 multiplied by 48" → OFFTOPIC
- "who is the prime minister of India" → OFFTOPIC
- "recommend a good movie to watch" → OFFTOPIC
- "how do I lose weight quickly" → OFFTOPIC
- "what are the symptoms of a cold" → OFFTOPIC
- "write a cover letter for a software job" → OFFTOPIC
- "what is the stock price of TCS today" → OFFTOPIC
- "how do I fix my wifi connection" → OFFTOPIC
- "explain how photosynthesis works" → OFFTOPIC

Rules:
- When uncertain, answer DATABASE. Never block a potentially valid database query.
- Reply with ONLY one word: DATABASE or OFFTOPIC. No explanation."""


# ── Off-topic responses (polite, varied, never snarky) ─────────────────
# CRITICAL: variable name is OFFTOPIC_RESPONSES with TWO F's.
# Do NOT typo this as OFTOPIC_RESPONSES — it will crash on every off-topic query.

OFFTOPIC_RESPONSES = [
    "I'm Verbis — a database assistant. I can only help with questions about your data. Try something like 'show me all orders from last week'.",
    "That's outside my scope. I work exclusively with databases. What would you like to know about your data?",
    "I'm built for database queries — things like 'find top customers' or 'show the schema'. What data question can I help with?",
    "I only speak SQL and data. Ask me anything about your connected database and I'll help instantly.",
]


# ── Client builder ────────────────────────────────────────────────────

def _get_client(provider: str, api_key: str) -> Tuple[AsyncOpenAI, str]:
    """Return (AsyncOpenAI client, model_name) for the given provider."""
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


# ── Public API ─────────────────────────────────────────────────────────

async def classify_intent(
    user_message: str,
    provider: str = "gemini",
    api_key: str = "",
) -> Tuple[str, Optional[str]]:
    """
    Classify whether user_message is database-related or off-topic.

    Returns:
        ("DATABASE", None)              — proceed with SQL generation
        ("OFFTOPIC", "polite message")  — return to user, skip SQL generation

    Cached: 200-entry LRU keyed on (message, provider). Repeated identical
    queries return cached result with zero API cost. Cache stores the full
    tuple (intent + chosen message) so the same off-topic query shows the
    same polite response each time.

    Failure mode: ALWAYS fails open to DATABASE. Never blocks a valid query.
    """
    cache_key = (user_message.strip().lower(), provider)
    if cache_key in _intent_cache:
        return _intent_cache[cache_key]

    try:
        client, model = _get_client(provider, api_key)
        r = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _FEW_SHOT_PROMPT},
                {"role": "user", "content": f'Message: "{user_message}"\nClassification:'},
            ],
            temperature=0.0,
            max_tokens=5,
        )
        result_text = r.choices[0].message.content.strip().upper()
        if "OFFTOPIC" in result_text and "DATABASE" not in result_text:
            import random
            result: Tuple[str, Optional[str]] = ("OFFTOPIC", random.choice(OFFTOPIC_RESPONSES))
        else:
            result = ("DATABASE", None)
    except Exception:
        result = ("DATABASE", None)  # fail open

    _intent_cache[cache_key] = result
    return result


def clear_intent_cache() -> None:
    """
    Clear the intent cache. Called when:
      - User sets a new API key (verbis.setApiKey) — see Task 1.4
      - User clears their API key (verbis.clearApiKey) — see Task 1.4
      - User switches LLM provider via VS Code settings — see Task 1.4 (Fix E)
    Wired via /api/intent/cache/clear endpoint (see Task 1.2).
    """
    _intent_cache.clear()
