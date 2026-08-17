from fastapi import APIRouter
from models.requests import GenerateRequest
from services.llm_service import generate_sql, generate_nosql
from services.intent_service import classify_intent, clear_intent_cache

router = APIRouter()


@router.post("/api/generate")
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

    # ── Normal SQL/NoSQL generation (unchanged) ──────────────────────
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
    return {"query": result, "confidence": 0.9, "alternatives": []}


# ── Cache invalidation endpoint (Fix B) ──────────────────────────────
# Called by extension.ts when user sets/clears API key or switches provider.
# Without this, stale cached classifications persist for up to 200 queries
# after a provider or key switch.

@router.post("/api/intent/cache/clear")
async def clear_intent_cache_endpoint():
    clear_intent_cache()
    return {"status": "cleared", "entries_removed": "all"}
