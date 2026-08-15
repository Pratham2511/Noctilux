"""Federated Query Service — Component 5 (sub-module).

Implements Novel Contribution #4 (Federated SQL + NoSQL NL Querying).

Pipeline:
    1. Detect cross-database intent (heuristic: user mentions both SQL tables and NoSQL collections)
    2. Generate sub-queries per database independently
    3. Execute both in parallel
    4. Merge in-memory via Pandas on a shared key
"""

from __future__ import annotations

import asyncio
from typing import Dict, List, Any
from loguru import logger
import pandas as pd

from services.llm_service import LLMRouter
from services.sql_generator import SQLGenerator
from services.nosql_generator import NoSQLGenerator


class FederatedService:
    def __init__(self, llm: LLMRouter) -> None:
        self.llm = llm
        self.sql_gen = SQLGenerator(llm)
        self.nosql_gen = NoSQLGenerator(llm)

    def is_federated(self, nl_input: str, sql_schema: List[Dict], mongo_schema: List[Dict]) -> bool:
        """Heuristic: NL mentions entities in both schemas."""
        text = nl_input.lower()
        sql_mentions = any(t['tableName'].lower() in text for t in sql_schema)
        mongo_mentions = any(c['name'].lower() in text for c in mongo_schema)
        return sql_mentions and mongo_mentions

    async def execute_federated(
        self,
        nl_input: str,
        sql_schema: List[Dict],
        mongo_schema: List[Dict],
        sql_executor,  # callable(sql) -> List[Dict]
        mongo_executor,  # callable(mql) -> List[Dict]
        merge_key: str,
    ) -> Dict[str, Any]:
        """Plan + execute + merge a federated query."""
        # Generate sub-queries in parallel
        sql_task = self.sql_gen.generate_multipath(nl_input, sql_schema,
                                                   memory=None, use_cloud=True)
        mql_task = self.nosql_gen.generate_mql(nl_input, {'collections': mongo_schema})

        sql_candidates, mql = await asyncio.gather(sql_task, mql_task)
        primary_sql = sql_candidates[0].sql if sql_candidates else ''

        # Execute both sub-queries in parallel
        sql_rows, mongo_rows = await asyncio.gather(
            asyncio.to_thread(sql_executor, primary_sql),
            asyncio.to_thread(mongo_executor, mql),
        )

        # Pandas merge on shared key
        df_sql = pd.DataFrame(sql_rows)
        df_mongo = pd.DataFrame(mongo_rows)
        if merge_key not in df_sql.columns or merge_key not in df_mongo.columns:
            logger.warning(f'Merge key "{merge_key}" missing from one side.')
            return {
                'sqlRows': sql_rows,
                'mongoRows': mongo_rows,
                'merged': [],
                'mergeSucceeded': False,
            }

        merged = df_sql.merge(df_mongo, on=merge_key, how='outer', suffixes=('_sql', '_mongo'))
        return {
            'sqlRows': sql_rows,
            'mongoRows': mongo_rows,
            'merged': merged.to_dict(orient='records'),
            'mergeSucceeded': True,
        }
