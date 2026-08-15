"""Prompt builder — assembles LLM prompts from schema + memory + dialect.

Used by sql_generator, narrative_service, plan_explainer.
"""

from __future__ import annotations

from typing import List, Dict
from core.memory_store import MemoryData


def build_generation_prompt(
    nl_input: str,
    schema_chunks: List[Dict],
    memory: MemoryData,
    dialect: str = 'postgresql',
    strategy: str = 'direct',
) -> str:
    """Build a system+user prompt pair for SQL generation.

    strategy ∈ {'direct', 'cot', 'skeleton'}
    """
    schema_str = '\n'.join(
        f"Table {c['tableName']} ({c.get('rowCountEstimate', '?')} rows):\n"
        + '\n'.join(f"  - {col['name']} {col['type']}"
                    + (' PK' if col.get('isPrimaryKey') else '')
                    + (' FK→' + col.get('referencedTable', '') if col.get('isForeignKey') else '')
                    for col in c['columns'])
        for c in schema_chunks
    )

    memory_str = ''
    if memory.disambiguationRules:
        memory_str += 'Disambiguation rules (apply automatically):\n'
        for k, v in memory.disambiguationRules.items():
            memory_str += f'  "{k}" → {v}\n'
    if memory.domainVocabulary:
        memory_str += '\nDomain vocabulary:\n'
        for k, v in memory.domainVocabulary.items():
            memory_str += f'  "{k}" = {v}\n'

    strategy_hint = {
        'direct': 'Generate the SQL query directly.',
        'cot': 'Decompose step-by-step: schema linking → sub-queries → CTE assembly → final query.',
        'skeleton': 'First emit the query skeleton (SELECT/FROM/WHERE/GROUP BY), then fill in specifics.',
    }[strategy]

    system = (
        f'You are a {dialect} SQL expert. Generate a single, executable, well-optimized SQL query.\n'
        f'Never reference tables or columns not present in the schema below.\n'
        f'Prefer CTEs over deeply nested subqueries when it improves readability.\n'
        f'Always add a LIMIT clause unless the user explicitly asks for all rows.\n'
    )
    user = (
        f'## Strategy\n{strategy_hint}\n\n'
        f'## Schema\n{schema_str}\n\n'
    )
    if memory_str:
        user += f'## Memory\n{memory_str}\n'
    user += f'## Natural Language Query\n{nl_input}\n\n## SQL\n'

    return system, user
