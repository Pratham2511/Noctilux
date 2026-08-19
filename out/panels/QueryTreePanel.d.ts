import * as vscode from 'vscode';
import { WorkspaceService } from '../services/WorkspaceService';
export declare class QueryTreePanel {
    private panel;
    private context;
    private workspace;
    static currentPanel: QueryTreePanel | undefined;
    private static readonly viewType;
    private disposables;
    static createOrShow(context: vscode.ExtensionContext, workspace: WorkspaceService): QueryTreePanel;
    private constructor();
    private getInitialHtml;
    private dispose;
}
