# QueryMind — VS Code Extension Development Notes

This file collects notes for contributors and developers extending QueryMind.

## Dev Workflow

```bash
# Terminal 1: Watch TypeScript (extension host)
cd querymind
npm run watch

# Terminal 2: Watch React webview (Vite)
cd webview
npm run dev

# Terminal 3: Run Python backend directly (for debugging)
cd python_backend
python main.py --port 8765 --workspace /path/to/test/workspace

# Launch VS Code with Extension Development Host
code --extensionDevelopmentPath=$(pwd)
```

## Debugging the Python Backend

The backend logs to stderr (visible in VS Code Output panel → "QueryMind" channel).
For verbose logs:

```bash
python main.py --port 8765 --workspace . --log-level DEBUG
```

Common debug commands:

```bash
# Health check
curl http://127.0.0.1:8765/api/health

# Trigger robustness test from CLI
curl -X POST http://127.0.0.1:8765/api/robustness \
  -H 'Content-Type: application/json' \
  -d @sample-robustness-payload.json
```

## Adding a New Service

1. Create `python_backend/services/<your_service>.py`.
2. Register it in `python_backend/api/dependencies.py` `init_app_state()`.
3. Add a route in `python_backend/api/routes/<your_route>.py` if user-facing.
4. Register the router in `python_backend/main.py`.
5. If new types are needed, add them to both:
   - `src/types/index.ts` (TypeScript)
   - `python_backend/models/requests.py` (Pydantic)
6. Add the matching component UI in `webview/src/components/` if interactive.

## Privacy Shield Salt

On first activation, the extension generates a 32-byte salt and stores it in
VS Code SecretStorage under the key `qm.privmap.salt`. The Python backend
reads this salt from the env var `QM_PRIVMAP_SALT` (passed by
`BackendManager.ts` when spawning the subprocess).

If the salt is lost (e.g., VS Code profile reset), `priv_map.enc` becomes
unreadable. The shield automatically re-initializes a new map on the next
cloud LLM call — but historical anonymized SQL cannot be de-anonymized.

## Testing PII Masking

To verify PII masking works end-to-end:

1. Configure a connection to a database with PII columns (e.g., `employees.ssn`).
2. Run any query that returns the PII column.
3. Verify the result grid shows `XXX-XX-XXXX` instead of real SSNs.
4. Check `.qmind/pii_audit.log` for the audit trail entry.

To customize masking rules, edit `.qmind/pii_rules.json`:

```json
{
  "email": { "pattern": "^[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}$", "mask": "xxx@xxx.com" },
  "phone": { "pattern": "^\\+?\\d{10,15}$", "mask": "XXX-XXX-XXXX" },
  "ssn":   { "pattern": "^\\d{3}-?\\d{2}-?\\d{4}$", "mask": "XXX-XX-XXXX" }
}
```

## Plan Similarity (APTED)

The plan similarity engine uses the `apted` Python package. Install via:

```bash
pip install apted
```

If `apted` is unavailable, the optimizer falls back to a token-overlap
similarity heuristic (see `optimizer_service.py:_similarity_ratio`).
