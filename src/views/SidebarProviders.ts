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

import * as vscode from 'vscode';
import { WorkspaceService } from '../services/WorkspaceService';
import { BackendClient } from '../services/BackendClient';

// ─── Connections ───────────────────────────────────────────────────────────

export class ConnectionsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly onChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.onChange.event;

  constructor(private readonly workspace: WorkspaceService) {}

  refresh(): void { this.onChange.fire(); }

  getTreeItem(item: vscode.TreeItem): vscode.TreeItem { return item; }

  async getChildren(): Promise<vscode.TreeItem[]> {
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

// ─── Schema ────────────────────────────────────────────────────────────────

export class SchemaTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly onChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.onChange.event;

  constructor(private readonly getClient: () => BackendClient | null) {}

  refresh(): void { this.onChange.fire(); }

  getTreeItem(item: vscode.TreeItem): vscode.TreeItem { return item; }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    const client = this.getClient();
    if (!client) {
      const item = new vscode.TreeItem('Backend starting…');
      item.iconPath = new vscode.ThemeIcon('loading~spin');
      return [item];
    }
    if (element) return [];  // columns not expanded in the tree (kept simple)

    try {
      const schema = await client.getSchema('default');
      const tables = schema?.tables ?? [];
      if (tables.length === 0) {
        const item = new vscode.TreeItem('No schema loaded — open chat and connect');
        item.command = { command: 'verbis.openChat', title: 'Open Chat' };
        return [item];
      }
      return tables.slice(0, 200).map(t => {
        const item = new vscode.TreeItem(t.tableName, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('symbol-class');
        item.tooltip = `${t.columns.length} columns`;
        return item;
      });
    } catch {
      const item = new vscode.TreeItem('Schema unavailable — select a connection');
      item.command = { command: 'verbis.selectConnection', title: 'Select Connection' };
      item.iconPath = new vscode.ThemeIcon('warning');
      return [item];
    }
  }
}

// ─── Recent Queries ────────────────────────────────────────────────────────

export class HistoryProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly onChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.onChange.event;

  constructor(private readonly workspace: WorkspaceService) {}

  refresh(): void { this.onChange.fire(); }

  getTreeItem(item: vscode.TreeItem): vscode.TreeItem { return item; }

  async getChildren(): Promise<vscode.TreeItem[]> {
    const history = await this.workspace.readHistory();
    if (history.length === 0) {
      const item = new vscode.TreeItem('No queries yet — open the chat to start');
      item.command = { command: 'verbis.openChat', title: 'Open Chat' };
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
