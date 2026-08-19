"use strict";
// ============================================================================
// WorkspaceService — .qmind/ file I/O wrapper
// src/services/WorkspaceService.ts
//
// Implements Novel Contribution #8 (Project-Scoped Persistent Workspaces).
// All .qmind/ files are written atomically (write-tmp + rename) to prevent
// corruption if VS Code crashes mid-write.
// ============================================================================
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const QMIND_DIR = '.qmind';
class WorkspaceService {
    workspaceRoot;
    qmindPath;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.qmindPath = path.join(workspaceRoot, QMIND_DIR);
        this.ensureStructure();
    }
    // ─── Directory Initialization ─────────────────────────────────────
    ensureStructure() {
        const subdirs = ['sessions'];
        try {
            if (!fs.existsSync(this.qmindPath)) {
                fs.mkdirSync(this.qmindPath, { recursive: true });
            }
            for (const sub of subdirs) {
                const p = path.join(this.qmindPath, sub);
                if (!fs.existsSync(p))
                    fs.mkdirSync(p, { recursive: true });
            }
        }
        catch (err) {
            vscode.window.showWarningMessage(`Verbis: Could not initialize .qmind/ at ${this.qmindPath}: ${err.message}`);
        }
    }
    // ─── Atomic JSON read/write helpers ────────────────────────────────
    async readJson(file, fallback) {
        const fp = path.join(this.qmindPath, file);
        try {
            const raw = await fs.promises.readFile(fp, 'utf8');
            return JSON.parse(raw);
        }
        catch {
            return fallback;
        }
    }
    async writeJson(file, data) {
        const fp = path.join(this.qmindPath, file);
        const tmp = `${fp}.tmp`;
        const content = JSON.stringify(data, null, 2);
        await fs.promises.writeFile(tmp, content, 'utf8');
        await fs.promises.rename(tmp, fp); // atomic on POSIX
    }
    // ─── config.json ───────────────────────────────────────────────────
    async readConfig() {
        return this.readJson('config.json', {
            connections: [],
            llm: { mode: 'auto' },
            rowLimit: 500,
            timeoutSeconds: 60,
            readOnlyByDefault: true,
        });
    }
    async writeConfig(cfg) {
        await this.writeJson('config.json', cfg);
    }
    // ─── schema_cache.json ────────────────────────────────────────────
    async readSchemaCache() {
        return this.readJson('schema_cache.json', []);
    }
    async writeSchemaCache(schema) {
        await this.writeJson('schema_cache.json', schema);
    }
    // ─── memory.json — Adaptive Preference Memory (#1) + Disambiguation (#7)
    async readMemory() {
        return this.readJson('memory.json', {
            domainVocabulary: {},
            preferredPatterns: [],
            disambiguationRules: {},
            sqlCorrectionHistory: [],
            lastUpdated: Date.now(),
        });
    }
    async writeMemory(memory) {
        memory.lastUpdated = Date.now();
        await this.writeJson('memory.json', memory);
    }
    // ─── history.json — Query Genealogy (#3) ───────────────────────────
    async readHistory() {
        return this.readJson('history.json', []);
    }
    async appendHistory(entry) {
        const history = await this.readHistory();
        history.push(entry);
        // Keep last 5000 entries to avoid unbounded growth
        const trimmed = history.slice(-5000);
        await this.writeJson('history.json', trimmed);
    }
    // ─── query_tree.json — Interactive DAG (#14) ───────────────────────
    async readQueryTree() {
        return this.readJson('query_tree.json', {
            nodes: {},
            rootIds: [],
            checkpoints: [],
        });
    }
    async writeQueryTree(tree) {
        await this.writeJson('query_tree.json', tree);
    }
    // ─── annotations.json — Collaborative Annotations (#15) ────────────
    async readAnnotations() {
        return this.readJson('annotations.json', []);
    }
    async writeAnnotations(annotations) {
        await this.writeJson('annotations.json', annotations);
    }
    // ─── glossary.json — Business Glossary (#10) ───────────────────────
    async readGlossary() {
        return this.readJson('glossary.json', { terms: [], joinPaths: [] });
    }
    async writeGlossary(data) {
        await this.writeJson('glossary.json', data);
    }
    // ─── perf_log.json — Performance Regression Detector (#11) ─────────
    async readPerfLog() {
        return this.readJson('perf_log.json', []);
    }
    async appendPerfLog(entry) {
        const log = await this.readPerfLog();
        log.push(entry);
        // Keep last 10000 entries
        const trimmed = log.slice(-10000);
        await this.writeJson('perf_log.json', trimmed);
    }
    // ─── pii_rules.json — Configurable masking rules (#13) ─────────────
    async readPiiRules() {
        return this.readJson('pii_rules.json', {
            email: { pattern: '^[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}$', mask: 'xxx@xxx.com' },
            phone: { pattern: '^\\+?\\d{10,15}$', mask: 'XXX-XXX-XXXX' },
            ssn: { pattern: '^\\d{3}-?\\d{2}-?\\d{4}$', mask: 'XXX-XX-XXXX' },
            credit_card: { pattern: '^\\d{4}[ -]?\\d{4}[ -]?\\d{4}[ -]?\\d{4}$', mask: '****-****-****-1234' },
        });
    }
    // ─── pii_audit.log — Compliance audit trail ─────────────────────────
    async appendPiiAudit(line) {
        const fp = path.join(this.qmindPath, 'pii_audit.log');
        await fs.promises.appendFile(fp, line + '\n', 'utf8');
    }
    // ─── er_diagram.svg — Auto-generated ER diagram (#3c) ──────────────
    async writeErDiagram(svg) {
        const fp = path.join(this.qmindPath, 'er_diagram.svg');
        await fs.promises.writeFile(fp, svg, 'utf8');
    }
    // ─── sessions/<date>.json — Chat history persistence ───────────────
    async saveSession(date, messages) {
        await this.writeJson(`sessions/${date}.json`, messages);
    }
    // ─── priv_map.enc — AES-256-GCM encrypted schema tokenization map ──
    async writeEncryptedPrivMap(buf) {
        const fp = path.join(this.qmindPath, 'priv_map.enc');
        await fs.promises.writeFile(fp, buf);
    }
    async readEncryptedPrivMap() {
        const fp = path.join(this.qmindPath, 'priv_map.enc');
        try {
            return await fs.promises.readFile(fp);
        }
        catch {
            return null;
        }
    }
    get qmindDir() {
        return this.qmindPath;
    }
}
exports.WorkspaceService = WorkspaceService;
//# sourceMappingURL=WorkspaceService.js.map