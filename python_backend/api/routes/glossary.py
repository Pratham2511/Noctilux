"""GET / POST /api/glossary — Business Glossary CRUD (Novel #10)."""

from __future__ import annotations

from typing import List, Dict, Any

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter()


class GlossaryTerm(BaseModel):
    term: str
    sqlTemplate: str
    aliases: List[str] = []
    description: str = ''
    dialect: str = 'postgresql'
    owner: str = ''
    lastValidated: str = ''


@router.get('/glossary')
async def get_glossary(request: Request) -> Dict[str, Any]:
    state = request.app.state.qm
    from services.glossary_service import GlossaryService
    svc = GlossaryService(state.workspace_path / 'glossary.json')
    store = svc.read()
    # Serialize robustly whether store is a Pydantic model or dict
    try:
        return store.model_dump()
    except AttributeError:
        return store if isinstance(store, dict) else {'terms': [], 'joinPaths': []}


@router.post('/glossary')
async def save_glossary_term(term: GlossaryTerm, request: Request) -> Dict[str, Any]:
    state = request.app.state.qm
    from services.glossary_service import GlossaryService
    svc = GlossaryService(state.workspace_path / 'glossary.json')
    # Convert from camelCase (webview) to the shape GlossaryService expects
    payload = {
        'term': term.term,
        'sqlTemplate': term.sqlTemplate,
        'aliases': term.aliases,
        'description': term.description,
        'dialect': term.dialect,
        'owner': term.owner,
        'lastValidated': term.lastValidated,
    }
    svc.upsert(payload)
    return {'success': True}
