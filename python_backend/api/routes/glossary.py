"""GET / POST /api/glossary — Business Glossary CRUD (Novel #10)."""

from __future__ import annotations

from typing import List, Dict, Any

from fastapi import APIRouter, Request
from loguru import logger

from models.requests import GlossaryTerm, GlossaryStore

router = APIRouter()


@router.get('/glossary', response_model=GlossaryStore)
async def get_glossary(request: Request) -> GlossaryStore:
    state = request.app.state.qm
    from services.glossary_service import GlossaryService
    svc = GlossaryService(state.workspace_path / 'glossary.json')
    return svc.read()


@router.post('/glossary')
async def save_glossary_term(term: GlossaryTerm, request: Request) -> Dict[str, Any]:
    state = request.app.state.qm
    from services.glossary_service import GlossaryService
    svc = GlossaryService(state.workspace_path / 'glossary.json')
    svc.upsert(term)
    return {'success': True}
