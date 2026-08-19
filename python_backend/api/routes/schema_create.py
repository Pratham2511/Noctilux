"""Schema Creation Routes — Text2Schema feature."""

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel
from services.schema_creator_service import (
    generate_schema_from_nl, schema_to_ddl, schema_to_mermaid,
    count_tables, refine_schema,
)

router = APIRouter()


class SchemaCreateRequest(BaseModel):
    description: str
    dialect: str = "postgresql"
    provider: str = "gemini"
    api_key: str = ""
    model: Optional[str] = None


class SchemaRefineRequest(BaseModel):
    existing_schema: dict
    refinement: str
    dialect: str = "postgresql"
    provider: str = "gemini"
    api_key: str = ""
    model: Optional[str] = None


@router.post("/schema/create")
async def create_schema(req: SchemaCreateRequest):
    schema = await generate_schema_from_nl(
        description=req.description,
        dialect=req.dialect,
        provider=req.provider,
        api_key=req.api_key,
        model=req.model,
    )
    ddl = schema_to_ddl(schema, req.dialect)
    return {
        "schema": schema,
        "ddl": ddl,
        "mermaid": schema_to_mermaid(schema),
        "table_count": count_tables(ddl),
    }


@router.post("/schema/refine")
async def refine_schema_endpoint(req: SchemaRefineRequest):
    updated = await refine_schema(
        existing_schema=req.existing_schema,
        refinement=req.refinement,
        dialect=req.dialect,
        provider=req.provider,
        api_key=req.api_key,
        model=req.model,
    )
    ddl = schema_to_ddl(updated, req.dialect)
    return {
        "schema": updated,
        "ddl": ddl,
        "mermaid": schema_to_mermaid(updated),
        "table_count": count_tables(ddl),
    }
