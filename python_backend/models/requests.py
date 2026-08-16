from pydantic import BaseModel
from typing import Optional


class GenerateRequest(BaseModel):
    nl_query: str
    schema_context: str
    dialect: str = "postgresql"
    query_type: str = "sql"          # "sql" | "nosql"
    provider: str = "gemini"         # "gemini" | "groq" | "local"
    api_key: str = ""                # from VS Code SecretStorage — never stored
    session_id: Optional[str] = None
    db_config_id: Optional[str] = None


class ExecuteRequest(BaseModel):
    sql: str
    connection_id: str
    row_limit: int = 500


class ImpactRequest(BaseModel):
    proposed_ddl: str
    schema_context: str


class RobustnessRequest(BaseModel):
    query_set: list[dict]
    schema_context: str


class GlossaryRequest(BaseModel):
    term: str
    sql_template: str
    aliases: list[str] = []
    description: str = ""
    dialect: str = "postgresql"
