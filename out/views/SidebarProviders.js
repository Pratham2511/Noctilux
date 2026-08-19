"use strict";
// ============================================================================
// SidebarProviders — TreeDataProviders for the Verbis activity bar container
// src/views/SidebarProviders.ts
//
// package.json declares three views under the "verbis-explorer" container:
//   - verbis.connections  → database connections from .qmind/config.json
//   - verbis.schema       → tables of the active connection (via backend)
//   - verbis.history      → recent queries from .qmind/history.json
//
// Without these registrations the sidebar renders three empty sections and
// users conclude "there is no interface". Chat itself lives in VerbisPanel
// (editor area) — these views provide quick access to it and to connections.
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
exports.HistoryProvider = exports.SchemaTreeProvider = exports.ConnectionsProvider = void 0;
const vscode = __importStar(require("vscode"));
// ─── Connections ───────────────────────────────────────────────────────────
class ConnectionsProvider {
    workspace;
    onChange = new vscode.EventEmitter();
    onDidChangeTreeData = this.onChange.event;
    constructor(workspace) {
        this.workspace = workspace;
    }
    refresh() { this.onChange.fire(); }
    getTreeItem(item) { return item; }
    async getChildren() {
        const cfg = await this.workspace.readConfig();
        if (cfg.connections.length === 0) {
            const add = new vscode.TreeItem('Add Database Connection…');
            add.command = { command: 'verbis.addConnection', title: 'Add Connection' };
            add.iconPath = new vscode.ThemeIcon('add');
            return [add];
        }
        return cfg.connections.map(c => {
            const item = new vscode.TreeItem(c.name, vscode.TreeItemCollapsibleState.None);
            item.description = c.dialect;
            item.tooltip = `${c.user}@${c.host}:${c.port}/${c.database}`;
            item.iconPath = new vscode.ThemeIcon('database');
            item.contextValue = 'verbisConnection';
            item.command = {
                command: 'verbis.selectConnection',
                title: 'Select Connection',
            };
            return item;
        });
    }
}
exports.ConnectionsProvider = ConnectionsProvider;
// ─── Schema ────────────────────────────────────────────────────────────────
class SchemaTreeProvider {
    getClient;
    getStatus;
    onChange = new vscode.EventEmitter();
    onDidChangeTreeData = this.onChange.event;
    constructor(getClient, getStatus) {
        this.getClient = getClient;
        this.getStatus = getStatus;
    }
    refresh() { this.onChange.fire(); }
    getTreeItem(item) { return item; }
    async getChildren(element) {
        const client = this.getClient();
        if (!client) {
            const state = this.getStatus().state;
            // Only show the spinner while the backend is genuinely starting up.
            // When stopped/crashed, a perpetual "Backend starting…" is misleading —
            // show an actionable restart item instead.
            if (state === 'starting') {
                const item = new vscode.TreeItem('Backend starting…');
                item.iconPath = new vscode.ThemeIcon('loading~spin');
                return [item];
            }
            const item = new vscode.TreeItem(state === 'crashed' ? 'Backend crashed — restart' : 'Backend not running — start');
            item.command = { command: 'verbis.restartBackend', title: 'Restart Backend' };
            item.iconPath = new vscode.ThemeIcon(state === 'crashed' ? 'error' : 'debug-start');
            return [item];
        }
        if (element)
            return []; // columns not expanded in the tree (kept simple)
        try {
            const schema = await client.getSchema('default');
            const tables = schema?.tables ?? [];
            if (tables.length === 0) {
                const item = new vscode.TreeItem('No schema loaded — open the assistant and connect');
                item.command = { command: 'verbis.openAssistant', title: 'Open Assistant' };
                return [item];
            }
            return tables.slice(0, 200).map(t => {
                const item = new vscode.TreeItem(t.tableName, vscode.TreeItemCollapsibleState.None);
                item.iconPath = new vscode.ThemeIcon('symbol-class');
                item.tooltip = `${t.columns.length} columns`;
                return item;
            });
        }
        catch {
            const item = new vscode.TreeItem('Schema unavailable — select a connection');
            item.command = { command: 'verbis.selectConnection', title: 'Select Connection' };
            item.iconPath = new vscode.ThemeIcon('warning');
            return [item];
        }
    }
}
exports.SchemaTreeProvider = SchemaTreeProvider;
// ─── Recent Queries ────────────────────────────────────────────────────────
class HistoryProvider {
    workspace;
    onChange = new vscode.EventEmitter();
    onDidChangeTreeData = this.onChange.event;
    constructor(workspace) {
        this.workspace = workspace;
    }
    refresh() { this.onChange.fire(); }
    getTreeItem(item) { return item; }
    async getChildren() {
        const history = await this.workspace.readHistory();
        if (history.length === 0) {
            const item = new vscode.TreeItem('No queries yet — open the assistant to start');
            item.command = { command: 'verbis.openAssistant', title: 'Open Assistant' };
            item.iconPath = new vscode.ThemeIcon('comment-discussion');
            return [item];
        }
        return history.slice(-25).reverse().map(h => {
            const label = h.nlInput?.trim()
                ? h.nlInput.slice(0, 60)
                : h.sql.slice(0, 60);
            const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
            item.description = h.executionTimeMs != null ? `${h.executionTimeMs}ms` : '';
            item.tooltip = h.sql;
            item.iconPath = new vscode.ThemeIcon(h.success ? 'check' : 'error');
            item.command = { command: 'verbis.openTree', title: 'Open Query Tree' };
            return item;
        });
    }
}
exports.HistoryProvider = HistoryProvider;
//# sourceMappingURL=SidebarProviders.js.map