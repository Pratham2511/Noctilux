"""Pydantic request / response models for all backend routes.

These mirror src/types/index.ts (TypeScript shared types).
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field
import uuid


# ─── Common ───────────────────────────────────────────────────────────────
class DBConfig(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    dialect: Literal['postgresql', 'mysql', 'sqlite', 'mssql', 'mongodb']
    host: str
    port: int
    database: str
    user: str
    ssl: bool = False
    poolSize: int = 5


# ─── /api/generate ─────────────────────────────────────────────────────────
class GenerateRequest(BaseModel):
    nlInput: str
    dbConfigId: str
    sessionId: str = 'default'
    llmMode: Optional[Literal['cloud', 'local', 'auto']] = None
    disambiguationAnswers: Optional[Dict[str, str]] = None


class AlternativeSQL(BaseModel):
    sql: str
    interpretation: str
    confidence: float


class AmbiguityQuestionOut(BaseModel):
    id: str
    question: str
    options: List[str]


class GenerateResponse(BaseModel):
    sql: str
    confidence: float
    alternatives: List[AlternativeSQL] = []
    explanation: str
    narrative: Optional[str] = None
    planExplanation: Optional[str] = None
    ambiguityQuestions: Optional[List[AmbiguityQuestionOut]] = None
    queryNodeId: Optional[str] = None


# ─── /api/execute ─────────────────────────────────────────────────────────
class ExecuteRequest(BaseModel):
    sql: str
    dbConfigId: str
    rowLimit: Optional[int] = None
    timeoutSeconds: Optional[int] = None


class RegressionAlert(BaseModel):
    percentSlower: float
    baselineMs: float
    currentMs: float
    possibleCauses: List[str]
    suggestedFix: Optional[str] = None


# ─── /api/schema ──────────────────────────────────────────────────────────
class ColumnInfo(BaseModel):
    name: str
    type: str
    isNullable: bool
    isPrimaryKey: bool
    isForeignKey: bool
    defaultValue: Optional[str] = None


class ForeignKeyInfo(BaseModel):
    column: str
    referencedTable: str
    referencedColumn: str


class SchemaInfo(BaseModel):
    tableName: str
    columns: List[ColumnInfo]
    primaryKey: Optional[List[str]] = None
    foreignKeys: Optional[List[ForeignKeyInfo]] = None
    rowCountEstimate: Optional[int] = None


class SchemaResponse(BaseModel):
    tables: List[SchemaInfo]
    indexed: bool


# ─── /api/schema/impact ───────────────────────────────────────────────────
class ImpactRequest(BaseModel):
    ddl: str
    dbConfigId: str


class BreakageEntry(BaseModel):
    queryId: str
    nlInput: str
    reason: str


class Breakage(BaseModel):
    willBreak: List[BreakageEntry]
    needsReview: List[BreakageEntry]
    unaffected: int


class ImpactResponse(BaseModel):
    ddl: str
    affectedObject: Dict[str, str]
    breakage: Breakage
    autoRewriteAvailable: int


# ─── /api/robustness ──────────────────────────────────────────────────────
class RobustnessQueryItem(BaseModel):
    id: str
    sql: str
    nlInput: str


class RobustnessRequest(BaseModel):
    dbConfigId: str
    querySet: List[RobustnessQueryItem]


class PerturbationResult(BaseModel):
    perturbationType: str
    breakageRate: float
    hallucinationRate: float
    accuracyDegradation: float
    affectedQueries: List[str] = []


class RobustnessReport(BaseModel):
    overallScore: float
    totalQueries: int
    survivedAll: int
    perPerturbation: List[PerturbationResult]
    mostFragile: str
    mostResilient: str
    recommendations: List[str] = []


# ─── /api/glossary ────────────────────────────────────────────────────────
class GlossaryTerm(BaseModel):
    term: str
    sqlTemplate: str
    aliases: List[str] = []
    description: str = ''
    dialect: str = 'postgresql'
    owner: str = ''
    lastValidated: str = ''


class JoinPath(BaseModel):
    fromTable: str
    toTable: str
    viaColumn: str
    cost: float = 1.0


class GlossaryStore(BaseModel):
    terms: List[GlossaryTerm]
    joinPaths: List[JoinPath] = []
