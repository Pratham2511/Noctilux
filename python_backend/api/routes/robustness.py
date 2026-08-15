"""POST /api/robustness — Schema Evolution Robustness Testing Suite (Novel #16)."""

from __future__ import annotations

from fastapi import APIRouter, Request, HTTPException
from loguru import logger

from models.requests import RobustnessRequest, RobustnessReport
from services.robustness_service import RobustnessTester

router = APIRouter()


@router.post('/robustness', response_model=RobustnessReport)
async def run_robustness(req: RobustnessRequest, request: Request) -> RobustnessReport:
    state = request.app.state.qm
    tester = RobustnessTester(state.history_store)
    try:
        return tester.run_perturbations(req.querySet)
    except Exception as exc:
        logger.error(f'Robustness test failed: {exc}')
        raise HTTPException(500, detail=f'Robustness test failed: {exc}')
