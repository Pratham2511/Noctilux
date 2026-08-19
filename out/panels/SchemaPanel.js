"use strict";
// ============================================================================
// SchemaPanel — Schema explorer + ER diagram viewer
// src/panels/SchemaPanel.ts
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
exports.SchemaPanel = void 0;
const vscode = __importStar(require("vscode"));
class SchemaPanel {
    panel;
    context;
    client;
    static currentPanel;
    static viewType = 'verbis.schema';
    disposables = [];
    static createOrShow(context, client) {
        if (SchemaPanel.currentPanel) {
            SchemaPanel.currentPanel.panel.reveal(vscode.ViewColumn.Two);
            return SchemaPanel.currentPanel;
        }
        const panel = vscode.window.createWebviewPanel(SchemaPanel.viewType, 'Verbis — Schema & ER Diagram', vscode.ViewColumn.Two, { enableScripts: true, retainContextWhenHidden: true });
        SchemaPanel.currentPanel = new SchemaPanel(panel, context, client);
        return SchemaPanel.currentPanel;
    }
    constructor(panel, context, client) {
        this.panel = panel;
        this.context = context;
        this.client = client;
        this.panel.webview.html = this.getInitialHtml();
        this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
        this.panel.webview.onDidReceiveMessage(async (msg) => {
            if (!this.client)
                return;
            if (msg.type === 'LOAD_SCHEMA') {
                try {
                    const result = await this.client.getSchema(msg.payload.dbConfigId);
                    this.panel.webview.postMessage({
                        type: 'SCHEMA_LOADED',
                        payload: result,
                    });
                }
                catch (err) {
                    vscode.window.showErrorMessage(`Schema load failed: ${err.message}`);
                }
            }
        });
    }
    getInitialHtml() {
        return /*html*/ `<!DOCTYPE html>
<html><head><meta charset="UTF-8" />
<style>
  body { font-family: var(--vscode-font-family, sans-serif); padding: 12px; color: var(--vscode-foreground); }
  .table-card { border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin: 8px 0; padding: 8px; }
  .table-name { font-weight: 600; color: var(--vscode-textLink-foreground); }
  .col { padding: 2px 0 2px 16px; font-size: 12px; }
  .col.pk { color: var(--vscode-symbolIcon-keyForeground, #d4a017); }
  .col.fk { color: var(--vscode-symbolIcon-referenceForeground, #4ec9b0); }
</style></head>
<body>
  <h3>Schema Explorer</h3>
  <p>Select a connection to introspect.</p>
  <div id="tables"></div>
  <h3>ER Diagram</h3>
  <div id="er-diagram">Loading…</div>
  <script>
    const vscode = acquireVsCodeApi();
    // Auto-load on first render
    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'SCHEMA_LOADED') {
        renderTables(msg.payload.tables);
        renderER(msg.payload.tables);
      }
    });
    function renderTables(tables) {
      document.getElementById('tables').innerHTML = tables.map(t => \`
        <div class="table-card">
          <div class="table-name">\${t.tableName}</div>
          \${t.columns.map(c => \`
            <div class="col \${c.isPrimaryKey ? 'pk' : c.isForeignKey ? 'fk' : ''}">
              \${c.isPrimaryKey ? '🔑 ' : c.isForeignKey ? '🔗 ' : '• '}
              \${c.name} : <em>\${c.type}</em>
            </div>
          \`).join('')}
        </div>
      \`).join('');
    }
    function renderER(tables) {
      const lines = ['erDiagram'];
      for (const t of tables) {
        for (const c of t.columns) {
          lines.push(\`  \${t.tableName} { \${c.type} \${c.name} }\`);
        }
        if (t.foreignKeys) {
          for (const fk of t.foreignKeys) {
            lines.push(\`  \${t.tableName} ||--o{ \${fk.referencedTable} : "\${fk.column}"\`);
          }
        }
      }
      document.getElementById('er-diagram').innerHTML =
        '<pre>' + lines.join('\\n') + '</pre><p>Render via Mermaid.js in webview bundle.</p>';
    }
  </script>
</body></html>`;
    }
    dispose() {
        SchemaPanel.currentPanel = undefined;
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
exports.SchemaPanel = SchemaPanel;
//# sourceMappingURL=SchemaPanel.js.map