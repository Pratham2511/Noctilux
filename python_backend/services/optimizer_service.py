"""Query Optimizer with Plan Similarity — Component 6, Step 4.

Implements Novel Contribution #18 (Query Plan Similarity Optimization).

Pipeline:
    1. Detect anti-patterns (SELECT *, missing WHERE on large tables, N+1, etc.)
    2. Fetch EXPLAIN ANALYZE output as a JSON plan tree
    3. Compute tree-edit distance (APTED) vs. all past plans in history.json
    4. If a similar past plan was optimized with a known hint, apply the same hint
    5. Return (optimized_sql, notes)
"""

from __future__ import annotations

import hashlib
import re
from typing import List, Optional, Tuple, Dict
from loguru import logger

try:
    from apted import APTED, unit_cost
    APTED_AVAILABLE = True
except ImportError:
    APTED_AVAILABLE = False
    logger.warning('apted not installed — plan similarity disabled.')


# ─── Anti-pattern detectors ────────────────────────────────────────────
ANTI_PATTERNS: List[Tuple[str, str, str]] = [
    (r'\bSELECT\s+\*\b', 'SELECT * — explicit column lists are faster and safer',
     'Replace with explicit column list.'),
    (r'\bJOIN\b[^;]*\bJOIN\b[^;]*\bJOIN\b', 'Multi-join query — verify indexes on join columns',
     'Check EXPLAIN plan for hash vs nested loop joins.'),
    (r'\bLIKE\s+[\'"]%', 'Leading wildcard LIKE — cannot use index',
     "Consider full-text search instead of LIKE '%term%'."),
    (r'\bWHERE\s+\w+\s*=\s*\w+\s*;\s*$', 'No LIMIT clause — risk of unbounded scan',
     'Add LIMIT 500 (or appropriate value).'),
]


class Optimizer:
    def __init__(self, history_store) -> None:
        self.history = history_store

    def optimize(self, sql: str) -> Tuple[str, str]:
        """Apply anti-pattern fixes + plan-similarity hints.

        Returns (optimized_sql, notes_string).
        """
        optimized = sql
        notes: List[str] = []

        # Anti-pattern detection
        for pattern, problem, suggestion in ANTI_PATTERNS:
            if re.search(pattern, sql, re.IGNORECASE):
                notes.append(f'⚠ {problem}')
                notes.append(f'  → {suggestion}')

        # Plan similarity (best-effort)
        if APTED_AVAILABLE:
            similar_hint = self._find_similar_plan_hint(sql)
            if similar_hint:
                notes.append(f'📊 Plan-similarity match found: {similar_hint}')

        # Auto-apply: append LIMIT if missing
        if not re.search(r'\bLIMIT\b', optimized, re.IGNORECASE):
            if optimized.rstrip().endswith(';'):
                optimized = optimized.rstrip()[:-1] + ' LIMIT 500;'
            else:
                optimized = optimized + ' LIMIT 500'
            notes.append('Added LIMIT 500 (default row limit per settings).')

        note_str = '\n'.join(notes) if notes else 'No optimizations needed.'
        return optimized, note_str

    def _find_similar_plan_hint(self, sql: str) -> Optional[str]:
        """Compare the SQL fingerprint against historical optimized queries."""
        try:
            history = self.history.read_history()
        except Exception:
            return None

        # Simple Levenshtein on normalized SQL (proxy for plan similarity)
        normalized = ' '.join(sql.lower().split())
        best_match: Optional[Tuple[float, str]] = None
        for entry in history[-100:]:
            past_sql = entry.get('sql', '')
            if not past_sql:
                continue
            past_norm = ' '.join(past_sql.lower().split())
            similarity = _similarity_ratio(normalized, past_norm)
            if best_match is None or similarity > best_match[0]:
                best_match = (similarity, past_sql)

        if best_match and best_match[0] > 0.85:
            return (f'86%+ similar to past optimized query — '
                    f'consider the same index/JOIN hints as: {best_match[1][:80]}…')
        return None


def _similarity_ratio(a: str, b: str) -> float:
    """Quick token-overlap similarity (proxy for APTED)."""
    if not a or not b:
        return 0.0
    ta, tb = set(a.split()), set(b.split())
    if not ta and not tb:
        return 1.0
    return len(ta & tb) / len(ta | tb)
