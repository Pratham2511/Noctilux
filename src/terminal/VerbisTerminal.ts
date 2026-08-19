// ============================================================================
// Verbis — VerbisTerminal
// src/terminal/VerbisTerminal.ts
//
// A Claude Code–style conversational REPL hosted in VS Code's integrated
// terminal via the Pseudoterminal API. This class owns ONLY terminal I/O:
// keystroke handling, line editing, output formatting, and the read-eval-print
// loop. All agent intelligence lives in AssistantSession → BackendClient.
//
// Design contract (per task spec):
//  - Real terminal: cursor, typing, backspace, Enter, Ctrl+C all behave like a
//    normal interactive CLI.
//  - One input at a time: while a request is in flight, further Enter presses
//    are ignored (with a notice); Ctrl+C cancels.
//  - Slash commands are handled locally and never reach the backend.
//  - Output is plain text with conservative ANSI color; no control sequences
//    that could corrupt the terminal.
// ============================================================================

import * as vscode from 'vscode';
import { AssistantSession, AssistantReply, ExecuteOutcome } from '../assistant/AssistantSession';
import { BackendStatus } from '../types';

// ─── ANSI helpers (conservative, widely-supported SGR codes only) ─────────
const ESC = '';
const ANSI = {
  reset:   `${ESC}[0m`,
  bold:    `${ESC}[1m`,
  dim:     `${ESC}[2m`,
  italic:  `${ESC}[3m`,
  fgCyan:  `${ESC}[36m`,
  fgGreen: `${ESC}[32m`,
  fgYellow:`${ESC}[33m`,
  fgRed:   `${ESC}[31m`,
  fgGray:  `${ESC}[90m`,
};

const c = (code: string, s: string) => `${code}${s}${ANSI.reset}`;

const PROMPT = `${c(ANSI.fgCyan + ANSI.bold, 'verbis')} ${c(ANSI.fgGray, '›')} `;
const MAX_RESULT_ROWS = 50;   // truncate large result sets
const MAX_CELL_WIDTH  = 40;   // truncate wide cells

