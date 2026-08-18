# 🌙 Verbis — Intelligent Database Assistant (VS Code Extension)

**Publisher:** pratham2511 · **Version:** 1.1.5 · **License:** MIT
**Repository:** https://github.com/Pratham2511/Verbis-Intelligent-Database-Assistant

> *Eliminate the barrier between human intent and database insight by transforming natural language into precise, optimized, safe, and explainable database operations — with team collaboration and enterprise-grade privacy — entirely within the developer's workspace.*

Verbis is an LLM-based intelligent database assistant delivered as a VS Code desktop extension. It generates, optimizes, validates, and executes SQL (and NoSQL) queries, explains results, monitors performance continuously, enforces enterprise-grade privacy, and learns from user behavior — all within the developer's existing workspace.

The default LLM provider is **Google Gemini 2.5 Flash** (free tier available — see [Get a free API key](https://aistudio.google.com/app/apikey)). **Groq** and **Ollama (local)** are also supported, and API keys from **any provider — Gemini, Claude, Kimi, OpenAI, and others — are accepted** without format restrictions. Your API key is stored in the OS keychain via VS Code SecretStorage and is **never written to any file on disk**.

---

## 🆕 What's New in v1.1.x

### v1.1.5 — Sidebar chat (Copilot-Chat-style)

- **New:** The Verbis chat now lives in the **Verbis activity-bar container as a native sidebar view** (`verbis.chatView`, a `WebviewViewProvider`) — same UX as Copilot Chat / Cline. Click the Verbis icon in the activity bar and the chat is right there next to your code; no more opening a separate editor tab.
- `Verbis: Open Chat` (`Ctrl+Shift+Q`) now focuses the sidebar chat view. The old editor-tab panel is still available via `Verbis: Open Chat in Editor Panel` if you prefer a full-width view.
- The sidebar chat shares the same React bundle and message protocol as the editor panel — connections, backend status, SQL generation, execution, glossary, and Text2Schema all work identically in both hosts.
- Connection selection (`verbis.selectConnection`, `verbis.addConnection`) now syncs to both the sidebar chat and the editor panel.

### v1.1.4 — Chat input + connection flow fixes

- **Fixed (chat input invisible):** The chat tab's message list and input row shared a scrolling flex container without `min-h-0`, so the flex item refused to shrink below its content height and the text box was pushed out of view. The chat tab now uses a dedicated non-scrolling flex column (`min-h-0` + `shrink-0` input row), and the textarea/select/button carry explicit VS Code theme colors (`--vscode-input-background` etc.) so they render even if utility classes are stripped.
- **Fixed (connection form did nothing):** The Connections tab form posted `CONNECTION_FORM_SAVE` / `STORE_DB_PASSWORD` messages that no handler existed for — saving a connection from the webview silently failed. `VerbisPanel` now handles both: connections are appended to `.qmind/config.json` and passwords go to VS Code SecretStorage (OS keychain), exactly as documented.
- **Improved:** The chat panel's database selector is now populated with your real saved connections (via new `GET_CONNECTIONS` / `CONNECTIONS_UPDATED` messages) instead of a hardcoded "Default DB" option, and stays in sync when connections are added.

### v1.1.3 — Backend startup crashes + blank UI hotfix

- **Fixed (backend failed to start):** `services/llm_service.py` was missing the `LLMRouter` class and `LLMResponse` dataclass that 6 modules import (`api/dependencies.py`, `sql_generator`, `nosql_generator`, `narrative_service`, `plan_explainer`, `federated_service`) — the backend died at import time with `ImportError: cannot import name 'LLMRouter'`.
- **Fixed (backend failed to start, round 2):** `models/requests.py` was missing 8 model classes imported by `schema_impact`, `robustness_service` and `glossary_service` (`BreakageEntry`, `ImpactResponse`, `RobustnessQueryItem`, `PerturbationResult`, `RobustnessReport`, `GlossaryTerm`, `JoinPath`, `GlossaryStore`).
- **Fixed (blank chat panel):** `VerbisPanel` loaded `webview/dist/assets/main.js` + `main.css`, but Vite emits `index.js` + `index.css` — the script 404'd and React never mounted.
- **Fixed (empty sidebar):** `package.json` declares `verbis.connections` / `verbis.schema` / `verbis.history` views but no tree providers were registered. Added `src/views/SidebarProviders.ts` (Connections, Schema, Recent Queries) and registered them in `extension.ts`.

### v1.1.2 — Marketplace republish

- Republished the v1.1.1 packaging fix to the VS Code Marketplace (no code changes beyond version bump).

### v1.1.1 — Backend install hotfix

- **Fixed:** `.vscodeignore` was excluding `python_backend/**` entirely, so when Verbis was installed from the `.vsix`, none of the Python source files (`main.py`, `services/*.py`, `requirements.txt`) were present. The `BackendInstaller` then failed with a cryptic `uv failed (exit 2): File not found` error.
- **Fix:** `.vscodeignore` now keeps all Python source files in the package and only excludes bulky/transient artifacts (`__pycache__/`, `venv/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`). Added a pre-flight guard in `BackendInstaller.install()` that throws a clear, actionable error if `requirements.txt` is missing.

### v1.1.0 — Three major upgrades + 7 critical fixes (A–G)

#### 1. Few-Shot LLM Intent Guard (replaces keyword filtering)

Natural-language queries are now classified as `DATABASE` or `OFFTOPIC` using a few-shot LLM prompt with 15+ explicit examples at `temperature=0`. This correctly handles polysemous words that keyword filters get wrong:

| Query | Old (keyword) | New (few-shot LLM) |
|---|---|---|
| `"weather data from sensors table"` | ❌ Blocked (contains "weather") | ✅ Passed (asks about data in a table) |
| `"what is the weather today"` | ❌ Passed | ✅ Blocked (off-topic) |
| `"calculate average revenue"` | ✅ Passed | ✅ Passed |

A **200-entry LRU cache** (keyed on `(message, provider)`) ensures repeated queries are free. Cache stores the full `(intent, message)` tuple so the same off-topic query shows the same polite response each time. The cache is **auto-cleared** when you set/clear an API key or switch LLM provider (via the new `/api/intent/cache/clear` endpoint).

#### 2. Auto-Install Backend Dependencies (`uv` + `globalStorageUri`)

Users no longer need to open a terminal — Verbis **auto-creates a Python venv** on first activation and installs all dependencies (~120MB, ~60 seconds) with a progress notification.

- The venv lives in `context.globalStorageUri` — **survives extension updates** (won't force reinstalls)
- Uses `uv` for 10× faster installs (falls back to `pip` if `uv` unavailable)
- "Install Now / Later" dialog + `Verbis: Install / Reinstall Backend` command
- `verbis_ready` marker file skips install on subsequent activations
- Slim `requirements.txt` — **no PyTorch, no spaCy, no onnxruntime** (PyTorch-heavy deps moved to `requirements-optional.txt`)

#### 3. Text2Schema — Create Databases from Natural Language (arXiv 2503.23886)

Verbis is the **first VS Code extension** to implement Text2Schema — converting a natural-language description of your data needs into a complete normalized database schema.

```
User: "I want a school management system with students, teachers,
        courses, attendance, and grades"
Verbis: Generates schema JSON → DDL → live ER diagram
User:   "Add a library books table and a fee payments table"
Verbis: Refines the schema, shows the updated ER diagram
User:   "Looks good, create it"
Verbis: Executes the DDL on your connected database
```

- **Structured JSON intermediate** — enables ER diagram + iterative refinement
- **Dialect-aware DDL** — PostgreSQL, MySQL, SQLite (auto-increment types handled per-dialect)
- **Portable foreign keys** — emitted as `CONSTRAINT ... FOREIGN KEY ... REFERENCES ...` table-level clauses (works in PostgreSQL/MySQL/SQLite — inline FK syntax breaks in Postgres/MySQL)
- **Mermaid ER diagram** auto-generated from the schema JSON
- **Iterative refinement** — "add a payments table" updates the existing schema without losing prior tables
- **Copy DDL** + **Download as .sql** buttons in the UI
- New endpoints: `POST /api/schema/create`, `POST /api/schema/refine`, `POST /api/schema/refresh`
- After DDL execution, Verbis **auto-refreshes the schema cache + ChromaDB index** so the chat panel immediately knows about the new tables (no hallucinated SQL)

#### 4. Full Connection-Selection Flow

Multi-database users can now switch connections via the `Verbis: Select Database Connection` command (quick-pick UI). New connections are auto-set as active when added. `SCHEMA_EXECUTE` resolves the active connection via `resolveConnectionId()` with fallback to the first connection in `config.json` — no more hardcoded `'default'`.

#### 5. Seven Critical Fixes (A–G)

| Fix | What it does |
|---|---|
| **A** | `cachetools>=5.0.0` added EXPLICITLY to `requirements.txt` — verified that neither `chromadb` 1.5.9 nor `openai` directly requires it (relying on transitive deps is fragile) |
| **B** | `clear_intent_cache()` wired via `/api/intent/cache/clear` endpoint + 3 call sites (setApiKey, clearApiKey, onDidChangeConfiguration) — stale cached classifications no longer persist after provider/key switches |
| **C** | Schema cache + ChromaDB index auto-refreshed after `SCHEMA_EXECUTE` — chat panel never hallucinates about newly-created tables |
| **D** | Full connection-selection flow — `verbis.selectConnection` command + `setActiveConnection()` + `resolveConnectionId()` helper |
| **E** | `onDidChangeConfiguration` uses sync callback + `.then(noop, errHandler)` — NO floating promises, NO silently-swallowed errors (eslint-friendly) |
| **F** | `/api/schema/refresh` is a POST endpoint (not a GET query param) — semantically a mutation, more robust than relying on `requestJson`'s implicit GET-with-no-body behavior |
| **G** | `verbis.addConnection` uses the EXISTING `id` variable declared as `const id = crypto.randomUUID()` — doesn't invent a new variable name |

---

## 📦 Repository Layout

```
verbis/
├── package.json                  # VS Code extension manifest (marketplace-ready)
├── tsconfig.json
├── .vscodeignore                 # Ships python_backend/ source; excludes caches/venvs
├── .gitignore
├── CHANGELOG.md                  # [1.0.0] — 2026-08-16
├── LICENSE                       # MIT
├── README.md                     # ← this file
├── CONTRIBUTING.md
├── media/
│   ├── icon.png                  # 128×128 marketplace icon (add manually)
│   ├── icon.svg                  # source SVG
│   └── sidebar.svg               # 16×16 activity-bar icon
│
├── src/                          # Extension host (TypeScript, runs in Node.js)
│   ├── extension.ts              # Activation: first-run API key prompt + command registration
│   ├── BackendManager.ts         # Python subprocess lifecycle (start/stop/restart)
│   ├── panels/
│   │   ├── VerbisPanel.ts     # Main webview (chat + SQL + results)
│   │   ├── SchemaPanel.ts        # Schema explorer + ER diagram viewer
│   │   └── QueryTreePanel.ts     # ReactFlow DAG panel
│   ├── services/
│   │   ├── SecretsService.ts     # Gemini / Groq / DB-password storage (OS keychain)
│   │   ├── WorkspaceService.ts   # .qmind/ file I/O
│   │   └── BackendClient.ts      # HTTP client (forwards api_key + provider to backend)
│   ├── views/
│   │   ├── ChatViewProvider.ts   # Sidebar chat webview (Copilot-Chat-style)
│   │   └── SidebarProviders.ts   # Connections / Schema / Recent Queries tree views
│   └── types/index.ts            # Shared TypeScript interfaces + WebviewMessageType union
│
├── webview/                      # React app (Vite-bundled, runs in webview sandbox)
│   ├── package.json
│   ├── vite.config.ts            # CSP-safe (no eval, no inline scripts)
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx               # Routes Chat / Schema / Tree / Glossary / Robustness / Connections
│       ├── index.css             # Tailwind + custom Verbis styles
│       ├── vscode.ts             # acquireVsCodeApi + postMessage helpers + useVsCode() hook
│       └── components/
│           ├── ChatPanel.tsx
│           ├── MessageBubble.tsx
│           ├── SQLCodeBlock.tsx        # CodeMirror 6 + annotation gutter
│           ├── ResultTable.tsx         # Paginated grid + cell annotations
│           ├── ConfidenceBar.tsx       # Novel Contribution #5
│           ├── NarrativeCard.tsx       # Novel Contribution #12
│           ├── QueryTreeView.tsx      # ReactFlow DAG (Novel #14)
│           ├── GlossaryEditor.tsx      # Novel Contribution #10
│           ├── ConnectionForm.tsx
│           ├── ApiKeySettings.tsx      # ← Gemini + Groq API key entry UI
│           └── RobustnessReport.tsx    # Novel Contribution #16
│
└── python_backend/               # Core intelligence engine (Python 3.11+, FastAPI)
    ├── main.py                   # FastAPI app, lifespan, binds 127.0.0.1:8765
    ├── requirements.txt           # >= constraints, all deps pinned
    ├── config.py                 # Pydantic BaseSettings
    ├── api/
    │   ├── dependencies.py       # DB pool, LLM, ChromaDB client wiring
    │   └── routes/
    │       ├── health.py
    │       ├── generate.py       # POST /api/generate (forwards api_key + provider to LLM)
    │       ├── execute.py        # POST /api/execute
    │       ├── schema.py         # GET  /api/schema
    │       ├── impact.py         # POST /api/schema/impact
    │       ├── robustness.py     # POST /api/robustness
    │       └── glossary.py       # GET/POST /api/glossary
    ├── models/
    │   └── requests.py           # GenerateRequest with provider + api_key fields
    ├── services/                 # 18 backend services
    │   ├── llm_service.py        # ← AsyncOpenAI: Gemini / Groq / Ollama
    │   ├── intent_service.py
    │   ├── ambiguity_service.py
    │   ├── privacy_shield.py
    │   ├── rag_service.py
    │   ├── sql_generator.py
    │   ├── nosql_generator.py
    │   ├── federated_service.py
    │   ├── validator_service.py
    │   ├── optimizer_service.py
    │   ├── confidence_service.py
    │   ├── execution_service.py
    │   ├── plan_explainer.py
    │   ├── perf_tracker.py
    │   ├── narrative_service.py
    │   ├── pii_service.py
    │   ├── schema_impact.py
    │   ├── glossary_service.py
    │   └── robustness_service.py
    └── core/
        ├── prompt_builder.py
        ├── memory_store.py
        ├── history_store.py
        └── db_pool.py
```

---

## 🔑 Setting Your API Key

Verbis needs an LLM provider API key to generate SQL queries. The default provider is **Google Gemini** (free tier), and keys from **any provider — Gemini, Claude, Kimi, OpenAI, Groq, and others — are accepted**; no provider-specific key format is enforced. There are three ways to enter your key:

### Option A — First-run welcome prompt

On the very first activation, Verbis shows an information message:

> *Welcome to Verbis! A free Gemini API key is needed to generate queries.*

Click **Set API Key** to paste your key directly, or **Get Free Key** to open [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) in your browser.

### Option B — From the Command Palette

Run **`Verbis: Set Gemini API Key`** from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`). You'll be asked which provider (`gemini` or `groq`) you're setting a key for, then prompted to paste it.

Any key format is accepted — paste the full key exactly as your provider shows it. The only check is a basic sanity check (non-empty, reasonable length); there is no prefix validation.

### Option C — From the Webview Settings Panel

Open the **Connections** tab in the Verbis webview. The **API Keys** card at the top lets you paste any provider's key (Gemini, Claude, Kimi, OpenAI, Groq, …) into a password-masked input. The "Get free key ↗" links jump straight to the relevant provider's API-key page.

### Removing the key

Run **`Verbis: Remove API Key`** from the Command Palette. A modal confirmation is required.

### Where the key lives

- **OS keychain only** (via VS Code SecretStorage). It is **never** written to `.qmind/`, `config.json`, or any other file on disk.
- The Python backend receives the key **per-request** in the JSON body of `POST /api/generate`. It is not stored in any server-side environment variable or file.
- The active key is resolved from the `verbis.llm.provider` setting (see below): `gemini` returns the Gemini key, `groq` returns the Groq key.

---

## ✨ The 18 Novel Research Contributions

| # | Contribution | Component | Status |
|---|---|---|---|
| 1  | Adaptive User Preference Memory | Component 3b (ASIM) | ✅ Implemented |
| 2  | Privacy Shield for Cloud LLMs (Schema Anonymization) | Component 4 | ✅ Implemented (AES-256-GCM) |
| 3  | Query Genealogy (Version Control for Queries) | Component 8 + history_store | ✅ Implemented |
| 4  | Federated SQL + NoSQL NL Querying | Component 5 (federated_service) | ✅ Implemented (Pandas merge) |
| 5  | Confidence-Calibrated Output with Alternative Interpretations | Component 6 Step 5 | ✅ Implemented |
| 6  | Execution Plan Plain-Language Explainer | Component 7 | ✅ Implemented (LLM-driven) |
| 7  | Ask-Once Disambiguation Memory | Component 2 | ✅ Implemented (memory.json) |
| 8  | Project-Scoped Persistent Workspaces (.qmind/) | Component 8 | ✅ Implemented |
| 9  | Schema Change Impact Predictor | Component 9 | ✅ Implemented (sqlglot AST) |
| 10 | Semantic Layer with Business Glossary and Auto-Discovery | Component 10 | ✅ Implemented |
| 11 | Performance Regression Detector | Component 7 | ✅ Implemented (perf_log.json) |
| 12 | Analytical Narrative Engine | Component 7 | ✅ Implemented (LLM-driven) |
| 13 | Dynamic PII Masking in Query Results | Component 7 | ✅ Implemented (Presidio + regex) |
| 14 | Interactive Query Tree with Visual Branching (DAG) | Component 11 | ✅ Implemented (ReactFlow) |
| 15 | Collaborative Annotations on SQL and Result Cells | Component 12 | ✅ Implemented |
| 16 | Schema Evolution Robustness Testing Suite | Component 13 | ✅ Implemented (EvoSchema) |
| 17 | Multi-Path Reasoning with Execution-Grounded Candidate Selection | Component 5 + 6 | ✅ Implemented (3-path) |
| 18 | Query Plan Similarity Optimization (Plan-Tree-Based) | Component 6 Step 4 | ✅ Implemented (APTED) |

---

## 🏗️ Architecture Overview

```
flowchart TD
    subgraph VSCODE["VS Code Extension (UI Layer)"]
        CP["Chat Panel (NL Input + Narrative)"]
        QE["Query Editor (CodeMirror 6 + Annotations)"]
        SE["Schema / ER Diagram Viewer"]
        QT["Query Tree DAG (ReactFlow)"]
        AK["API Key Settings (Gemini / Groq)"]
    end

    subgraph EH["Extension Host (TypeScript)"]
        PM["postMessage Bridge"]
        SS["SecretStorage (OS keychain)"]
        BLM["Backend Lifecycle Manager"]
    end

    subgraph PY["Python Backend (FastAPI — localhost:8765)"]
        GEN["SQL / NoSQL Generator"]
        PP["Post-Processing Pipeline (Validate / Rank / Optimize / Score)"]
        EX["Execution & Intelligence Engine"]
    end

    subgraph EXT["External"]
        GEMINI["Gemini 2.5 Flash (default)"]
        GROQ["Groq (llama-3.3-70b-versatile)"]
        OLLAMA["Ollama Local (sqlcoder)"]
        DB["Databases (PostgreSQL / MySQL / SQLite / MongoDB)"]
    end

    CP & QE & SE & QT & AK --> PM
    PM <--> EH
    EH --> BLM
    BLM --> PY
    SS -->|api_key per request| PY
    PY --> GEMINI
    PY --> GROQ
    PY --> OLLAMA
    PY --> GEN --> PP --> EX
    EX --> DB
```

**Key security property:** the API key never touches disk. It is resolved from VS Code SecretStorage on every `/api/generate` call, attached to the request body in `BackendClient.ts`, and forwarded by `routes/generate.py` directly into `llm_service.generate_sql(...)`.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+
- **Python** 3.11+
- **VS Code** 1.85+
- A free **Gemini API key** from [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) (or an API key from any other supported provider)
- *(optional)* **Ollama** for fully-offline local LLM mode
- *(optional)* **PostgreSQL** / **MySQL** / **MongoDB** for live query execution

### 1. Install dependencies

```bash
git clone https://github.com/Pratham2511/Verbis-Intelligent-Database-Assistant.git
cd Verbis-Intelligent-Database-Assistant

# Extension host (TypeScript)
npm install

# Webview (React)
cd webview
npm install
cd ..

# Python backend — only needed for local dev. End users: Verbis auto-installs
# the venv on first activation via BackendInstaller (see "Auto-install" above).
cd python_backend
pip install -r requirements.txt
cd ..
```

### 2. Build the webview

```bash
cd webview
npm run build          # produces webview/dist/
cd ..
```

### 3. Compile the TypeScript extension

```bash
npm run compile        # produces out/
```

### 4. Run in VS Code

- Open the `Verbis-Intelligent-Database-Assistant/` folder in VS Code.
- Press `F5` to launch an Extension Development Host with Verbis loaded.
- In the new window, open a workspace folder (any folder is fine — Verbis will create `.qmind/` inside it).
- **For end users (installed from .vsix):** On first activation, Verbis shows an "Install Now / Later" dialog and auto-creates a Python venv (~120MB, ~60s) using `uv`. You do NOT need to run `pip install` manually.
- **For local dev (F5 from source):** Skip the auto-install — you already ran `pip install` in step 1.
- You'll then see the welcome prompt asking for your API key (any provider's key format is accepted).
- Use the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for "Verbis".

### 5. Configure LLM provider (optional)

In VS Code Settings → Extensions → Verbis:

| Setting | Values | Default |
|---------|--------|---------|
| `verbis.llm.provider` | `gemini` \| `groq` \| `local` | `gemini` |
| `verbis.llm.geminiModel` | any Gemini model tag | `gemini-2.5-flash` (free tier) |
| `verbis.llm.groqModel` | any Groq model tag | `llama-3.3-70b-versatile` |
| `verbis.privacy.enableShield` | `true` \| `false` | `true` |
| `verbis.query.rowLimit` | `10`–`10000` | `500` |
| `verbis.execution.timeoutSeconds` | int | `60` |
| `verbis.execution.readOnlyByDefault` | `true` \| `false` | `true` |
| `verbis.backend.startPort` | int | `8765` |
| `verbis.backend.pythonPath` | string | `python3` |

### 6. (Optional) Set up Ollama for local mode

```bash
# Install from https://ollama.com
ollama pull sqlcoder
ollama serve
```

Then set `verbis.llm.provider` to `local` in VS Code settings. No API key is required in local mode.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+Q` / `Cmd+Shift+Q` | Open Chat Panel |
| `Ctrl+Shift+R` / `Cmd+Shift+R` | Run Last Query |
| `Ctrl+Shift+S` / `Cmd+Shift+S` | Show Schema / ER Diagram |
| `Ctrl+Shift+T` / `Cmd+Shift+T` | Open Query Tree (DAG) |

---

## 🧭 Commands

| Command | Purpose |
|---------|---------|
| `Verbis: Open Chat Panel` | Open the main NL→SQL chat webview |
| `Verbis: Set API Key` | Set or replace your Gemini / Groq API key |
| `Verbis: Remove API Key` | Remove the stored key from the OS keychain |
| `Verbis: Show Schema & ER Diagram` | Open the schema explorer panel |
| `Verbis: Open Query Tree` | Open the ReactFlow DAG of query history |
| `Verbis: Run Last Query` | Re-execute the most recent saved query |
| `Verbis: Add Database Connection` | New connection wizard (auto-sets new connection as active) |
| `Verbis: Select Database Connection` | Quick-pick UI to switch active connection (v1.1.0+) |
| `Verbis: Install / Reinstall Backend` | Manually trigger Python venv setup (v1.1.0+) |
| `Verbis: Run Schema Evolution Robustness Test` | EvoSchema perturbation suite |
| `Verbis: Restart Python Backend` | Manually restart the FastAPI subprocess |
| `Verbis: Open Business Glossary Editor` | Glossary CRUD UI |

---

## 🔌 Backend API Reference

All endpoints are bound to `http://127.0.0.1:8765` (or first free port 8765–8775). **Localhost-only** — no remote connections possible (a defense-in-depth middleware refuses non-loopback requests).

| Method | Path | Description |
|--------|------|-------------|
| `GET`    | `/api/health`             | Liveness check — returns `{status:"ok", version:"3.0.0"}` |
| `POST`   | `/api/generate`            | NL → SQL pipeline (accepts `api_key` + `provider` in body) — gated by intent guard (v1.1.0+) |
| `POST`   | `/api/intent/cache/clear`  | Clear intent classification cache (v1.1.0+, Fix B) |
| `POST`   | `/api/execute`             | Safe query execution (validation + timeout + row limit + PII masking) |
| `GET`    | `/api/schema`              | Schema introspection + ChromaDB indexing (cached) |
| `POST`   | `/api/schema/create`       | Text2Schema — generate schema from NL description (v1.1.0+) |
| `POST`   | `/api/schema/refine`       | Text2Schema — iterative refinement of existing schema (v1.1.0+) |
| `POST`   | `/api/schema/refresh`      | Force-refresh schema cache + ChromaDB index after DDL (v1.1.0+, Fix C+F) |
| `POST`   | `/api/schema/impact`       | DDL pre-execution impact analysis (Novel #9) |
| `POST`   | `/api/robustness`          | EvoSchema perturbation test runner (Novel #16) |
| `GET`    | `/api/glossary`            | Retrieve all glossary terms |
| `POST`   | `/api/glossary`            | Add or update a business glossary term |
| `DELETE` | `/api/shutdown`             | Graceful shutdown trigger |

### Example: curl

```bash
# Health check
curl http://127.0.0.1:8765/api/health
# → {"status":"ok","version":"3.0.0"}

# Generate SQL — API key passed per request
curl -X POST http://127.0.0.1:8765/api/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "nl_query": "Show me the top customers last quarter",
    "schema_context": "Table orders (customer_id int, order_total numeric, order_date date)",
    "dialect": "postgresql",
    "query_type": "sql",
    "provider": "gemini",
    "api_key": "AIzaSy...your-key..."
  }'
# → {"query":"SELECT customer_id, SUM(order_total) ...","confidence":0.9,"alternatives":[]}
```

---

## 🔒 Security Model

- **Credentials never on disk.** API keys and DB passwords live exclusively in VS Code SecretStorage (backed by the OS keychain). They never appear in `config.json`, `memory.json`, or any other file under `.qmind/`.
- **API key passed per request.** The Python backend receives the API key in the JSON body of `/api/generate`, uses it for a single LLM call, and discards it. The key is **not** stored in any environment variable, config file, or in-memory cache on the backend.
- **Localhost only.** The Python backend binds exclusively to `127.0.0.1`. A defense-in-depth middleware refuses any non-loopback request.
- **Read-only by default.** `INSERT` / `UPDATE` / `DELETE` / `DROP` statements are rejected unless `verbis.execution.readOnlyByDefault` is set to `false`.
- **Row limit + timeout.** Default 500 rows returned (configurable up to 10,000 via `verbis.query.rowLimit`). 60-second query timeout.
- **Privacy Shield.** When `verbis.privacy.enableShield` is on, all schema names are tokenized (`table_A`, `col_1`) before the prompt is sent to the cloud LLM. The tokenization map is AES-256-GCM encrypted at `.qmind/priv_map.enc`.
- **PII masking.** Result columns are scanned via Microsoft Presidio (when available) + custom regex. Masking rules are configurable per project in `.qmind/pii_rules.json`. Every masked column is logged to `.qmind/pii_audit.log` for GDPR / CCPA / HIPAA compliance reporting.

---

## 📁 The `.qmind/` Workspace

All Verbis state lives in a single `.qmind/` folder at the workspace root. It is designed to be committed to version control alongside the codebase — this is the project's persistent "database intelligence" state.

```
.qmind/
├── config.json              # DB connections, LLM mode, PII rules (non-sensitive only)
├── schema_cache.json        # Cached schema introspection
├── memory.json              # Adaptive user preferences + disambiguation choices
├── perf_log.json            # Performance regression baseline data
├── pii_rules.json           # Configurable PII masking rules per column pattern
├── pii_audit.log            # Compliance audit trail for masked results
├── priv_map.enc             # AES-256-GCM encrypted schema tokenization map
├── history.json             # Full query execution history (genealogy)
├── query_tree.json          # Interactive branching DAG structure
├── annotations.json         # Collaborative line-level + cell-level annotations
├── er_diagram.svg           # Auto-generated ER diagram (versioned)
├── glossary.json            # Business glossary terms and SQL templates
├── chromadb/                # Local persistent ChromaDB vector index
└── sessions/
    ├── 2026-08-10.json      # Saved chat sessions by date
    └── 2026-08-15.json
```

> **Note:** The `.gitignore` in this repo excludes `.qmind/` by default because it may contain sensitive query results. If you want to share a sanitized version with your team, copy the `.qmind/` structure into a separate `examples/` directory and strip any sensitive data before committing.

---

## 🧪 Testing

```bash
# TypeScript unit tests (extension + webview)
npm test                          # vitest

# Python unit tests
cd python_backend
pytest -v                         # pytest + pytest-asyncio

# End-to-end (VS Code Extension Testing)
npm run test:e2e                  # @vscode/test-cli + @vscode/test-electron
```

Coverage targets:
- 100% coverage on `validator_service.py`, `privacy_shield.py`, `pii_service.py`.
- Benchmark runs on Spider 2.0 (1,000 queries), BIRD (1,500 queries), CoSQL (multi-turn).

---

## 📦 Publishing to the VS Code Marketplace

```bash
# 1. Make sure media/icon.png exists (128×128 PNG)
#    The .gitkeep file in media/ explains this — vsce package will fail
#    with a "File not found" error until icon.png is added.

# 2. Build everything
cd webview && npm run build && cd ..
npm run compile

# 3. Package
npx vsce package
# → produces verbis-db-assistant-1.0.0.vsix

# 4. Publish (requires a VS Code Marketplace PAT)
npx vsce publish
```

Before publishing, verify:
- [ ] `package.json` has `publisher`, `icon`, `categories`, `keywords`, `repository`, `bugs`, `homepage`
- [ ] `package.json` does NOT have `"private": true`
- [ ] `CHANGELOG.md` exists in repo root
- [ ] `.vscodeignore` excludes `webview/src/**` but NOT `webview/dist/**`, `media/**`, or `out/**`
- [ ] `media/icon.png` (128×128 PNG) exists
- [ ] `requirements.txt` includes `openai>=1.0.0` and other backend deps
- [ ] `npm run compile` succeeds with zero errors

---

## 📊 Performance SLAs

| Operation | Target |
|-----------|--------|
| SQL generation (simple, 1–2 tables) | < 3 s |
| SQL generation (complex, 5+ tables, multi-join) | < 8 s |
| Schema introspection (< 50 tables) | < 5 s |
| Query execution + render (< 500 rows) | < 2 s |
| Extension activation (cold start) | < 2 s |
| Python backend ready (after activation) | < 5 s |
| UI message rendering (React state update) | < 100 ms |
| ChromaDB schema retrieval (top-K chunks) | < 500 ms |
| Memory footprint (extension + Python backend) | < 150 MB total |
| `.qmind/` file write (any single file) | < 50 ms |

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Extension Shell | TypeScript + VS Code Extension API | Extension host and lifecycle |
| Webview UI | React + TailwindCSS (Vite-bundled) | All panels |
| SQL Code Editor | CodeMirror 6 (SQL mode + gutter) | CSP-safe SQL editing |
| Visual Query Tree | ReactFlow | Interactive DAG visualization |
| Backend Engine | Python 3.11+ (FastAPI + Uvicorn) | All ML inference and data pipeline |
| LLM (Cloud, default) | **Google Gemini 2.5 Flash** via OpenAI-compatible SDK | Free-tier NL→SQL generation |
| LLM (Cloud, alt) | **Groq** `llama-3.3-70b-versatile` | Fast alternative cloud provider |
| LLM (Local) | Ollama (`sqlcoder:latest`) | Private, fully offline generation |
| API Key Storage | VS Code SecretStorage (OS keychain) | Secure credential storage — never on disk |
| RAG / Vector Store | ChromaDB (local, persistent) | Schema + query example retrieval |
| SQL Parsing + AST | sqlglot | Syntax validation + AST analysis |
| SQL Dialects | PostgreSQL, MySQL, SQLite, SQL Server | Multi-dialect aware generation |
| NoSQL Support | MongoDB via pymongo + MQL | NoSQL query generation and execution |
| Federated Merge | Pandas | In-memory cross-DB result merging |
| Schema Introspection | SQLAlchemy ORM reflection | Live schema extraction + connection pooling |
| ER Diagram | Mermaid.js | Auto-generated ER diagrams |
| Embeddings | sentence-transformers all-MiniLM-L6-v2 | Schema + query vector embeddings (local) |
| PII Detection | Microsoft Presidio + custom regex | Result-level PII classification and masking |
| Privacy Encryption | AES-256-GCM (cryptography library) | Schema tokenization map protection |
| Plan Similarity | Tree-edit-distance (APTED algorithm) | Plan comparison for optimizer |

### Why CodeMirror 6 instead of Monaco?

Monaco requires web workers and `eval()`, both of which are blocked by the VS Code webview Content Security Policy (CSP). CodeMirror 6 is CSP-safe, supports SQL syntax highlighting, and integrates cleanly with the annotation gutter required by Component 12 (Collaborative Annotations).

### Why Gemini as the default provider?

1. **Free tier is generous** — the Gemini 2.5 Flash model has a substantial free quota that covers most developer workflows.
2. **OpenAI-compatible SDK** — Gemini's `generativelanguage.googleapis.com/v1beta/openai/` endpoint accepts the standard OpenAI Python client, so adding it required no new dependencies beyond `openai>=1.0.0`.
3. **Fast** — Flash-tier latency is well within the < 3 s SQL-generation SLA for simple queries.

If you prefer Groq or local Ollama, just flip `verbis.llm.provider` in VS Code settings — no code changes required.

---

## 🎯 Example Interaction Flows

### Flow 1 — Ambiguous Query with Memory Resolution

```
Session 1:
User:       "Show me the top customers last quarter"
System:     [Ambiguity Detector: 'top' and 'last quarter' are ambiguous]
Assistant:  "Two quick questions to generate your query:
             What does 'top' mean?
             [A] Highest total spend  [B] Most purchases by count  [C] Most recent orders
             What is 'last quarter'?
             [D] Previous calendar quarter  [E] Last 90 rolling days"
User:       Selects A + D
System:     [Writes to memory.json:
              "top customers" → highest_total_spend,
              "last quarter"  → previous_calendar_quarter]
            [Multi-path generation: Path 2 (CoT) ranks highest]
System:     Confidence: 94%
            SELECT customer_id, SUM(order_total) AS total_spend
            FROM orders
            WHERE order_date BETWEEN '2026-04-01' AND '2026-06-30'
            GROUP BY customer_id
            ORDER BY total_spend DESC
            LIMIT 10;

Session 2 (next day):
User:       "Top customers last quarter again"
System:     [Disambiguation memory hit — resolves automatically, no questions asked]
            [Same SQL pattern generated in < 2 seconds]
```

### Flow 2 — Privacy Shield + PII Masking

```
User:       Connects to HR database (employees, salaries, SSNs) — Cloud Mode active
System:     [Privacy Shield activates]
            Real schema:  employees.salary, employees.ssn, departments.budget
            Sent to Gemini:  table_A.col_1, table_A.col_2, table_B.col_3

User:       "Average salary by department for 2026"
LLM sees:   "Average col_1 grouped by col_3 for 2026"
LLM output: SELECT AVG(col_1), col_3 FROM table_A JOIN table_B ON ...
System:     [De-tokenizes — user sees real names:]
            SELECT AVG(salary), dept_name FROM employees JOIN departments ...

            [Query executes — result contains SSN column]
            [PII Masker: SSN column → XXX-XX-XXXX in all displayed rows]
            [Audit log entry: ssn masked via rule SSN_PATTERN at 2026-08-15T10:23:44Z]
```

---

## 📜 License

MIT. See [LICENSE](./LICENSE) for details.

---

## 📚 Research Grounding

This work is grounded in a post-analysis of 40+ papers (2024–2026) on NL2SQL, RAG, query optimization, schema evolution, privacy, and database tooling, including:

- IBM RLAIF NL2SQL, BIRD Benchmark, MAC-SQL, CHESS, PET-SQL, SchemaRAG
- AmbiSQL, Spider 2.0, DBCopilot, OpenSearch-SQL, DIN-SQL, CHASE-SQL
- EvoSchema (VLDB 2025), LLM-PM (ICDE 2025)
- "NL2SQL is a Solved Problem… Not!" (CIDR 2024)
- arXiv 2505.23838 (cross-lingual NL2SQL), arXiv 2508.15276 (AmbiSQL)

The 18 novel contributions are documented in the project specification (`LLM_DB_Assistant_Ultimate_Prompt_v3-1.md`).

---

## 🤝 Contributing

To contribute:

1. Fork the repo at https://github.com/Pratham2511/Verbis
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes following the existing commit-message style
4. Open a Pull Request against `main`

For major changes, please open an issue first to discuss what you'd like to change.

---

## 🔮 Future Research Directions

- **Multi-language NL support** (Hindi, Arabic, French → SQL) — closing the cross-lingual NL2SQL gap (arXiv 2505.23838).
- **RLHF Continuous Improvement** — use thumbs up/down signals and annotation flags to fine-tune the local Ollama model incrementally.
- **Automated Test Query Generation** — from the schema, generate representative test queries automatically and self-evaluate accuracy without user input.
- **NoSQL-to-SQL Migration Assistant** — NL-guided schema mapping from MongoDB collections to normalized relational schemas.
- **Voice-to-SQL Interface** — spoken NL input for accessibility and hands-free workflows.
- **Proactive Insight Surfacing** — scheduled scans of the database with proactively suggested queries based on historical usage patterns and detected data anomalies.

---

## 📝 Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the full version history.

---

**Document Revision History:**

| Version | Date | Changes |
|---|---|---|
| v1.1.1 | 2026-08-17 | Hotfix: `.vscodeignore` was excluding `python_backend/**` entirely, causing backend install to fail with `uv failed (exit 2): File not found`. Now keeps all Python source files in the package; only excludes `__pycache__/`, `venv/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`. Added pre-flight guard in `BackendInstaller.install()` for clear error if `requirements.txt` is missing. |
| v1.1.0 | 2026-08-17 | Three major upgrades: (1) Few-shot LLM intent guard with 200-entry LRU cache, replacing keyword filtering. (2) Auto-install backend dependencies via `uv` + `globalStorageUri` — no terminal required. (3) Text2Schema (arXiv 2503.23886) — NL → schema JSON → DDL → Mermaid ER diagram, with iterative refinement and Copy/Download buttons. Plus 7 critical fixes (A–G): cachetools explicit dep, cache invalidation wiring, schema refresh after DDL, full connection-selection flow, no floating promises, POST /api/schema/refresh, and using existing `id` variable in addConnection. |
| v1.0.0 | 2026-08-16 | Initial public release. Renamed from QueryMind / Lumina / Noctilux → Verbis. Switched default LLM to Google Gemini 2.5 Flash (free tier). Added first-run API key prompt + `verbis.setApiKey` / `verbis.clearApiKey` commands + ApiKeySettings.tsx webview component. Marketplace-ready package.json (publisher `pratham2511`, galleryBanner, AI categories). All credentials stored in VS Code SecretStorage — never on disk. |
