"""Analytical Narrative Engine — Component 7 (sub-module).

Implements Novel Contribution #12 (Analytical Narrative Engine).

Passes the result set (first 100 rows + column-level statistics) to the LLM
to generate business insights. Result shape detection determines narrative style.
"""

from __future__ import annotations

import statistics
from typing import Any, Dict, List
from loguru import logger

from services.llm_service import LLMRouter


class NarrativeEngine:
    def __init__(self, llm: LLMRouter) -> None:
        self.llm = llm

    async def summarize(self, columns: List[str], rows: List[Dict[str, Any]]) -> str:
        """Generate a 3-finding analytical narrative from the result set."""
        if not rows:
            return 'No rows in the result set — nothing to summarize.'

        stats = self._compute_stats(columns, rows)
        shape = self._detect_shape(columns, rows)

        system = (
            'You are an analytics storyteller. Given a SQL result set summary, '
            'identify the top 3 findings (trends, outliers, anomalies) and their '
            'business implications. Be concrete and quantitative. Avoid hedging.'
        )
        user = (
            f'## Result shape\n{shape}\n\n'
            f'## Column statistics\n{stats}\n\n'
            f'## First 5 rows (truncated)\n{rows[:5]}\n\n'
            f'## Top 3 findings:\n'
        )
        try:
            resp = await self.llm.complete(system, user, use_cloud=False)
            if resp.error:
                return f'(Narrative engine unavailable: {resp.error})'
            return resp.text
        except Exception as exc:
            logger.warning(f'Narrative engine failed: {exc}')
            return f'(Could not generate narrative: {exc})'

    # ─── Statistics ────────────────────────────────────────────────────
    def _compute_stats(self, columns: List[str], rows: List[Dict]) -> str:
        lines: List[str] = []
        for col in columns:
            values = [r.get(col) for r in rows if r.get(col) is not None]
            if not values:
                lines.append(f'- {col}: all null')
                continue
            # Try numeric
            try:
                nums = [float(v) for v in values]
                lines.append(
                    f'- {col}: min={min(nums):.2f}, max={max(nums):.2f}, '
                    f'mean={statistics.mean(nums):.2f}, distinct={len(set(nums))}'
                )
            except (ValueError, TypeError):
                distinct = len(set(str(v) for v in values))
                lines.append(f'- {col}: categorical, distinct={distinct}/{len(values)}')
        return '\n'.join(lines)

    def _detect_shape(self, columns: List[str], rows: List[Dict]) -> str:
        # Heuristic shape detection
        date_cols = [c for c in columns if any(k in c.lower() for k in ('date', 'time', 'month', 'year'))]
        if date_cols:
            return f'time-series (date columns: {date_cols})'
        if any(c.lower() in ('region', 'category', 'department') for c in columns):
            return 'categorical aggregation'
        return 'general table'
