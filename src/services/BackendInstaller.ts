/**
 * BackendInstaller — auto-creates a Python venv and installs backend deps.
 *
 * Design:
 * - Venv stored in context.globalStorageUri (SURVIVES extension updates)
 * - Cross-platform Python path detection (Windows + Linux/Mac)
 * - Uses uv for 10x faster installs, falls back to pip
 * - "Install Now / Later" dialog UX
 * - "verbis.installBackend" reinstall command
 * - Marker file (verbis_ready) for reliable state tracking
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';


export class BackendInstaller {

    constructor(private readonly context: vscode.ExtensionContext) {}

    private get storageDir(): string {
        const dir = this.context.globalStorageUri.fsPath;
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        return dir;
    }

    private get venvDir(): string {
        return path.join(this.storageDir, 'venv');
    }

    private get markerFile(): string {
        return path.join(this.venvDir, 'verbis_ready');
    }

    get pythonExe(): string {
        return process.platform === 'win32'
            ? path.join(this.venvDir, 'Scripts', 'python.exe')
            : path.join(this.venvDir, 'bin', 'python3');
    }

    private get pipExe(): string {
        return process.platform === 'win32'
            ? path.join(this.venvDir, 'Scripts', 'pip.exe')
            : path.join(this.venvDir, 'bin', 'pip3');
    }

    private get uvExe(): string {
        return process.platform === 'win32'
            ? path.join(this.venvDir, 'Scripts', 'uv.exe')
            : path.join(this.venvDir, 'bin', 'uv');
    }

    isReady(): boolean {
        return fs.existsSync(this.markerFile) && fs.existsSync(this.pythonExe);
    }

    private markReady(): void {
        fs.writeFileSync(this.markerFile, new Date().toISOString(), 'utf-8');
    }

    private runCommand(exe: string, args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const proc = spawn(exe, args, { stdio: 'pipe' });
            let stderr = '';
            proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
            proc.on('close', (code) => {
                if (code === 0) { resolve(); }
                else { reject(new Error(`${path.basename(exe)} failed (exit ${code}): ${stderr.slice(0, 300)}`)); }
            });
            proc.on('error', (e) => reject(new Error(`Cannot run ${exe}: ${e.message}`)));
        });
    }

    private async getSystemPython(): Promise<string> {
        const candidates = process.platform === 'win32'
            ? ['python', 'python3']
            : ['python3', 'python'];

        for (const cmd of candidates) {
            try {
                await this.runCommand(cmd, ['--version']);
                return cmd;
            } catch { continue; }
        }
        throw new Error(
            'Python 3.9+ is required but was not found. ' +
            'Install it from python.org and restart VS Code.'
        );
    }

    async install(
        progress: vscode.Progress<{ message?: string; increment?: number }>
    ): Promise<void> {
        const reqFile = path.join(
            this.context.extensionPath, 'python_backend', 'requirements.txt'
        );

        progress.report({ message: 'Checking Python installation...', increment: 5 });
        const sysPython = await this.getSystemPython();

        progress.report({ message: 'Creating Python environment...', increment: 15 });
        await this.runCommand(sysPython, ['-m', 'venv', this.venvDir]);

        progress.report({ message: 'Installing uv (fast package manager)...', increment: 10 });
        await this.runCommand(this.pipExe, ['install', '--quiet', 'uv'])
            .catch(() => { /* uv install failed — will use pip fallback */ });

        progress.report({ message: 'Installing Verbis dependencies (~120MB, ~60s)...', increment: 50 });
        const useUv = fs.existsSync(this.uvExe);
        if (useUv) {
            await this.runCommand(this.uvExe, ['pip', 'install', '-r', reqFile, '--quiet']);
        } else {
            await this.runCommand(this.pipExe, ['install', '-r', reqFile, '--quiet']);
        }

        progress.report({ message: 'Finalizing...', increment: 15 });
        this.markReady();
        progress.report({ message: '✅ Verbis backend ready!', increment: 5 });
    }

    async installWithProgress(): Promise<void> {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Setting up Verbis Backend (first time only)',
                cancellable: false,
            },
            (progress) => this.install(progress)
        );
    }
}
