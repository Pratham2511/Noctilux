"""NoSQL (MongoDB) generator — Component 5 (sub-module).

Implements part of Novel Contribution #4 (Federated SQL + NoSQL NL Querying).
"""

from __future__ import annotations

import json
import re
from typing import Dict, Any
from loguru import logger

from services.llm_service import LLMRouter


class NoSQLGenerator:
    def __init__(self, llm: LLMRouter) -> None:
        self.llm = llm

    async def generate_mql(self, nl_input: str, collection_schema: Dict) -> Dict:
        """Generate a MongoDB query / aggregation pipeline from NL."""
        system = (
            'You are a MongoDB expert. Generate a JSON MQL query or aggregation pipeline. '
            'Respond with valid JSON only — no prose, no code fences. '
            'Use this schema: ' + json.dumps(collection_schema)
        )
        user = f'Natural language: {nl_input}\n\nJSON MQL:'
        resp = await self.llm.complete(system, user, use_cloud=True)
        if resp.error:
            raise RuntimeError(f'LLM error: {resp.error}')

        # Parse JSON robustly
        try:
            text = resp.text.strip()
            text = re.sub(r'^```(?:json)?\s*', '', text).split('```')[0].strip()
            return json.loads(text)
        except json.JSONDecodeError as exc:
            logger.warning(f'MQL parse failed: {exc}. Raw: {resp.text[:200]}')
            return {'error': 'invalid_mql', 'raw': resp.text}
