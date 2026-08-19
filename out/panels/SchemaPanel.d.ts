import * as vscode from 'vscode';
import { BackendClient } from '../services/BackendClient';
export declare class SchemaPanel {
    private panel;
    private context;
    private client;
    static currentPanel: SchemaPanel | undefined;
    private static readonly viewType;
    private disposables;
    static createOrShow(context: vscode.ExtensionContext, client: BackendClient | null): SchemaPanel;
    private constructor();
    private getInitialHtml;
    private dispose;
}
