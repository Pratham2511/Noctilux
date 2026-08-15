"""Privacy Shield — Component 4.

Implements Novel Contribution #2 (Privacy Shield for Cloud LLMs).

Pipeline:
    1. tokenize(schema)         → anonymized_schema + token_map
    2. send anonymized prompt   → LLM
    3. deanonymize_sql(sql, map) → real SQL with original names

The token map is persisted as AES-256-GCM encrypted .qmind/priv_map.enc.
The encryption key is derived from a workspace-unique salt stored in VS Code
SecretStorage (passed via env var QM_PRIVMAP_SALT on backend startup).
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import uuid
from pathlib import Path
from typing import Dict, List, Tuple

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from loguru import logger


class PrivacyShield:
    def __init__(self, salt_path: Path) -> None:
        self._salt_path = salt_path
        self._salt = os.environ.get('QM_PRIVMAP_SALT', 'fallback-dev-salt-change-me')
        self._active_maps: Dict[str, Dict[str, str]] = {}  # session_id → map

    # ─── Public API ────────────────────────────────────────────────────
    def anonymize(self, schema: List[Dict]) -> Tuple[List[Dict], str]:
        """Replace table/column names with anonymous tokens.

        Returns (anonymized_schema, session_id). The token map for session_id
        is held in memory and encrypted-at-rest when persisted.
        """
        session_id = str(uuid.uuid4())
        forward_map: Dict[str, str] = {}     # real → token
        reverse_map: Dict[str, str] = {}     # token → real

        anon_schema: List[Dict] = []
        for t_idx, table in enumerate(schema):
            t_token = f'table_{chr(65 + t_idx)}'  # table_A, table_B, …
            forward_map[table['tableName']] = t_token
            reverse_map[t_token] = table['tableName']

            anon_table = {**table, 'tableName': t_token, 'columns': []}
            for c_idx, col in enumerate(table.get('columns', [])):
                c_token = f'col_{c_idx + 1}'
                forward_map[f"{table['tableName']}.{col['name']}"] = c_token
                reverse_map[c_token] = col['name']
                anon_table['columns'].append({**col, 'name': c_token})
            anon_schema.append(anon_table)

        full_map = {'forward': forward_map, 'reverse': reverse_map}
        self._active_maps[session_id] = full_map
        self._persist(session_id, full_map)
        return anon_schema, session_id

    def deanonymize_sql(self, sql: str, session_id: str) -> str:
        """Replace anonymous tokens in the generated SQL with real names."""
        full_map = self._active_maps.get(session_id, {})
        reverse = full_map.get('reverse', {})
        if not reverse:
            logger.warning(f'No active token map for session {session_id}; returning SQL as-is.')
            return sql

        # Replace longest tokens first to avoid partial collisions
        for token in sorted(reverse.keys(), key=len, reverse=True):
            sql = sql.replace(token, reverse[token])
        return sql

    # ─── AES-256-GCM persistence ────────────────────────────────────────
    def _persist(self, session_id: str, full_map: Dict) -> None:
        try:
            key = hashlib.sha256(self._salt.encode()).digest()  # 32 bytes
            aes = AESGCM(key)
            nonce = os.urandom(12)
            plaintext = json.dumps({session_id: full_map}).encode()
            ciphertext = aes.encrypt(nonce, plaintext, None)
            blob = base64.b64encode(nonce + ciphertext)
            with open(self._salt_path, 'ab') as f:
                f.write(blob + b'\n')
        except Exception as exc:
            logger.warning(f'Could not persist privacy map: {exc}')

    def load_all(self) -> Dict[str, Dict]:
        """Load all persisted token maps (used on backend restart)."""
        if not self._salt_path.exists():
            return {}
        try:
            key = hashlib.sha256(self._salt.encode()).digest()
            aes = AESGCM(key)
            maps: Dict[str, Dict] = {}
            with open(self._salt_path, 'rb') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    raw = base64.b64decode(line)
                    nonce, ciphertext = raw[:12], raw[12:]
                    plaintext = aes.decrypt(nonce, ciphertext, None)
                    data = json.loads(plaintext)
                    maps.update(data)
            return maps
        except Exception as exc:
            logger.warning(f'Could not load privacy maps: {exc}')
            return {}
