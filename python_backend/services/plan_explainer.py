"""Plan Explainer — Component 7 (sub-module).

Implements Novel Contribution #6 (Execution Plan Plain-Language Explainer).

Takes the EXPLAIN ANALYZE output (PostgreSQL JSON or MySQL JSON) and asks
the LLM to translate it into plain English.
"""

from __future__ import annotations

import json
from typing import Any, Dict, Optional
from loguru import logger

from services.llm_service import LLMRouter


class PlanExplainer:
    def __init__(self, llm: LLMRouter) -> None:
        self.llm = llm

    async def explain(self, plan: Dict[str, Any]) -> str:
        """Translate an execution plan to plain English via the LLM."""
        plan_str = json.dumps(plan, indent=2, default=str)[:4000]
        system = (
            'You are a database tuning expert. Translate the given execution plan '
            'into plain English. Identify the most expensive step. Suggest one '
            'concrete improvement with an estimated performance gain.'
        )
        user = f'Execution plan:\n```\n{plan_str}\n```\n\nPlain-English explanation:'
        resp = await self.llm.complete(system, user, use_cloud=False)  # local mode for speed
        if resp.error:
            logger.warning(f'Plan explainer LLM failed: {resp.error}')
            return f'Could not explain plan: {resp.error}'
        return resp.text
