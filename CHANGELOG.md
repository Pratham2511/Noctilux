# Changelog

## [1.1.4] — 2026-08-19

### Fixed — Chat input invisible + connection form not saving

**Bug 1 (chat input):** The chat tab's message list and input row shared a
scrolling flex container without `min-h-0`, so the flex item refused to
shrink below its content height and the query text box was pushed out of
view — the chat panel opened with no visible place to type.

**Fix:** The chat tab now uses a dedicated non-scrolling flex column
(`min-h-0` on the messages area, `shrink-0` on the input row), and the
textarea / select / button carry explicit VS Code theme colors
(`--vscode-input-background`, `--vscode-button-background`, etc.) so they
render correctly regardless of Tailwind utility generation.

**Bug 2 (connection form):** The Connections tab form posted
`CONNECTION_FORM_SAVE` / `STORE_DB_PASSWORD` webview messages that had no
handler in `VerbisPanel` — saving a connection from the webview silently
did nothing.

**Fix:** `VerbisPanel` now handles both messages: connections are appended
to `.qmind/config.json` and passwords are stored in VS Code SecretStorage
(OS keychain). The new connection is auto-set as active.

### Added — Live connection list in chat

- New `GET_CONNECTIONS` / `CONNECTIONS_UPDATED` webview messages.
- The chat panel's database selector is now populated with real saved
  connections (instead of a hardcoded "Default DB") and stays in sync when
  connections are added via the command palette or the Connections tab.

---

## [1.1.3] — 2026-08-18

### Fixed — Backend startup crashes + blank chat UI + empty sidebar

**Bug 1 (backend failed to start):** `services/llm_service.py` was missing
the `LLMRouter` class and `LLMResponse` dataclass that 6 modules import
(`api/dependencies.py`, `sql_generator`, `nosql_generator`,
`narrative_service`, `plan_explainer`, `federated_service`) — the backend
died at import time with `ImportError: cannot import name 'LLMRouter'`.

**Bug 2 (backend failed to start, round 2):** `models/requests.py` was
missing 8 model classes imported by `schema_impact`, `robustness_service`
and `glossary_service` (`BreakageEntry`, `ImpactResponse`,
`RobustnessQueryItem`, `PerturbationResult`, `RobustnessReport`,
`GlossaryTerm`, `JoinPath`, `GlossaryStore`).

**Bug 3 (blank chat panel):** `VerbisPanel` loaded
`webview/dist/assets/main.js` + `main.css`, but Vite emits `index.js` +
`index.css` — the script 404'd and React never mounted.

**Bug 4 (empty sidebar):** `package.json` declares `verbis.connections` /
`verbis.schema` / `verbis.history` views but no tree providers were
registered.

**Fix:**
- Added `LLMRouter` + `LLMResponse` to `llm_service.py` (never raises;
  errors land in `LLMResponse.error`; falls back Gemini → Groq → Ollama).
- Added the 8 missing Pydantic models to `models/requests.py`.
- `VerbisPanel.getHtml()` now loads the correct Vite asset filenames.
- New `src/views/SidebarProviders.ts` with `ConnectionsProvider`,
  `SchemaTreeProvider`, `HistoryProvider`, registered in `extension.ts`
  and refreshed when the backend becomes ready.

---

## [1.1.2] — 2026-08-18

### Chore

- Republished the v1.1.1 packaging fix to the VS Code Marketplace
  (no code changes beyond version bump).

---

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
