// ============================================================================
// QueryTreePanel — ReactFlow DAG panel
// src/panels/QueryTreePanel.ts
//
// Implements Novel Contribution #14 (Interactive Query Tree with Visual Branching).
// Loads the full DAG from query_tree.json and renders in a webview.
// ============================================================================

import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceService } from '../services/WorkspaceService';

export class QueryTreePanel {
  public static currentPanel: QueryTreePanel | undefined;
  private static readonly viewType = 'noctilux.tree';
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(
    context: vscode.ExtensionContext,
    workspace: WorkspaceService
  ): QueryTreePanel {
    if (QueryTreePanel.currentPanel) {
      QueryTreePanel.currentPanel.panel.reveal(vscode.ViewColumn.Two);
      return QueryTreePanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      QueryTreePanel.viewType,
      'Noctilux — Query Tree (DAG)',
      vscode.ViewColumn.Two,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    QueryTreePanel.currentPanel = new QueryTreePanel(panel, context, workspace);
    return QueryTreePanel.currentPanel;
  }

  private constructor(
    private panel: vscode.WebviewPanel,
    private context: vscode.ExtensionContext,
    private workspace: WorkspaceService
  ) {
    this.panel.webview.html = this.getInitialHtml();
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);

    this.panel.webview.onDidReceiveMessage(async msg => {
      switch (msg.type) {
        case 'LOAD_TREE': {
          const tree = await this.workspace.readQueryTree();
          this.panel.webview.postMessage({ type: 'TREE_UPDATED', payload: tree });
          break;
        }
        case 'NODE_FORKED': {
          const tree = await this.workspace.readQueryTree();
          const parent = tree.nodes[msg.payload.parentId];
          if (!parent) return;
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

  private getInitialHtml(): string {
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist', 'assets', 'tree.js'))
    );
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

  private dispose() {
    QueryTreePanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
