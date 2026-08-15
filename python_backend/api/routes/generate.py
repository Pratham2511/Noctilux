"""POST /api/generate — NL → SQL pipeline.

Pipeline (per Part 5 of spec):
    1. Intent classification (intent_service)
    2. Ambiguity detection (ambiguity_service) — may return clarification questions
    3. Schema RAG retrieval (rag_service)
    4. Privacy Shield anonymization (privacy_shield) — only in cloud mode
    5. LLM generation (llm_service) — 3-path multi-path reasoning (Novel #17)
    6. Post-processing (validator_service, optimizer_service, confidence_service)
    7. Returns { sql, confidence, alternatives, explanation, narrative, planExplanation, queryNodeId }
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from loguru import logger

from models.requests import GenerateRequest, GenerateResponse
from services.intent_service import IntentClassifier
from services.ambiguity_service import AmbiguityDetector
from services.sql_generator import SQLGenerator
from services.validator_service import Validator
from services.optimizer_service import Optimizer
from services.confidence_service import ConfidenceScorer
from services.narrative_service import NarrativeEngine
from services.plan_explainer import PlanExplainer
from services.glossary_service import GlossaryService

router = APIRouter()


@router.post('/generate', response_model=GenerateResponse)
async def generate(req: GenerateRequest, request: Request) -> GenerateResponse:
    state = request.app.state.qm

    # ─── 1. Intent classification ──────────────────────────────────────
    intent = IntentClassifier().classify(req.nlInput)
    logger.debug(f'Intent: {intent}')

    # ─── 2. Ambiguity detection ─────────────────────────────────────────
    # If the user has not yet answered the disambiguation questions, return them
    ambiguity = AmbiguityDetector(state.memory_store).detect(req.nlInput)
    if ambiguity and not req.disambiguationAnswers:
        return GenerateResponse(
            sql='',
            confidence=0.0,
            alternatives=[],
            explanation='Clarification needed before generating SQL.',
            ambiguityQuestions=[
                {'id': q.id, 'question': q.question, 'options': q.options}
                for q in ambiguity
            ],
        )

    # Persist disambiguation answers as memory (Novel Contribution #7)
    if req.disambiguationAnswers:
        memory = state.memory_store.read()
        for key, value in req.disambiguationAnswers.items():
            memory.disambiguation_rules[key] = value
        state.memory_store.write(memory)

    # ─── 3. Schema RAG retrieval ───────────────────────────────────────
    # Get top-K most relevant tables/columns (not the full schema)
    relevant_schema = state.rag.retrieve_relevant(req.nlInput, top_k=8)

    # ─── 4. Privacy Shield (cloud mode only) ───────────────────────────
    use_cloud = state.llm.should_use_cloud(req.llmMode)
    if use_cloud and state.settings.privacy_shield_enabled:
        anon_schema, token_map = state.privacy_shield.anonymize(relevant_schema)
        prompt_context = anon_schema
    else:
        prompt_context = relevant_schema

    # ─── 5. Multi-path SQL generation (Novel #17) ──────────────────────
    # Semantic Router (Novel #10): check glossary first
    glossary = GlossaryService(state.workspace_path / 'glossary.json')
    routed = glossary.route(req.nlInput)
    if routed:
        # Deterministic path — skip LLM call entirely
        candidates = [routed]
        logger.info(f'Semantic router hit (similarity > 0.80): {routed.sql[:60]}')
    else:
        generator = SQLGenerator(state.llm)
        candidates = await generator.generate_multipath(
            nl_input=req.nlInput,
            schema=prompt_context,
            memory=state.memory_store.read(),
            use_cloud=use_cloud,
        )
        # De-anonymize if cloud mode
        if use_cloud and state.settings.privacy_shield_enabled:
            candidates = [state.privacy_shield.deanonymize_sql(c, token_map) for c in candidates]

    # ─── 6. Post-processing pipeline ──────────────────────────────────
    # Step a: Syntax validation (sqlglot)
    validator = Validator(dialect='postgresql')
    valid_candidates = []
    for c in candidates:
        validated, error = validator.validate_syntax(c.sql)
        if validated:
            valid_candidates.append(c)
        else:
            logger.warning(f'Candidate rejected (syntax): {error}')

    if not valid_candidates:
        return GenerateResponse(
            sql='',
            confidence=0.0,
            alternatives=[],
            explanation='All generated candidates failed syntax validation. Please rephrase your query.',
        )

    # Step b: Semantic validation (hallucination check)
    valid_candidates = [
        c for c in valid_candidates
        if validator.validate_semantic(c.sql, relevant_schema)
    ]

    # Step c: Execution-grounded candidate selection (Novel #17)
    primary, alternatives = ConfidenceScorer().select_primary(valid_candidates)

    # Step d: Query optimization (Novel #18 — plan similarity)
    optimizer = Optimizer(state.history_store)
    optimized_sql, optimization_notes = optimizer.optimize(primary.sql)

    # Step e: Confidence score (Novel #5)
    confidence = ConfidenceScorer().score(
        primary.sql,
        relevant_schema,
        state.memory_store.read(),
    )

    # ─── 7. Plan explainer + Narrative (lazy / on execution) ────────────
    # We pre-compute a brief explanation; the full narrative is generated
    # only after execution (see /api/execute).
    plan_explainer = PlanExplainer(state.llm)

    # ─── 8. Add to query tree (Novel #3, #14) ──────────────────────────
    node_id = state.history_store.append_query_tree_node(
        nl_input=req.nlInput,
        sql=optimized_sql,
        confidence=confidence,
        status='unexecuted',
    )

    return GenerateResponse(
        sql=optimized_sql,
        confidence=confidence,
        alternatives=[
            {'sql': a.sql, 'interpretation': a.interpretation, 'confidence': a.confidence}
            for a in alternatives
        ],
        explanation=optimization_notes or 'SQL generated successfully.',
        queryNodeId=node_id,
    )
