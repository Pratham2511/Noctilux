// ============================================================================
// App.tsx — Root component: routes between Chat / Schema / Tree / Glossary
// ============================================================================
import { useEffect, useState } from 'react';
import ChatPanel from './components/ChatPanel';
import ResultTable from './components/ResultTable';
import ConfidenceBar from './components/ConfidenceBar';
import NarrativeCard from './components/NarrativeCard';
import QueryTreeView from './components/QueryTreeView';
import GlossaryEditor from './components/GlossaryEditor';
import ConnectionForm from './components/ConnectionForm';
import RobustnessReport from './components/RobustnessReport';
import MessageBubble from './components/MessageBubble';
import SQLCodeBlock from './components/SQLCodeBlock';
import type { ChatMessage, BackendStatus } from '../../src/types';
import { onMessage, postMessage } from './vscode';

type Tab = 'chat' | 'schema' | 'tree' | 'glossary' | 'robustness' | 'connections';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>({ state: 'starting' });

  useEffect(() => {
    const off = onMessage(msg => {
      switch (msg.type) {
        case 'SQL_GENERATED': {
          const p = msg.payload as any;
          const assistantMsg: ChatMessage = {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: p.explanation || 'Here is the SQL I generated.',
            timestamp: Date.now(),
            metadata: {
              sql: p.sql,
              confidence: p.confidence,
              alternatives: p.alternatives,
              narrative: p.narrative,
              planExplanation: p.planExplanation,
              ambiguityQuestions: p.ambiguityQuestions,
              queryNodeId: p.queryNodeId,
            },
          };
          setMessages(prev => [...prev, assistantMsg]);
          break;
        }
        case 'EXECUTION_COMPLETE': {
          // Attach execution result to the last assistant message
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== 'assistant') return prev;
            const updated = {
              ...last,
              metadata: { ...last.metadata, executionResult: msg.payload as any },
            };
            return [...prev.slice(0, -1), updated];
          });
          break;
        }
        case 'BACKEND_STATUS':
          setBackendStatus(msg.payload as BackendStatus);
          break;
        case 'ERROR':
          setMessages(prev => [
            ...prev,
            {
              id: `e-${Date.now()}`,
              role: 'system',
              content: `Error: ${(msg.payload as any).message}`,
              timestamp: Date.now(),
            },
          ]);
          break;
      }
    });
    return off;
  }, []);

  const handleSend = (text: string, dbConfigId: string) => {
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    postMessage('GENERATE_SQL', { input: text, sessionId: 'default', dbConfigId });
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Top tab bar */}
      <nav className="flex border-b border-qm-border text-xs">
        {(['chat', 'schema', 'tree', 'glossary', 'robustness', 'connections'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 border-r border-qm-border ${
              activeTab === tab ? 'bg-qm-hover text-qm-accent' : 'text-qm-fg'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
        <div className="ml-auto px-3 py-2 text-qm-fg">
          <span
            className="inline-block w-2 h-2 rounded-full mr-2"
            style={{
              background:
                backendStatus.state === 'ready'
                  ? '#4ec9b0'
                  : backendStatus.state === 'starting'
                  ? '#d4a017'
                  : '#f14c4c',
            }}
          />
          Backend: {backendStatus.state}
        </div>
      </nav>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'chat' && (
          <ChatPanel messages={messages} onSend={handleSend} />
        )}
        {activeTab === 'schema' && <SchemaPlaceholderView />}
        {activeTab === 'tree' && <QueryTreeView />}
        {activeTab === 'glossary' && <GlossaryEditor />}
        {activeTab === 'robustness' && <RobustnessReport />}
        {activeTab === 'connections' && <ConnectionForm />}
      </div>
    </div>
  );
}

function SchemaPlaceholderView() {
  return (
    <div className="p-4">
      <h2 className="text-base font-semibold mb-2">Schema &amp; ER Diagram</h2>
      <p className="text-qm-fg text-xs">
        Schema introspection is shown in the dedicated Schema Panel (use the
        Command Palette &gt; "QueryMind: Show Schema / ER Diagram"). The ER
        diagram is auto-generated via Mermaid.js from the introspected
        SQLAlchemy reflection and saved to <code>.qmind/er_diagram.svg</code>.
      </p>
      <p className="text-qm-fg text-xs mt-2">
        Use NL-driven schema modification in the chat panel (e.g., "add a
        discount column to orders") — DDL changes trigger the Schema Change
        Impact Predictor (Component #9).
      </p>
    </div>
  );
}
