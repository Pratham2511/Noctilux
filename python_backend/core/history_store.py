"""History + Query Tree store — .qmind/history.json + .qmind/query_tree.json.

Implements Novel Contribution #3 (Query Genealogy) and the persistence layer
for Novel Contribution #14 (Interactive Query Tree DAG).
"""

from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path
from typing import Dict, List, Optional
import hashlib


class HistoryStore:
    def __init__(self, history_path: Path, tree_path: Path) -> None:
        self._history_path = history_path
        self._tree_path = tree_path
        self._lock = threading.Lock()

    # ─── history.json ────────────────────────────────────────────────
    def read_history(self) -> List[dict]:
        if not self._history_path.exists():
            return []
        try:
            return json.loads(self._history_path.read_text())
        except Exception:
            return []

    def append_history(self, entry: dict) -> None:
        with self._lock:
            history = self.read_history()
            history.append(entry)
            history = history[-5000:]
            tmp = self._history_path.with_suffix('.json.tmp')
            tmp.write_text(json.dumps(history, indent=2))
            tmp.replace(self._history_path)

    # ─── query_tree.json ─────────────────────────────────────────────
    def read_tree(self) -> Dict:
        if not self._tree_path.exists():
            return {'nodes': {}, 'rootIds': [], 'checkpoints': []}
        try:
            return json.loads(self._tree_path.read_text())
        except Exception:
            return {'nodes': {}, 'rootIds': [], 'checkpoints': []}

    def write_tree(self, tree: Dict) -> None:
        with self._lock:
            tmp = self._tree_path.with_suffix('.json.tmp')
            tmp.write_text(json.dumps(tree, indent=2))
            tmp.replace(self._tree_path)

    def append_query_tree_node(
        self,
        nl_input: str,
        sql: str,
        confidence: float,
        status: str = 'unexecuted',
    ) -> str:
        node_id = str(uuid.uuid4())
        tree = self.read_tree()
        tree['nodes'][node_id] = {
            'id': node_id,
            'parentId': None,
            'nlInput': nl_input,
            'sql': sql,
            'confidence': confidence,
            'status': status,
            'timestamp': time.time() * 1000,
            'annotationCount': 0,
        }
        tree['rootIds'].append(node_id)
        self.write_tree(tree)
        return node_id

    def update_query_tree_node_status(
        self,
        sql: str,
        status: str,
        execution_time_ms: Optional[float] = None,
        row_count: Optional[int] = None,
    ) -> None:
        tree = self.read_tree()
        # Find most recent node with matching SQL
        for node in reversed(list(tree['nodes'].values())):
            if _normalize_sql(node.get('sql', '')) == _normalize_sql(sql):
                node['status'] = status
                if execution_time_ms is not None:
                    node['executionTimeMs'] = execution_time_ms
                if row_count is not None:
                    node['rowCount'] = row_count
                # Append perf sparkline entry
                sparkline = node.get('perfSparkline', [])
                if execution_time_ms is not None:
                    sparkline.append(execution_time_ms)
                    node['perfSparkline'] = sparkline[-10:]
                break
        self.write_tree(tree)


def _normalize_sql(sql: str) -> str:
    return ' '.join(sql.lower().split())
