// ============================================================================
// BackendManager — Python subprocess lifecycle
// src/BackendManager.ts
//
// Implements the lifecycle described in Part 8 of the spec:
//   1. Find a free port (scan 8765..8775)
//   2. Spawn `python main.py --port <p> --workspace <path>`
//   3. Poll GET /api/health every 500ms (timeout 10s)
//   4. On success: emit 'ready'
//   5. On crash: auto-restart once; if second crash within 30s, stop
//   6. On deactivate: DELETE /api/shutdown then kill
// ============================================================================

import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as net from 'net';
import { EventEmitter } from 'events';
import * as vscode from 'vscode';
import { BackendClient } from './services/BackendClient';
import { BackendStatus } from './types';

const MAX_PORT_RETRIES = 10;
const HEALTH_CHECK_INTERVAL_MS = 500;
const HEALTH_CHECK_TIMEOUT_MS = 10_000;
const CRASH_RESTART_WINDOW_MS = 30_000;

export class BackendManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private port: number | null = null;
  private client: BackendClient | null = null;
  private crashTimestamps: number[] = [];
  private status: BackendStatus = { state: 'stopped' };

  constructor(
    private readonly pythonPath: string,
    private readonly backendScriptPath: string,
    private readonly workspacePath: string,
    private readonly startPort: number = 8765
  ) {
    super();
  }

  // ─── Startup ────────────────────────────────────────────────────────
  async start(): Promise<BackendStatus> {
    if (this.status.state === 'ready') return this.status;

    this.setStatus({ state: 'starting' });

    // Find free port
    this.port = await this.findFreePort(this.startPort);
    if (!this.port) {
      const msg = `Cannot start backend — ports ${this.startPort}-${this.startPort + MAX_PORT_RETRIES} all in use.`;
      this.setStatus({ state: 'crashed', lastError: msg });
      vscode.window.showErrorMessage(msg);
      return this.status;
    }

    this.client = new BackendClient(`http://127.0.0.1:${this.port}`);

    // Spawn Python process
    this.process = spawn(
      this.pythonPath,
      [this.backendScriptPath, '--port', String(this.port), '--workspace', this.workspacePath],
      { env: { ...process.env }, detached: false }
    );

    this.process.on('exit', (code, signal) => {
      const wasReady = this.status.state === 'ready';
      console.warn(`[Noctilux] Python backend exited: code=${code} signal=${signal}`);
      if (wasReady) {
        this.handleCrash();
      }
    });

    this.process.stderr?.on('data', (chunk: Buffer) => {
      console.error(`[Noctilux backend stderr] ${chunk.toString()}`);
    });

    // Health check polling
    const ready = await this.waitForHealth();
    if (ready) {
      this.setStatus({ state: 'ready', port: this.port, pid: this.process?.pid });
    } else {
      this.setStatus({
        state: 'crashed',
        lastError: 'Health check timeout — backend failed to start within 10s.',
      });
      vscode.window.showErrorMessage(
        'Noctilux backend failed to start. Click "Restart Backend" to retry.',
        'Restart Backend'
      ).then(action => {
        if (action === 'Restart Backend') this.restart();
      });
    }

    return this.status;
  }

  // ─── Health Polling ─────────────────────────────────────────────────
  private async waitForHealth(): Promise<boolean> {
    if (!this.client) return false;
    const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const h = await this.client.health();
        if (h.status === 'ok') return true;
      } catch {
        // Still starting
      }
      await new Promise(r => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
    }
    return false;
  }

  // ─── Crash Recovery ────────────────────────────────────────────────
  private async handleCrash(): Promise<void> {
    const now = Date.now();
    this.crashTimestamps = this.crashTimestamps.filter(t => now - t < CRASH_RESTART_WINDOW_MS);
    this.crashTimestamps.push(now);

    if (this.crashTimestamps.length === 1) {
      console.warn('[Noctilux] Auto-restarting backend (first crash)...');
      await new Promise(r => setTimeout(r, 1000));
      await this.start();
    } else {
      this.setStatus({ state: 'crashed', lastError: 'Backend crashed twice within 30s. Manual restart required.' });
      vscode.window.showErrorMessage(
        'Noctilux backend crashed twice within 30s. Click "Restart Backend" to retry manually.',
        'Restart Backend'
      ).then(action => {
        if (action === 'Restart Backend') this.restart();
      });
    }
  }

  // ─── Restart (manual) ──────────────────────────────────────────────
  async restart(): Promise<BackendStatus> {
    await this.stop();
    this.crashTimestamps = [];
    return this.start();
  }

  // ─── Shutdown ───────────────────────────────────────────────────────
  async stop(): Promise<void> {
    if (this.client) {
      await this.client.shutdown();
    }
    if (this.process) {
      // Wait 2s then SIGKILL
      await new Promise(r => setTimeout(r, 500));
      if (!this.process.killed) {
        this.process.kill('SIGTERM');
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill('SIGKILL');
          }
        }, 1500);
      }
      this.process = null;
    }
    this.setStatus({ state: 'stopped' });
  }

  // ─── Port Scanner ──────────────────────────────────────────────────
  private findFreePort(start: number): Promise<number | null> {
    return new Promise(resolve => {
      const tryPort = (port: number, attemptsLeft: number) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', () => {
          if (attemptsLeft > 0) tryPort(port + 1, attemptsLeft - 1);
          else resolve(null);
        });
        srv.listen(port, '127.0.0.1', () => {
          srv.close(() => resolve(port));
        });
      };
      tryPort(start, MAX_PORT_RETRIES);
    });
  }

  // ─── Status ─────────────────────────────────────────────────────────
  getClient(): BackendClient | null {
    return this.client;
  }

  getStatus(): BackendStatus {
    return this.status;
  }

  private setStatus(s: BackendStatus) {
    this.status = s;
    this.emit('status', s);
  }
}
