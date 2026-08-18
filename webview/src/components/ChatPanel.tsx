// ============================================================================
// ChatPanel.tsx — NL input + message history
// ============================================================================
import { useEffect, useState } from 'react';
import type { ChatMessage, DBConfig } from '../../../src/types';
import MessageBubble from './MessageBubble';
import { onMessage, postMessage } from '../vscode';

interface Props {
  messages: ChatMessage[];
  onSend: (text: string, dbConfigId: string) => void;
}

export default function ChatPanel({ messages, onSend }: Props) {
  const [input, setInput] = useState('');
  const [dbConfigId, setDbConfigId] = useState('default');
  const [connections, setConnections] = useState<DBConfig[]>([]);

  // Ask the extension host for the saved connections and keep the list in
  // sync when connections are added/removed.
  useEffect(() => {
    postMessage('GET_CONNECTIONS', {});
    const off = onMessage(msg => {
      if (msg.type === 'CONNECTIONS_UPDATED') {
        const list = (msg.payload as { connections: DBConfig[] }).connections ?? [];
        setConnections(list);
        if (list.length > 0 && (dbConfigId === 'default' || !list.some(c => c.id === dbConfigId))) {
          setDbConfigId(list[0].id);
        }
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text, dbConfigId);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-qm-fg opacity-60 text-xs p-4 text-center">
            <p className="mb-2">Ask Verbis anything about your database.</p>
            <p className="italic">Try: "Show me the top customers last quarter"</p>
          </div>
        )}
        {messages.map(m => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      {/* Input row — shrink-0 keeps it pinned; explicit VS Code theme colors
          so the textarea is visible even if utility classes are purged. */}
      <div className="shrink-0 border-t border-qm-border p-2 flex gap-2 items-end">
        <select
          value={dbConfigId}
          onChange={e => setDbConfigId(e.target.value)}
          className="bg-transparent border border-qm-border rounded text-xs px-2 py-1"
          style={{
            background: 'var(--vscode-dropdown-background)',
            color: 'var(--vscode-dropdown-foreground)',
            borderColor: 'var(--vscode-dropdown-border, var(--vscode-panel-border))',
          }}
        >
          {connections.length === 0 && <option value="default">Default DB</option>}
          {connections.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask in natural language… (Ctrl+Enter to send)"
          rows={2}
          className="flex-1 border rounded px-2 py-1 text-xs resize-none focus:outline-none focus:border-qm-accent"
          style={{
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            borderColor: 'var(--vscode-input-border, var(--vscode-panel-border))',
          }}
        />
        <button
          onClick={submit}
          disabled={!input.trim()}
          className="bg-qm-accent text-white px-4 py-1 rounded text-xs disabled:opacity-50"
          style={{
            background: 'var(--vscode-button-background)',
            color: 'var(--vscode-button-foreground)',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
