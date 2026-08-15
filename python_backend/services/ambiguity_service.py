"""Ambiguity Detector & Resolver — Component 2.

Implements Novel Contribution #7 (Ask-Once Disambiguation Memory).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import List, Optional

from core.memory_store import MemoryStore


@dataclass
class AmbiguityQuestion:
    id: str
    question: str
    options: List[str]
    rule_key: str  # Key to persist in disambiguation_rules


# ─── Taxonomy patterns (Part 5, Component 2) ───────────────────────────────
AMBIGUITY_PATTERNS = [
    {
        'triggers': ['top customers', 'top users', 'top products', 'best customers'],
        'rule_key': 'top customers',
        'question': "What does 'top' mean in this context?",
        'options': [
            'Highest total spend',
            'Most purchases by count',
            'Most recent orders',
        ],
    },
    {
        'triggers': ['last quarter', 'previous quarter'],
        'rule_key': 'last quarter',
        'question': "What is 'last quarter'?",
        'options': [
            'Previous calendar quarter',
            'Last 90 rolling days',
        ],
    },
    {
        'triggers': ['recent', 'recently'],
        'rule_key': 'recent',
        'question': "How recent is 'recent'?",
        'options': ['Last 7 days', 'Last 30 days', 'Last 90 days'],
    },
    {
        'triggers': ['active users', 'active customers'],
        'rule_key': 'active users',
        'question': "What defines an 'active' user?",
        'options': [
            'Logged in within 30 days',
            'Logged in within 7 days',
            'Made a purchase within 30 days',
        ],
    },
    {
        'triggers': ['orders'],
        'rule_key': 'orders',
        'question': "Which orders table do you mean?",
        'options': [
            'customer_orders',
            'supplier_orders',
        ],
    },
]


class AmbiguityDetector:
    """Max 2 questions per query, max 3 options per question (per spec)."""

    def __init__(self, memory: MemoryStore) -> None:
        self.memory = memory

    def detect(self, nl_input: str) -> List[AmbiguityQuestion]:
        text = nl_input.lower()
        rules = self.memory.read().disambiguationRules

        questions: List[AmbiguityQuestion] = []
        for pattern in AMBIGUITY_PATTERNS:
            # Skip if user already disambiguated this term (Ask-Once Memory)
            if pattern['rule_key'] in rules:
                continue
            if any(trigger in text for trigger in pattern['triggers']):
                questions.append(AmbiguityQuestion(
                    id=str(uuid.uuid4()),
                    question=pattern['question'],
                    options=pattern['options'],
                    rule_key=pattern['rule_key'],
                ))
            if len(questions) >= 2:
                break

        return questions
