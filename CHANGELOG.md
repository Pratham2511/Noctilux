# Changelog

## [1.0.2] — 2026-08-16

### Changed
- Removed provider-specific API key prefix validation (`AIza…`, `gsk_…`) — keys from any provider (Gemini, Claude, Kimi, OpenAI, …) are now accepted. Only a basic non-empty/length sanity check remains.
- README updated to document multi-provider API key support.

## [1.0.1] — 2026-08-16

### Fixed
- Extension crashed on activation (`Cannot find module 'node-fetch'`) — replaced with Node's built-in global `fetch`. The extension now has zero runtime dependencies.

## [1.0.0] — 2026-08-16

### Added
- Natural language to SQL and NoSQL query generation (Gemini 2.5 Flash)
- Privacy Shield: schema anonymization before cloud LLM calls
- Adaptive User Preference Memory across sessions
- Query Genealogy with interactive visual branching (ReactFlow DAG)
- Collaborative annotations on SQL lines and result cells
- Schema Change Impact Predictor with auto-rewrite
- Dynamic PII masking in query results (GDPR/CCPA/HIPAA)
- Business Glossary with deterministic semantic routing
- Schema Evolution Robustness Testing Suite
- Execution Plan plain-English explainer
- Analytical Narrative Engine (data storytelling from results)
- Performance Regression Detector across sessions
- Federated SQL + NoSQL querying (PostgreSQL + MongoDB)
- Project-scoped persistent workspaces (.qmind/)
- Secure API key storage via VS Code SecretStorage (OS keychain)
- Support for PostgreSQL, MySQL, SQLite, SQL Server, MongoDB
- Local LLM mode via Ollama (fully offline)
