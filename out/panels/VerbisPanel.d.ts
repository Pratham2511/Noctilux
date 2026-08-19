import * as vscode from 'vscode';
import { BackendClient } from '../services/BackendClient';
import { WorkspaceService } from '../services/WorkspaceService';
import { SecretsService } from '../services/SecretsService';
export declare class VerbisPanel {
    private readonly context;
    private readonly client;
    private readonly workspace;
    private readonly secrets;
    static currentPanel: VerbisPanel | undefined;
    private static readonly viewType;
    private panel;
    private disposables;
    private activeConnectionId;
    static createOrShow(context: vscode.ExtensionContext, client: BackendClient | null, workspace: WorkspaceService, secrets: SecretsService): VerbisPanel;
    private constructor();
    /** Called by extension.ts when user selects a connection (verbis.selectConnection
     *  command) or after verbis.addConnection creates a new connection. */
    setActiveConnection(connectionId: string): void;
    /** Resolve active connection with fallback to first connection in config.json. */
    private resolveConnectionId;
    private onMessage;
    postMessage(message: unknown): void;
    /** Push the current connection list to the webview (chat DB selector). */
    pushConnections(): Promise<void>;
    private sendError;
    private getHtml;
    dispose(): void;
}
