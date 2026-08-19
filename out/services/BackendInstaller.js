"use strict";
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
exports.BackendInstaller = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
class BackendInstaller {
    context;
    constructor(context) {
        this.context = context;
    }
    get storageDir() {
        const dir = this.context.globalStorageUri.fsPath;
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return dir;
    }
    get venvDir() {
        return path.join(this.storageDir, 'venv');
    }
    get markerFile() {
        return path.join(this.venvDir, 'verbis_ready');
    }
    get pythonExe() {
        return process.platform === 'win32'
            ? path.join(this.venvDir, 'Scripts', 'python.exe')
            : path.join(this.venvDir, 'bin', 'python3');
    }
    get pipExe() {
        return process.platform === 'win32'
            ? path.join(this.venvDir, 'Scripts', 'pip.exe')
            : path.join(this.venvDir, 'bin', 'pip3');
    }
    get uvExe() {
        return process.platform === 'win32'
            ? path.join(this.venvDir, 'Scripts', 'uv.exe')
            : path.join(this.venvDir, 'bin', 'uv');
    }
    isReady() {
        return fs.existsSync(this.markerFile) && fs.existsSync(this.pythonExe);
    }
    markReady() {
        fs.writeFileSync(this.markerFile, new Date().toISOString(), 'utf-8');
    }
    runCommand(exe, args) {
        return new Promise((resolve, reject) => {
            const proc = (0, child_process_1.spawn)(exe, args, { stdio: 'pipe' });
            let stderr = '';
            proc.stderr?.on('data', (d) => { stderr += d.toString(); });
            proc.on('close', (code) => {
                if (code === 0) {
                    resolve();
                }
                else {
                    reject(new Error(`${path.basename(exe)} failed (exit ${code}): ${stderr.slice(0, 300)}`));
                }
            });
            proc.on('error', (e) => reject(new Error(`Cannot run ${exe}: ${e.message}`)));
        });
    }
    async getSystemPython() {
        const candidates = process.platform === 'win32'
            ? ['python', 'python3']
            : ['python3', 'python'];
        for (const cmd of candidates) {
            try {
                await this.runCommand(cmd, ['--version']);
                return cmd;
            }
            catch {
                continue;
            }
        }
        throw new Error('Python 3.9+ is required but was not found. ' +
            'Install it from python.org and restart VS Code.');
    }
    async install(progress) {
        const reqFile = path.join(this.context.extensionPath, 'python_backend', 'requirements.txt');
        // Guard: requirements.txt MUST exist in the extension folder.
        // If it's missing, the .vsix was packaged without it (older builds
        // excluded python_backend/** entirely). Surface a clear error instead
        // of letting uv fail with a cryptic "File not found" message.
        if (!fs.existsSync(reqFile)) {
            throw new Error(`requirements.txt not found at ${reqFile}. ` +
                `The extension may have been packaged incorrectly. ` +
                `Please reinstall Verbis from the VS Code Marketplace, or ` +
                `report this issue at https://github.com/Pratham2511/Verbis-Intelligent-Database-Assistant/issues.`);
        }
        progress.report({ message: 'Checking Python installation...', increment: 5 });
        const sysPython = await this.getSystemPython();
        progress.report({ message: 'Creating Python environment...', increment: 15 });
        await this.runCommand(sysPython, ['-m', 'venv', this.venvDir]);
        progress.report({ message: 'Installing uv (fast package manager)...', increment: 10 });
        await this.runCommand(this.pipExe, ['install', '--quiet', 'uv'])
            .catch(() => { });
        progress.report({ message: 'Installing Verbis dependencies (~120MB, ~60s)...', increment: 50 });
        const useUv = fs.existsSync(this.uvExe);
        if (useUv) {
            // --python targets the venv interpreter explicitly; without it uv
            // installs into whatever environment it detects (venv is not activated).
            await this.runCommand(this.uvExe, ['pip', 'install', '--python', this.pythonExe, '-r', reqFile, '--quiet']);
        }
        else {
            await this.runCommand(this.pipExe, ['install', '-r', reqFile, '--quiet']);
        }
        progress.report({ message: 'Finalizing...', increment: 15 });
        this.markReady();
        progress.report({ message: '✅ Verbis backend ready!', increment: 5 });
    }
    async installWithProgress() {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Setting up Verbis Backend (first time only)',
            cancellable: false,
        }, (progress) => this.install(progress));
    }
}
exports.BackendInstaller = BackendInstaller;
//# sourceMappingURL=BackendInstaller.js.map