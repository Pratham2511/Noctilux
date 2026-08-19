import * as vscode from 'vscode';
import { BackendClient } from '../services/BackendClient';
import { WorkspaceService } from '../services/WorkspaceService';
import { SecretsService } from '../services/SecretsService';
export declare class ChatViewProvider implements vscode.WebviewViewProvider {
    private readonly context;
    private readonly getClient;
    private readonly workspace;
    private readonly secrets;
    static readonly viewType = "verbis.chatView";
    private view;
    private activeConnectionId;
    constructor(context: vscode.ExtensionContext, getClient: () => BackendClient | null, workspace: WorkspaceService, secrets: SecretsService);
    resolveWebviewView(webviewView: vscode.WebviewView, _ctx: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    postMessage(message: unknown): void;
    setActiveConnection(connectionId: string): void;
    pushConnections(): Promise<void>;
    /** Reveal the sidebar chat view (used by verbis.openChat). */
    show(): void;
    private resolveConnectionId;
    private onMessage;
    private sendError;
    private getHtml;
}
