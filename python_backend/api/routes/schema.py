"""GET /api/schema — Schema introspection + ChromaDB indexing."""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Request, HTTPException
from loguru import logger

router = APIRouter()


@router.get('/schema')
async def get_schema(dbConfigId: str, request: Request) -> Dict[str, Any]:
    state = request.app.state.qm
    pool = state.db_pools.get(dbConfigId)
    if pool is None:
        raise HTTPException(404, detail=f'No DB connection registered for id={dbConfigId}')

    # Check cache first
    cache_path = state.workspace_path / 'schema_cache.json'
    if cache_path.exists():
        import json
        cached = json.loads(cache_path.read_text())
        logger.info('Returning cached schema (use ?refresh=1 to force)')
        return {'tables': cached, 'indexed': True}

    # Introspect via SQLAlchemy reflection
    from sqlalchemy import inspect, MetaData
    inspector = inspect(pool)
    metadata = MetaData()
    metadata.reflect(bind=pool)

    tables: List[Dict[str, Any]] = []
    for table_name in inspector.get_table_names():
        columns = []
        for col in inspector.get_columns(table_name):
            columns.append({
                'name': col['name'],
                'type': str(col['type']),
                'isNullable': bool(col.get('nullable', True)),
                'isPrimaryKey': False,
                'isForeignKey': False,
                'defaultValue': str(col.get('default')) if col.get('default') else None,
            })
        pk_cols = inspector.get_pk_constraint(table_name).get('constrained_columns', [])
        for col in columns:
            if col['name'] in pk_cols:
                col['isPrimaryKey'] = True

        fks = []
        for fk in inspector.get_foreign_keys(table_name):
            for col_name, ref_col in zip(fk['constrained_columns'], fk['referred_columns']):
                fks.append({
                    'column': col_name,
                    'referencedTable': fk['referred_table'],
                    'referencedColumn': ref_col,
                })
                for col in columns:
                    if col['name'] == col_name:
                        col['isForeignKey'] = True

        try:
            import sqlalchemy
            row_count = pool.connect().execute(
                sqlalchemy.text(f'SELECT COUNT(*) FROM "{table_name}"')
            ).scalar()
        except Exception:
            row_count = None

        tables.append({
            'tableName': table_name,
            'columns': columns,
            'primaryKey': pk_cols,
            'foreignKeys': fks,
            'rowCountEstimate': row_count,
        })

    # Cache to disk
    import json
    cache_path.write_text(json.dumps(tables, indent=2, default=str))

    # Index into ChromaDB (Novel #3a — Schema RAG)
    state.rag.index_schema(tables)

    return {'tables': tables, 'indexed': True}