export class VerbisTerminal implements vscode.Pseudoterminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  readonly onDidWrite: vscode.Event<string> = this.writeEmitter.event;

  private inputBuffer = '';
  private lastSql: string | null = null;
  private disposed = false;

  constructor(
    private readonly session: AssistantSession,
    private readonly getStatus: () => BackendStatus,
    private readonly onExit: () => void,
  ) {}

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  open(): void {
    this.printBanner();
    this.prompt();
  }

  close(): void {
    this.disposed = true;
    this.session.cancel();
  }

  // ─── Input handling (keystroke-level, like a real CLI) ─────────────────

  handleInput(data: string): void {
    if (this.disposed) { return; }

    for (const ch of data) {
      // Ctrl+C — cancel in-flight work, or clear the line.
      if (ch === '') {
        if (this.session.isBusy) {
          this.session.cancel();
          this.writeln(`\r\n${c(ANSI.fgYellow, '^C — cancelling…')}`);
        } else {
          this.inputBuffer = '';
          this.writeln('\r');
          this.prompt();
        }
        continue;
      }

      // While busy, ignore everything except Ctrl+C (handled above).
      if (this.session.isBusy) {
        if (ch === '\r' || ch === '\n') {
          this.writeln(`\r\n${c(ANSI.fgGray, '(working — press Ctrl+C to cancel)')}`);
        }
        continue;
      }

      // Enter — submit the line.
      if (ch === '\r' || ch === '\n') {
        const line = this.inputBuffer;
        this.inputBuffer = '';
        this.writeln('\r\n');
        void this.evaluate(line);
        continue;
      }

      // Backspace (\x7f on most platforms, \b on some).
      if (ch === '\x7f' || ch === '\b') {
        if (this.inputBuffer.length > 0) {
          this.inputBuffer = this.inputBuffer.slice(0, -1);
          // Erase last char on screen: move back, write space, move back.
          this.write('\b \b');
        }
        continue;
      }

      // Ignore other control characters (arrows, etc.) conservatively.
      if (ch < ' ' && ch !== '\t') { continue; }

      // Regular printable character — echo and buffer.
      this.inputBuffer += ch;
      this.write(ch);
    }
  }

  // ─── Read-Eval-Print Loop ───────────────────────────────────────────────

  private async evaluate(line: string): Promise<void> {
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      this.prompt();
      return;
    }

    // Slash commands are handled locally — never sent to the backend.
    if (trimmed.startsWith('/')) {
      await this.handleCommand(trimmed);
      return;
    }

    // Regular natural-language turn → existing agent pipeline.
    const reply = await this.session.ask(trimmed);
    this.renderReply(reply);
    this.prompt();
  }

  private renderReply(reply: AssistantReply): void {
    switch (reply.kind) {
      case 'sql': {
        if (reply.sql) {
          this.lastSql = reply.sql;
          this.writeln(c(ANSI.fgGreen + ANSI.bold, 'SQL:'));
          this.writeln(this.indent(this.highlightSql(reply.sql)));
          this.writeln('');
        }
        if (reply.explanation) {
          this.writeln(c(ANSI.dim, this.indent(reply.explanation)));
          this.writeln('');
        }
        if (reply.message) {
          this.writeln(c(ANSI.fgGray, reply.message));
        }
        if (reply.alternatives && reply.alternatives.length > 0) {
          this.writeln(c(ANSI.fgGray, `${reply.alternatives.length} alternative interpretation(s) available.`));
        }
        this.writeln(c(ANSI.fgGray, 'Type /run to execute, or keep chatting.'));
        break;
      }
      case 'message':
        if (reply.message) { this.writeln(reply.message); }
        break;
      case 'error':
        this.writeln(c(ANSI.fgRed, `✗ ${reply.message ?? 'Unknown error'}`));
        break;
      case 'cancelled':
        this.writeln(c(ANSI.fgYellow, 'Cancelled.'));
        break;
    }
  }

  // ─── Slash commands (local only) ────────────────────────────────────────

  private async handleCommand(input: string): Promise<void> {
    const [cmd, ...rest] = input.split(/\s+/);
    const arg = rest.join(' ');

    switch (cmd.toLowerCase()) {
      case '/help':
        this.printHelp();
        break;

      case '/clear':
        // Clear scrollback + screen, then redraw the prompt.
        this.write(`${ESC}[2J${ESC}[3J${ESC}[H`);
        this.prompt();
        return; // prompt already printed

      case '/status':
        this.printStatus();
        break;

      case '/model':
        this.writeln(`Provider: ${c(ANSI.bold, this.session.providerLabel)}`);
        this.writeln(c(ANSI.fgGray, 'Change via "Verbis: Set API Key" or the verbis.llm.provider setting.'));
        break;

      case '/history':
        this.printHistory();
        break;

      case '/reset':
        this.session.reset();
        this.lastSql = null;
        this.writeln(c(ANSI.fgGreen, 'Conversation reset. Starting fresh.'));
        break;

      case '/cancel':
        if (this.session.isBusy) {
          this.session.cancel();
          this.writeln(c(ANSI.fgYellow, 'Cancelling…'));
        } else {
          this.writeln(c(ANSI.fgGray, 'Nothing in flight.'));
        }
        break;

      case '/run':
        await this.runLastSql();
        return; // runLastSql prints the prompt when done

      case '/exit':
        this.writeln(c(ANSI.fgGray, 'Closing Verbis assistant…'));
        this.onExit();
        return;

      default:
        this.writeln(c(ANSI.fgRed, `Unknown command: ${cmd}`));
        this.writeln(c(ANSI.fgGray, 'Type /help for available commands.'));
    }
    this.prompt();
  }

  private async runLastSql(): Promise<void> {
    if (!this.lastSql) {
      this.writeln(c(ANSI.fgGray, 'No SQL to run yet — ask a question first.'));
      this.prompt();
      return;
    }
    this.writeln(c(ANSI.fgGray, 'Executing…'));
    const outcome: ExecuteOutcome = await this.session.execute(this.lastSql);
    if (outcome.kind === 'result' && outcome.result) {
      this.printResultTable(outcome.result);
    } else if (outcome.kind === 'cancelled') {
      this.writeln(c(ANSI.fgYellow, 'Execution cancelled.'));
    } else {
      this.writeln(c(ANSI.fgRed, `✗ ${outcome.message ?? 'Execution failed'}`));
    }
    this.prompt();
  }

  // ─── Output rendering ───────────────────────────────────────────────────

  private printBanner(): void {
    const status = this.getStatus();
    const statusText = status.state === 'ready'
      ? c(ANSI.fgGreen, `● backend ready (port ${status.port ?? '?'})`)
      : c(ANSI.fgYellow, `● backend ${status.state}`);

    this.writeln(c(ANSI.fgCyan + ANSI.bold, '┌─ Verbis Assistant ─────────────────────────────'));
    this.writeln(c(ANSI.fgCyan, '│'));
    this.writeln(`${c(ANSI.fgCyan, '│')}  Ask questions in plain English. Verbis generates`);
    this.writeln(`${c(ANSI.fgCyan, '│')}  SQL through the existing agent pipeline.`);
    this.writeln(c(ANSI.fgCyan, '│'));
    this.writeln(`${c(ANSI.fgCyan, '│')}  ${statusText}   provider: ${c(ANSI.bold, this.session.providerLabel)}`);
    this.writeln(`${c(ANSI.fgCyan, '│')}  ${c(ANSI.fgGray, '/help for commands · Ctrl+C to cancel · /exit to close')}`);
    this.writeln(c(ANSI.fgCyan, '└─────────────────────────────────────────────────'));
    this.writeln('');
  }

  private printHelp(): void {
    const rows: Array<[string, string]> = [
      ['/help',   'Show this help'],
      ['/run',    'Execute the last generated SQL'],
      ['/status', 'Show backend + session status'],
      ['/model',  'Show the active LLM provider'],
      ['/history','Show this conversation\'s turns'],
      ['/clear',  'Clear the screen'],
      ['/reset',  'Start a new conversation'],
      ['/cancel', 'Cancel the in-flight request'],
      ['/exit',   'Close the assistant'],
    ];
    this.writeln(c(ANSI.bold, 'Commands:'));
    for (const [cmd, desc] of rows) {
      this.writeln(`  ${c(ANSI.fgCyan, cmd.padEnd(10))} ${c(ANSI.fgGray, desc)}`);
    }
    this.writeln('');
    this.writeln(c(ANSI.fgGray, 'Anything else is sent to the Verbis agent as a question.'));
  }

  private printStatus(): void {
    const s = this.getStatus();
    this.writeln(c(ANSI.bold, 'Status:'));
    this.writeln(`  backend   ${s.state}${s.port ? ` (port ${s.port})` : ''}`);
    this.writeln(`  provider  ${this.session.providerLabel}`);
    this.writeln(`  session   ${this.session.id.slice(0, 8)}…`);
    this.writeln(`  turns     ${this.session.transcript.length}`);
    this.writeln(`  busy      ${this.session.isBusy ? 'yes' : 'no'}`);
  }

  private printHistory(): void {
    const t = this.session.transcript;
    if (t.length === 0) {
      this.writeln(c(ANSI.fgGray, 'No history yet.'));
      return;
    }
    this.writeln(c(ANSI.bold, 'Conversation:'));
    for (const entry of t.slice(-20)) {
      const who = entry.role === 'user' ? c(ANSI.fgCyan, 'you') : c(ANSI.fgGreen, 'verbis');
      const snippet = entry.content.length > 80
        ? entry.content.slice(0, 77) + '…'
        : entry.content;
      this.writeln(`  ${who}: ${snippet}`);
    }
  }

  private printResultTable(r: import('../types').ExecutionResult): void {
    this.writeln(c(ANSI.fgGreen, `✓ ${r.rowCount} row(s) in ${r.executionTimeMs} ms`));
    if (r.columns.length === 0) { return; }

    const rows = r.rows.slice(0, MAX_RESULT_ROWS);
    const widths = r.columns.map(col =>
      Math.min(
        MAX_CELL_WIDTH,
        Math.max(col.length, ...rows.map(row => this.cellText(row[col]).length)),
      ),
    );

    const sep = '─';
    const header = r.columns.map((col, i) => c(ANSI.bold, col.padEnd(widths[i]))).join(' ┬ ');
    this.writeln(header);
    this.writeln(widths.map(w => sep.repeat(w)).join('─┼─'));

    for (const row of rows) {
      this.writeln(
        r.columns.map((col, i) => {
          const text = this.cellText(row[col]);
          return text.length > widths[i]
            ? text.slice(0, widths[i] - 1) + '…'
            : text.padEnd(widths[i]);
        }).join(' │ '),
      );
    }

    if (r.rowCount > MAX_RESULT_ROWS) {
      this.writeln(c(ANSI.fgGray, `… ${r.rowCount - MAX_RESULT_ROWS} more row(s) truncated`));
    }
    if (r.truncated) {
      this.writeln(c(ANSI.fgYellow, '(result truncated by row limit)'));
    }
  }

  private cellText(v: unknown): string {
    if (v === null || v === undefined) { return 'NULL'; }
    if (typeof v === 'object') { return JSON.stringify(v); }
    return String(v);
  }

  private highlightSql(sql: string): string {
    // Very light keyword highlighting; safe because we only add SGR codes.
    return sql.replace(
      /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|GROUP BY|ORDER BY|LIMIT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|AND|OR|NOT|NULL|AS|ON|IN|EXISTS|BETWEEN|LIKE|HAVING|UNION)\b/gi,
      m => c(ANSI.fgCyan, m.toUpperCase()),
    );
  }

  private indent(s: string): string {
    return s.split('\n').map(l => `  ${l}`).join('\r\n');
  }

  // ─── Low-level output ───────────────────────────────────────────────────

  private prompt(): void {
    this.write(`\r\n${PROMPT}`);
  }

  private writeln(s: string): void {
    // Normalize to CRLF — terminals expect \r\n for new lines.
    this.write(s.replace(/\r?\n/g, '\r\n') + '\r\n');
  }

  private write(s: string): void {
    if (!this.disposed) {
      this.writeEmitter.fire(s);
    }
  }
}
