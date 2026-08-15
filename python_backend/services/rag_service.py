"""RAG Service — Schema RAG using ChromaDB.

Implements Sub-Component 3a of the spec (Schema RAG Engine).

Indexes schema descriptions (table + column names + sample data) into a
local ChromaDB persistent collection, then retrieves top-K relevant chunks
at query time to avoid sending the full schema to the LLM.
"""

from __future__ import annotations

from typing import Dict, List
from loguru import logger


class RAGService:
    def __init__(self, persist_dir: str) -> None:
        self._persist_dir = persist_dir
        self._client = None
        self._collection = None
        self._init_client()

    def _init_client(self) -> None:
        try:
            import chromadb
            self._client = chromadb.PersistentClient(path=self._persist_dir)
            self._collection = self._client.get_or_create_collection(
                name='schema_chunks',
                metadata={'hnsw:space': 'cosine'},
            )
            logger.info(f'ChromaDB initialized at {self._persist_dir}')
        except Exception as exc:
            logger.warning(f'ChromaDB init failed (RAG disabled): {exc}')
            self._client = None
            self._collection = None

    # ─── Indexing ──────────────────────────────────────────────────────
    def index_schema(self, tables: List[Dict]) -> None:
        if not self._collection:
            return
        try:
            # Clear previous entries
            self._collection.delete(where={'source': 'schema'})

            for table in tables:
                doc = self._build_doc(table)
                self._collection.add(
                    ids=[f"t:{table['tableName']}"],
                    documents=[doc],
                    metadatas=[{'source': 'schema', 'table': table['tableName']}],
                )
            logger.info(f'Indexed {len(tables)} tables into ChromaDB.')
        except Exception as exc:
            logger.warning(f'RAG indexing failed: {exc}')

    def _build_doc(self, table: Dict) -> str:
        cols = ', '.join(f"{c['name']} {c['type']}" for c in table.get('columns', []))
        fks = ', '.join(
            f"{fk['column']}→{fk['referencedTable']}.{fk['referencedColumn']}"
            for fk in table.get('foreignKeys', []) or []
        ) or 'no foreign keys'
        return f"Table {table['tableName']} ({table.get('rowCountEstimate', '?')} rows). Columns: {cols}. FKs: {fks}."

    # ─── Retrieval ─────────────────────────────────────────────────────
    def retrieve_relevant(self, nl_input: str, top_k: int = 8) -> List[Dict]:
        """Return top-K most schema chunks relevant to the NL query."""
        if not self._collection:
            return []
        try:
            results = self._collection.query(
                query_texts=[nl_input],
                n_results=min(top_k, 50),
            )
            # Reconstruct minimal schema dicts for the generator
            chunks: List[Dict] = []
            for doc, meta in zip(results.get('documents', [[]])[0],
                                 results.get('metadatas', [[]])[0]):
                table_name = meta.get('table')
                if table_name:
                    chunks.append({'tableName': table_name, 'columns': [], 'doc': doc})
            return chunks
        except Exception as exc:
            logger.warning(f'RAG retrieval failed: {exc}')
            return []

    def close(self) -> None:
        try:
            if self._client:
                # ChromaDB PersistentClient persists automatically
                pass
        except Exception:
            pass
