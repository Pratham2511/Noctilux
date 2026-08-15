"""DB connection pool manager — one SQLAlchemy Engine per DBConfig.

Per Part 8 of spec:
    pool_size=5, max_overflow=10, pool_timeout=30,
    pool_recycle=1800, pool_pre_ping=True
"""

from __future__ import annotations

from typing import Dict, Optional
from urllib.parse import quote_plus

from sqlalchemy import create_engine, Engine
from sqlalchemy.pool import QueuePool
from loguru import logger


class DBPoolManager:
    def __init__(self) -> None:
        self._pools: Dict[str, Engine] = {}

    def register(self, db_config_id: str, connection_url: str, pool_size: int = 5) -> Engine:
        engine = create_engine(
            connection_url,
            poolclass=QueuePool,
            pool_size=pool_size,
            max_overflow=10,
            pool_timeout=30,
            pool_recycle=1800,
            pool_pre_ping=True,
        )
        self._pools[db_config_id] = engine
        logger.info(f'Registered DB pool for {db_config_id}')
        return engine

    def get(self, db_config_id: str) -> Optional[Engine]:
        return self._pools.get(db_config_id)

    def dispose(self, db_config_id: str) -> None:
        engine = self._pools.pop(db_config_id, None)
        if engine:
            engine.dispose()

    def dispose_all(self) -> None:
        for engine in self._pools.values():
            engine.dispose()
        self._pools.clear()


def build_connection_url(dialect: str, host: str, port: int,
                         database: str, user: str, password: str,
                         ssl: bool = False) -> str:
    """Build a SQLAlchemy connection URL.

    Passwords come from VS Code SecretStorage via env var QM_DB_PASSWORD_<ID>.
    """
    pwd = quote_plus(password) if password else ''
    auth = f'{user}:{pwd}' if pwd else user

    if dialect == 'postgresql':
        return f'postgresql+psycopg2://{auth}@{host}:{port}/{database}'
    if dialect == 'mysql':
        return f'mysql+pymysql://{auth}@{host}:{port}/{database}'
    if dialect == 'sqlite':
        return f'sqlite:///{database}'  # database = file path
    if dialect == 'mssql':
        return f'mssql+pyodbc://{auth}@{host}:{port}/{database}'
    raise ValueError(f'Unsupported dialect: {dialect}')
