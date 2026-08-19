import * as vscode from 'vscode';
import { WorkspaceService } from '../services/WorkspaceService';
import { BackendClient } from '../services/BackendClient';
export declare class ConnectionsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private readonly workspace;
    private readonly onChange;
    readonly onDidChangeTreeData: vscode.Event<void>;
    constructor(workspace: WorkspaceService);
    refresh(): void;
    getTreeItem(item: vscode.TreeItem): vscode.TreeItem;
    getChildren(): Promise<vscode.TreeItem[]>;
}
export declare class SchemaTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private readonly getClient;
    private readonly onChange;
    readonly onDidChangeTreeData: vscode.Event<void>;
    constructor(getClient: () => BackendClient | null);
    refresh(): void;
    getTreeItem(item: vscode.TreeItem): vscode.TreeItem;
    getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]>;
}
export declare class HistoryProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private readonly workspace;
    private readonly onChange;
    readonly onDidChangeTreeData: vscode.Event<void>;
    constructor(workspace: WorkspaceService);
    refresh(): void;
    getTreeItem(item: vscode.TreeItem): vscode.TreeItem;
    getChildren(): Promise<vscode.TreeItem[]>;
}
