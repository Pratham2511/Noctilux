"use strict";
// ============================================================================
// QueryTreePanel — ReactFlow DAG panel
// src/panels/QueryTreePanel.ts
//
// Implements Novel Contribution #14 (Interactive Query Tree with Visual Branching).
// Loads the full DAG from query_tree.json and renders in a webview.
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
exports.QueryTreePanel = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class QueryTreePanel {
    panel;
    context;
    workspace;
    static currentPanel;
    static viewType = 'verbis.tree';
    disposables = [];
    static createOrShow(context, workspace) {
        if (QueryTreePanel.currentPanel) {
            QueryTreePanel.currentPanel.panel.reveal(vscode.ViewColumn.Two);
            return QueryTreePanel.currentPanel;
        }
        const panel = vscode.window.createWebviewPanel(QueryTreePanel.viewType, 'Verbis — Query Tree (DAG)', vscode.ViewColumn.Two, { enableScripts: true, retainContextWhenHidden: true });
        QueryTreePanel.currentPanel = new QueryTreePanel(panel, context, workspace);
        return QueryTreePanel.currentPanel;
    }
    constructor(panel, context, workspace) {
        this.panel = panel;
        this.context = context;
        this.workspace = workspace;
        this.panel.webview.html = this.getInitialHtml();
        this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
        this.panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case 'LOAD_TREE': {
                    const tree = await this.workspace.readQueryTree();
                    this.panel.webview.postMessage({ type: 'TREE_UPDATED', payload: tree });
                    break;
                }
                case 'NODE_FORKED': {
                    const tree = await this.workspace.readQueryTree();
                    const parent = tree.nodes[msg.payload.parentId];
                    if (!parent)
                        return;
                    const childId = crypto.randomUUID();
                    tree.nodes[childId] = {
                        id: childId,
                        parentId: msg.payload.parentId,
                        nlInput: parent.nlInput + ' (fork)',
                        sql: msg.payload.sql || parent.sql,
                        confidence: parent.confidence,
                        status: 'unexecuted',
                        timestamp: Date.now(),
                        annotationCount: 0,
                    };
                    parent.childrenIds = parent.childrenIds || [];
                    parent.childrenIds.push(childId);
                    await this.workspace.writeQueryTree(tree);
                    this.panel.webview.postMessage({ type: 'TREE_UPDATED', payload: tree });
                    break;
                }
                case 'NODE_CHECKPOINTED': {
                    const tree = await this.workspace.readQueryTree();
                    tree.checkpoints.push({
                        nodeId: msg.payload.nodeId,
                        label: msg.payload.label,
                        timestamp: Date.now(),
                    });
                    if (tree.nodes[msg.payload.nodeId]) {
                        tree.nodes[msg.payload.nodeId].checkpointLabel = msg.payload.label;
                    }
                    await this.workspace.writeQueryTree(tree);
                    this.panel.webview.postMessage({ type: 'TREE_UPDATED', payload: tree });
                    break;
                }
            }
        });
    }
    getInitialHtml() {
        const scriptUri = this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist', 'assets', 'tree.js')));
        return /*html*/ `<!DOCTYPE html>
<html><head><meta charset="UTF-8" />
<style>
  body { font-family: var(--vscode-font-family, sans-serif); margin: 0; padding: 0; height: 100vh; }
  #tree-root { width: 100%; height: 100vh; }
</style></head>
<body><div id="tree-root">Loading Query Tree…</div>
<script src="${scriptUri}"></script>
</body></html>`;
    }
    dispose() {
        QueryTreePanel.currentPanel = undefined;
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
exports.QueryTreePanel = QueryTreePanel;
//# sourceMappingURL=QueryTreePanel.js.map