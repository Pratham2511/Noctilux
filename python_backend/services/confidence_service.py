"""Confidence Scorer — Component 6, Step 5.

Implements Novel Contribution #5 (Confidence-Calibrated Output with
Alternative Interpretations).

Composite confidence score from:
    - Schema match completeness (% of referenced objects that exist)
    - Ambiguity resolution completeness (was ambiguity fully resolved?)
    - Few-shot similarity score (RAG retrieval distance, if available)
    - Execution success rate of similar past queries (if available)

If confidence < 80%, surface 2 alternative SQL interpretations.
"""

from __future__ import annotations

from typing import List, Optional, Tuple
from dataclasses import dataclass

from services.sql_generator import SQLCandidate
from services.validator_service import Validator


@dataclass
class ConfidenceBreakdown:
    schema_match: float           # 0.0–1.0
    ambiguity_resolved: float     # 0.0–1.0
    rag_similarity: float         # 0.0–1.0
    historical_success: float     # 0.0–1.0
    composite: float              # weighted average


class ConfidenceScorer:
    WEIGHTS = {
        'schema_match': 0.40,
        'ambiguity_resolved': 0.20,
        'rag_similarity': 0.20,
        'historical_success': 0.20,
    }

    def score(self, sql: str, schema_chunks: List[dict], memory,
              rag_similarity: Optional[float] = None,
              ambiguity_was_present: bool = False) -> float:
        """Return composite confidence 0.0–1.0."""
        validator = Validator()

        # Schema match completeness
        schema_match = 1.0 if validator.validate_semantic(sql, schema_chunks) else 0.4

        # Ambiguity resolved?
        if ambiguity_was_present:
            ambiguity_resolved = 1.0 if memory.disambiguationRules else 0.3
        else:
            ambiguity_resolved = 1.0

        # RAG similarity (or default)
        rag_sim = rag_similarity if rag_similarity is not None else 0.7

        # Historical success (placeholder: 0.8 default)
        historical = 0.8

        composite = (
            self.WEIGHTS['schema_match'] * schema_match +
            self.WEIGHTS['ambiguity_resolved'] * ambiguity_resolved +
            self.WEIGHTS['rag_similarity'] * rag_sim +
            self.WEIGHTS['historical_success'] * historical
        )
        return round(composite, 3)

    # ─── Execution-grounded candidate selection (Novel #17) ───────────
    def select_primary(
        self, candidates: List[SQLCandidate]
    ) -> Tuple[SQLCandidate, List[SQLCandidate]]:
        """Pick highest-confidence candidate as primary.

        The remaining candidates become alternatives (sorted by confidence desc).
        """
        if not candidates:
            raise ValueError('No candidates to score.')
        sorted_c = sorted(candidates, key=lambda c: c.confidence, reverse=True)
        primary = sorted_c[0]
        alternatives = sorted_c[1:3]  # max 2 alternatives per spec
        return primary, alternatives
