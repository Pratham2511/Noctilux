from fastapi import APIRouter
from models.requests import GenerateRequest
from services.llm_service import generate_sql, generate_nosql

router = APIRouter()


@router.post("/api/generate")
async def generate(req: GenerateRequest):
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
