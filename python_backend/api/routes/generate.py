from fastapi import APIRouter, HTTPException
from models.requests import GenerateRequest
from services.llm_service import generate_sql, generate_nosql
from services.intent_service import classify_intent, clear_intent_cache

router = APIRouter()


def _friendly_generation_error(exc: Exception) -> HTTPException:
    """
    Map low-level LLM client errors to actionable HTTP errors.

    Without this, a missing/invalid API key surfaces as a bare
    "500 Internal Server Error" — the terminal then shows a cryptic message.
    Instead we return a clean detail string the extension can display directly.
    """
    msg = str(exc).lower()
    if "missing credentials" in msg or "api_key" in msg or "api key" in msg or "unauthorized" in msg or "401" in msg:
        return HTTPException(
            status_code=401,
            detail=(
                "No valid API key for the selected provider. "
                "Run 'Verbis: Set API Key' (or choose a session key when prompted) and try again."
            ),
        )
    if "rate limit" in msg or "429" in msg or "quota" in msg:
        return HTTPException(
            status_code=429,
            detail="The LLM provider rate-limited the request. Wait a moment and try again.",
        )
    return HTTPException(status_code=502, detail=f"The LLM provider returned an error: {exc}")


@router.post("/generate")
async def generate(req: GenerateRequest):
    # ── Intent Guard: block off-topic queries before SQL generation ──
    intent, offtopic_msg = await classify_intent(
        user_message=req.nl_query,
        provider=req.provider,
        api_key=req.api_key,
    )
    if intent == "OFFTOPIC":
        return {
            "query": None,
            "confidence": 0.0,
            "alternatives": [],
            "offtopic": True,
            "message": offtopic_msg,
        }

    # ── Normal SQL/NoSQL generation ──────────────────────────────────
    try:
        if req.query_type == "nosql":
            result = await generate_nosql(
                nl_query=req.nl_query,
                schema_context=req.schema_context,
                provider=req.provider,
                api_key=req.api_key,
            )
        else:
            result = await generate_sql(
                nl_query=req.nl_query,
                schema_context=req.schema_context,
                dialect=req.dialect,
                provider=req.provider,
                api_key=req.api_key,
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise _friendly_generation_error(exc)
    return {"query": result, "confidence": 0.9, "alternatives": []}


# ── Cache invalidation endpoint (Fix B) ──────────────────────────────
# Called by extension.ts when user sets/clears API key or switches provider.
# Without this, stale cached classifications persist for up to 200 queries
# after a provider or key switch.

@router.post("/intent/cache/clear")
async def clear_intent_cache_endpoint():
    clear_intent_cache()
    return {"status": "cleared", "entries_removed": "all"}
