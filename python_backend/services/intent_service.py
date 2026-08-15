"""NL Intent Analyzer — Component 1.

Classifies each input into one of:
    QUERY_DATA, MODIFY_DATA, SCHEMA_EXPLORE, OPTIMIZE_QUERY, EXPLAIN_RESULT,
    COMPARE_DATASETS, AGGREGATE_REPORT, DDL_CHANGE, AMBIGUOUS

Implements Novel Contribution #7 (disambiguation trigger) and
Novel Contribution #10 (semantic routing — partial, glossary routing lives
in glossary_service).
"""

from __future__ import annotations

from enum import Enum
from typing import List
import re


class Intent(str, Enum):
    QUERY_DATA = 'QUERY_DATA'
    MODIFY_DATA = 'MODIFY_DATA'
    SCHEMA_EXPLORE = 'SCHEMA_EXPLORE'
    OPTIMIZE_QUERY = 'OPTIMIZE_QUERY'
    EXPLAIN_RESULT = 'EXPLAIN_RESULT'
    COMPARE_DATASETS = 'COMPARE_DATASETS'
    AGGREGATE_REPORT = 'AGGREGATE_REPORT'
    DDL_CHANGE = 'DDL_CHANGE'
    AMBIGUOUS = 'AMBIGUOUS'


class IntentClassifier:
    """Rule-based classifier for MVP. Production version would use a
    fine-tuned transformer (Llama 3 / Mistral) per the spec."""

    DDL_KEYWORDS = ['alter', 'create table', 'drop table', 'rename', 'add column', 'drop column']
    MODIFY_KEYWORDS = ['insert', 'update', 'delete from', 'truncate']
    SCHEMA_KEYWORDS = ['show tables', 'describe', 'schema', 'columns of', 'list tables']
    OPTIMIZE_KEYWORDS = ['optimize', 'speed up', 'why is this slow', 'make this faster']
    EXPLAIN_KEYWORDS = ['explain', 'why did', 'what does this query do', 'break down']
    COMPARE_KEYWORDS = ['compare', 'difference between', 'versus', ' vs ']
    AGGREGATE_KEYWORDS = ['average', 'sum', 'count', 'group by', 'total', 'aggregate']

    def classify(self, nl_input: str) -> Intent:
        text = nl_input.lower()

        if any(k in text for k in self.DDL_KEYWORDS):
            return Intent.DDL_CHANGE
        if any(k in text for k in self.MODIFY_KEYWORDS):
            return Intent.MODIFY_DATA
        if any(k in text for k in self.SCHEMA_KEYWORDS):
            return Intent.SCHEMA_EXPLORE
        if any(k in text for k in self.OPTIMIZE_KEYWORDS):
            return Intent.OPTIMIZE_QUERY
        if any(k in text for k in self.EXPLAIN_KEYWORDS):
            return Intent.EXPLAIN_RESULT
        if any(k in text for k in self.COMPARE_KEYWORDS):
            return Intent.COMPARE_DATASETS
        if any(k in text for k in self.AGGREGATE_KEYWORDS):
            return Intent.AGGREGATE_REPORT

        # Heuristic for ambiguity
        if any(w in text for w in ['top', 'recent', 'last quarter', 'active', 'best', 'worst']):
            return Intent.AMBIGUOUS

        return Intent.QUERY_DATA
