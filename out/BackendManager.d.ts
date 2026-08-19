import { EventEmitter } from 'events';
import { BackendClient } from './services/BackendClient';
import { BackendStatus } from './types';
export declare class BackendManager extends EventEmitter {
    private readonly backendScriptPath;
    private readonly backendDir;
    private readonly workspacePath;
    private readonly pythonExe;
    private readonly startPort;
    private process;
    private port;
    private client;
    private crashTimestamps;
    private status;
    constructor(backendScriptPath: string, backendDir: string, workspacePath: string, pythonExe: string, // ← from BackendInstaller
    startPort?: number);
    start(): Promise<BackendStatus>;
    private waitForHealth;
    private handleCrash;
    restart(): Promise<BackendStatus>;
    stop(): Promise<void>;
    private findFreePort;
    getClient(): BackendClient | null;
    getStatus(): BackendStatus;
    private setStatus;
}
