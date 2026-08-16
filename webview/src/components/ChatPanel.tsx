// ============================================================================
// ChatPanel.tsx — NL input + message history
// ============================================================================
import { useState } from 'react';
import type { ChatMessage } from '../../../src/types';
import MessageBubble from './MessageBubble';

interface Props {
  messages: ChatMessage[];
  onSend: (text: string, dbConfigId: string) => void;
}

export default function ChatPanel({ messages, onSend }: Props) {
  const [input, setInput] = useState('');
  const [dbConfigId, setDbConfigId] = useState('default');

  const submit = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text, dbConfigId);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
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

      {/* Input row */}
      <div className="border-t border-qm-border p-2 flex gap-2">
        <select
          value={dbConfigId}
          onChange={e => setDbConfigId(e.target.value)}
          className="bg-transparent border border-qm-border rounded text-xs px-2"
        >
          <option value="default">Default DB</option>
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
          placeholder="Ask in natural language… (⌘/Ctrl+Enter to send)"
          rows={2}
          className="flex-1 bg-transparent border border-qm-border rounded px-2 py-1 text-xs resize-none focus:outline-none focus:border-qm-accent"
        />
        <button
          onClick={submit}
          disabled={!input.trim()}
          className="bg-qm-accent text-white px-4 py-1 rounded text-xs disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
