"""Memory store — reads/writes .qmind/memory.json.

Implements Novel Contribution #1 (Adaptive User Preference Memory) and
Novel Contribution #7 (Ask-Once Disambiguation Memory).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List
from dataclasses import dataclass, field, asdict
import threading
import time


@dataclass
class SqlCorrection:
    queryId: str
    originalSql: str
    correctedSql: str
    timestamp: float


@dataclass
class MemoryData:
    domainVocabulary: Dict[str, str] = field(default_factory=dict)
    preferredPatterns: List[str] = field(default_factory=list)
    disambiguationRules: Dict[str, str] = field(default_factory=dict)
    sqlCorrectionHistory: List[Dict] = field(default_factory=list)
    lastUpdated: float = field(default_factory=time.time)


class MemoryStore:
    """Thread-safe wrapper around .qmind/memory.json."""

    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.Lock()
        self._cache: MemoryData | None = None

    def read(self) -> MemoryData:
        with self._lock:
            if self._cache is not None:
                return self._cache
            if not self._path.exists():
                self._cache = MemoryData()
                return self._cache
            try:
                raw = json.loads(self._path.read_text())
                self._cache = MemoryData(**raw)
            except Exception:
                self._cache = MemoryData()
            return self._cache

    def write(self, data: MemoryData) -> None:
        with self._lock:
            data.lastUpdated = time.time()
            self._cache = data
            tmp = self._path.with_suffix('.json.tmp')
            tmp.write_text(json.dumps(asdict(data), indent=2))
            tmp.replace(self._path)

    def add_disambiguation_rule(self, key: str, value: str) -> None:
        data = self.read()
        data.disambiguationRules[key] = value
        self.write(data)

    def add_vocabulary(self, term: str, sql: str) -> None:
        data = self.read()
        data.domainVocabulary[term] = sql
        self.write(data)

    def record_correction(self, query_id: str, original: str, corrected: str) -> None:
        data = self.read()
        data.sqlCorrectionHistory.append({
            'queryId': query_id,
            'originalSql': original,
            'correctedSql': corrected,
            'timestamp': time.time(),
        })
        self.write(data)
