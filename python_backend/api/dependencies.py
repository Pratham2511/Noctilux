"""Application-wide dependency injection and lifecycle.

Holds the AppState object that bundles:
- DB connection pools (one per DBConfig)
- ChromaDB client (schema RAG index)
- LLM client (cloud + local)
- Workspace path
- Active settings
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict

from config import Settings
from core.db_pool import DBPoolManager
from core.memory_store import MemoryStore
from core.history_store import HistoryStore
from services.rag_service import RAGService
from services.llm_service import LLMRouter
from services.privacy_shield import PrivacyShield
from services.pii_service import PIIMasker
from services.perf_tracker import PerfTracker


@dataclass
class AppState:
    settings: Settings
    workspace_path: Path
    db_pools: DBPoolManager
    memory_store: MemoryStore
    history_store: HistoryStore
    rag: RAGService
    llm: LLMRouter
    privacy_shield: PrivacyShield
    pii_masker: PIIMasker
    perf_tracker: PerfTracker
    extra: dict = field(default_factory=dict)


def init_app_state(settings: Settings) -> AppState:
    """Construct all backend services. Called once in FastAPI lifespan."""
    workspace = settings.workspace_path / '.qmind'
    workspace.mkdir(parents=True, exist_ok=True)

    return AppState(
        settings=settings,
        workspace_path=workspace,
        db_pools=DBPoolManager(),
        memory_store=MemoryStore(workspace / 'memory.json'),
        history_store=HistoryStore(workspace / 'history.json', workspace / 'query_tree.json'),
        rag=RAGService(persist_dir=str(settings.chroma_path)),
        llm=LLMRouter(settings),
        privacy_shield=PrivacyShield(salt_path=settings.priv_map_path),
        pii_masker=PIIMasker(),
        perf_tracker=PerfTracker(
            log_path=workspace / 'perf_log.json',
            baseline_window=settings.regression_baseline_window,
            threshold_pct=settings.regression_threshold_pct,
        ),
    )


async def dispose_app_state(state: AppState) -> None:
    """Dispose all resources on shutdown."""
    try:
        state.db_pools.dispose_all()
        state.rag.close()
    except Exception as exc:
        from loguru import logger
        logger.warning(f'Error during disposal: {exc}')
