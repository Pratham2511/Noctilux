# Changelog

## [1.1.1] — 2026-08-17

### Fixed — Backend install failure on packaged extension

**Bug:** `uv failed (exit 2): error: File not found:
.python_backend/requirements.txt` — the extension's `.vscodeignore` was
excluding `python_backend/**` entirely, so when Verbis was installed from the
.vsix, none of the Python source files (`main.py`, `services/*.py`,
`api/routes/*.py`, `requirements.txt`) were present in the extension folder.
The `BackendInstaller` then failed because `requirements.txt` was missing.

**Fix:**
- Updated `.vscodeignore` to keep all `python_backend/` source files (they are
  required for the backend subprocess to run). Only exclude bulky/transient
  artifacts: `__pycache__/`, `venv/`, `.pytest_cache/`, `.mypy_cache/`,
  `.ruff_cache/`.
- Added a pre-flight guard in `BackendInstaller.install()` that throws a clear,
  actionable error if `requirements.txt` is missing — instead of letting
  `uv` fail with a cryptic "File not found" message. The error message tells
  the user to reinstall from the Marketplace or report the issue.

---

## [1.1.0] — 2026-08-17

### Added — Three Major Upgrades + 7 Critical Fixes (A-G)

#### Upgrade 1 — Few-Shot LLM Intent Guard with LRU Cache
- Replaced keyword-based intent classification with few-shot LLM prompting
- 15+ DATABASE examples and 15+ OFFTOPIC examples at temperature=0
- Correctly passes "weather data from sensors table" → DATABASE (context override)
- Correctly blocks "what is the weather today" → OFFTOPIC
- 200-entry LRU cache keyed on (message, provider) — repeated queries are free
- Cache stores full (intent, message) tuple — same off-topic query shows same response each time
- Fails open to DATABASE on any exception — never blocks a valid query

#### Upgrade 2 — Auto-Install Backend Dependencies (uv + globalStorageUri)
- BackendInstaller class auto-creates Python venv on first activation
- Venv stored in `context.globalStorageUri` — survives extension updates
- Uses `uv` for 10x faster installs (falls back to pip if uv unavailable)
- "Install Now / Later" dialog + progress notification
- `verbis.installBackend` command for manual re-installation
- Marker file (`verbis_ready`) skips install on subsequent activations
- Cross-platform Python path detection (Windows + Linux/Mac)
- Slim requirements.txt (~120MB, no PyTorch/spaCy/onnxruntime)

#### Upgrade 3 — Text2Schema (NL → Database Schema)
- New `python_backend/services/schema_creator_service.py` implementing arXiv 2503.23886
- Structured JSON intermediate format (tables, columns, relationships, indexes)
- Dialect-aware DDL generation (PostgreSQL / MySQL / SQLite)
- Foreign keys emitted as TABLE-LEVEL CONSTRAINT clauses (portable across dialects)
- Mermaid ER diagram auto-generation
- Iterative refinement ("add a payments table" updates existing schema)
- New `/api/schema/create` and `/api/schema/refine` routes
- New `SchemaCreator.tsx` component with 3 stages: input → preview → done
- "Copy DDL" and "Download as .sql" buttons for user-friendliness
- "Create DB" tab added to webview

#### Fix A — cachetools added explicitly to requirements.txt
Verified that neither chromadb 1.5.9 nor openai directly requires cachetools.
Added `cachetools>=5.0.0` explicitly (20KB, eliminates silent crash risk).

#### Fix B — clear_intent_cache wired via /api/intent/cache/clear endpoint
- New POST endpoint `/api/intent/cache/clear`
- Called from `verbis.setApiKey` handler after storing new key
- Called from `verbis.clearApiKey` handler after deleting key
- Called on `verbis.llm.provider` configuration change (provider switch)

#### Fix C — Schema cache refreshed after SCHEMA_EXECUTE
- New POST endpoint `/api/schema/refresh` (Fix F)
- Deletes stale `schema_cache.json` + re-indexes ChromaDB
- Called after DDL execution so chat knows about new tables
- Wrapped in try/catch — non-fatal if refresh fails

#### Fix D — Full connection-selection flow
- `verbis.selectConnection` command with quick-pick UI
- `verbis.addConnection` auto-sets new connection as active
- `VerbisPanel.setActiveConnection()` + `resolveConnectionId()` helper
- Falls back to first connection in config.json if no active connection set
- SCHEMA_EXECUTE uses `resolveConnectionId()` — not hardcoded 'default'

#### Fix E — No floating promises in onDidChangeConfiguration
- Uses sync callback + explicit `.then(noop, errHandler)`
- Avoids eslint `no-floating-promises` warning
- Errors logged to `console.warn` instead of being silently swallowed

#### Fix F — /api/schema/refresh is a POST endpoint
- Cache invalidation is semantically a mutation
- POST is more robust than relying on requestJson's implicit GET-with-no-body behavior
- Takes JSON body `{ db_config_id: string }`

#### Fix G — Uses existing `id` variable in verbis.addConnection
- The handler already declares `const id = crypto.randomUUID()` (line 178)
- Used that exact variable name when calling `setActiveConnection(id)`
- Did not invent a new variable like `connectionId` or `newId`

### Changed
- Bumped version from 1.0.2 to 1.1.0
- BackendManager constructor now takes `pythonExe` as 4th parameter (from BackendInstaller)
- Removed `getPythonPath()` helper from BackendManager.ts (venv managed by BackendInstaller)
- Removed `fs` import from BackendManager.ts (no longer needed)
- `verbis.openQueryTree` command renamed to `verbis.openTree` (per spec)

### New Commands
- `Verbis: Install / Reinstall Backend` — Manually trigger backend setup
- `Verbis: Select Database Connection` — Quick-pick UI for switching connections

### New Endpoints
- `POST /api/intent/cache/clear` — Clear intent classification cache
- `POST /api/schema/create` — Generate schema from NL description
- `POST /api/schema/refine` — Apply NL refinement to existing schema
- `POST /api/schema/refresh` — Force-refresh schema cache + ChromaDB index

### New Files
- `src/services/BackendInstaller.ts` — Auto-installer class
- `python_backend/services/schema_creator_service.py` — Text2Schema service
- `python_backend/api/routes/schema_create.py` — Schema creation routes
- `python_backend/requirements-optional.txt` — Heavy optional deps (PyTorch, spaCy)
- `webview/src/components/SchemaCreator.tsx` — Schema creation UI

---

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
