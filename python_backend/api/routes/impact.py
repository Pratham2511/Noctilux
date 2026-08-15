"""POST /api/schema/impact — Schema Change Impact Predictor (Novel #9)."""

from __future__ import annotations

from typing import Dict, Any

from fastapi import APIRouter, Request, HTTPException
from loguru import logger

from models.requests import ImpactRequest, ImpactResponse
from services.schema_impact import SchemaImpactPredictor

router = APIRouter()


@router.post('/impact', response_model=ImpactResponse)
async def analyze_impact(req: ImpactRequest, request: Request) -> ImpactResponse:
    state = request.app.state.qm
    predictor = SchemaImpactPredictor(state.history_store)
    try:
        impact = predictor.predict(req.ddl, req.dbConfigId)
        return impact
    except Exception as exc:
        logger.error(f'Impact analysis failed: {exc}')
        raise HTTPException(500, detail=f'Impact analysis failed: {exc}')
