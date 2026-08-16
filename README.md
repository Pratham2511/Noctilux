# 🌙 Verbis — Intelligent Database Assistant (VS Code Extension)

**Publisher:** pratham2511 · **Version:** 1.0.0 · **License:** MIT
**Repository:** https://github.com/Pratham2511/Verbis

> *Eliminate the barrier between human intent and database insight by transforming natural language into precise, optimized, safe, and explainable database operations — with team collaboration and enterprise-grade privacy — entirely within the developer's workspace.*

Verbis is an LLM-based intelligent database assistant delivered as a VS Code desktop extension. It generates, optimizes, validates, and executes SQL (and NoSQL) queries, explains results, monitors performance continuously, enforces enterprise-grade privacy, and learns from user behavior — all within the developer's existing workspace.

The default LLM provider is **Google Gemini 2.5 Flash** (free tier available — see [Get a free API key](https://aistudio.google.com/app/apikey)). **Groq** and **Ollama (local)** are also supported. Your API key is stored in the OS keychain via VS Code SecretStorage and is **never written to any file on disk**.

---

## 📦 Repository Layout

```
verbis/
├── package.json                  # VS Code extension manifest (marketplace-ready)
├── tsconfig.json
├── .vscodeignore                 # Excludes src/, webview/src/, python_backend/
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

## 🔑 Setting Your Gemini API Key

Verbis needs a free Gemini API key to generate SQL queries. There are three ways to enter it:

### Option A — First-run welcome prompt

On the very first activation, Verbis shows an information message:

> *Welcome to Verbis! A free Gemini API key is needed to generate queries.*

Click **Set API Key** to paste your key directly, or **Get Free Key** to open [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) in your browser.

### Option B — From the Command Palette

Run **`Verbis: Set Gemini API Key`** from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`). You'll be asked which provider (`gemini` or `groq`) you're setting a key for, then prompted to paste it.

Validators enforce the standard key prefixes:
- **Gemini** keys must start with `AIza`
- **Groq** keys must start with `gsk_`

### Option C — From the Webview Settings Panel

Open the **Connections** tab in the Verbis webview. The **API Keys** card at the top lets you paste your Gemini or Groq key into a password-masked input. The "Get free key ↗" links jump straight to the relevant provider's API-key page.

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
- A free **Gemini API key** from [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- *(optional)* **Ollama** for fully-offline local LLM mode
- *(optional)* **PostgreSQL** / **MySQL** / **MongoDB** for live query execution

### 1. Install dependencies

```bash
git clone https://github.com/Pratham2511/Verbis.git
cd Verbis

# Extension host (TypeScript)
npm install

# Webview (React)
cd webview
npm install
cd ..

# Python backend
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

- Open the `Verbis/` folder in VS Code.
- Press `F5` to launch an Extension Development Host with Verbis loaded.
- In the new window, open a workspace folder (any folder is fine — Verbis will create `.qmind/` inside it).
- On first activation you'll see the welcome prompt asking for your Gemini API key.
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
| `Verbis: Set Gemini API Key` | Set or replace your Gemini / Groq API key |
| `Verbis: Remove API Key` | Remove the stored key from the OS keychain |
| `Verbis: Show Schema & ER Diagram` | Open the schema explorer panel |
| `Verbis: Open Query Tree` | Open the ReactFlow DAG of query history |
| `Verbis: Run Last Query` | Re-execute the most recent saved query |
| `Verbis: Add Database Connection` | New connection wizard |
| `Verbis: Run Schema Evolution Robustness Test` | EvoSchema perturbation suite |
| `Verbis: Restart Python Backend` | Manually restart the FastAPI subprocess |
| `Verbis: Open Business Glossary Editor` | Glossary CRUD UI |

---

## 🔌 Backend API Reference

All endpoints are bound to `http://127.0.0.1:8765` (or first free port 8765–8775). **Localhost-only** — no remote connections possible (a defense-in-depth middleware refuses non-loopback requests).

| Method | Path | Description |
|--------|------|-------------|
| `GET`    | `/api/health`         | Liveness check — returns `{status:"ok", version:"3.0.0"}` |
| `POST`   | `/api/generate`        | NL → SQL pipeline (accepts `api_key` + `provider` in body) |
| `POST`   | `/api/execute`         | Safe query execution (validation + timeout + row limit + PII masking) |
| `GET`    | `/api/schema`          | Schema introspection + ChromaDB indexing |
| `POST`   | `/api/schema/impact`   | DDL pre-execution impact analysis (Novel #9) |
| `POST`   | `/api/robustness`      | EvoSchema perturbation test runner (Novel #16) |
| `GET`    | `/api/glossary`        | Retrieve all glossary terms |
| `POST`   | `/api/glossary`        | Add or update a business glossary term |
| `DELETE` | `/api/shutdown`         | Graceful shutdown trigger |

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
| v1.0.0 | 2026-08-16 | Initial public release. Renamed from QueryMind / Lumina / Noctilux → Verbis. Switched default LLM to Google Gemini 2.5 Flash (free tier). Added first-run API key prompt + `verbis.setApiKey` / `verbis.clearApiKey` commands + ApiKeySettings.tsx webview component. Marketplace-ready package.json (publisher `pratham2511`, galleryBanner, AI categories). All credentials stored in VS Code SecretStorage — never on disk. |
