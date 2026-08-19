// ============================================================================
// App.tsx — Root component: routes between Chat / Schema / Tree / Glossary
// ============================================================================
import { useEffect, useState } from 'react';
import QueryTreeView from './components/QueryTreeView';
import GlossaryEditor from './components/GlossaryEditor';
import ConnectionForm from './components/ConnectionForm';
import { ApiKeySettings } from './components/ApiKeySettings';
import { SchemaCreator } from './components/SchemaCreator';
import RobustnessReport from './components/RobustnessReport';
import type { BackendStatus } from '../../src/types';
import { onMessage } from './vscode';

type Tab = 'schema' | 'createdb' | 'tree' | 'glossary' | 'robustness' | 'connections';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('connections');
  const [backendStatus, setBackendStatus] = useState<BackendStatus>({ state: 'starting' });

  useEffect(() => {
    const off = onMessage(msg => {
      if (msg.type === 'BACKEND_STATUS') {
        setBackendStatus(msg.payload as BackendStatus);
      }
    });
    return off;
  }, []);

  return (
    <div className="flex flex-col h-screen">
      {/* Top tab bar */}
      <nav className="flex border-b border-qm-border text-xs">
        {(['schema', 'createdb', 'tree', 'glossary', 'robustness', 'connections'] as Tab[]).map(tab => (
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
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === 'schema' && <SchemaPlaceholderView />}
        {activeTab === 'createdb' && <SchemaCreator />}
        {activeTab === 'tree' && <QueryTreeView />}
        {activeTab === 'glossary' && <GlossaryEditor />}
        {activeTab === 'robustness' && <RobustnessReport />}
        {activeTab === 'connections' && (
          <>
            <ApiKeySettings />
            <ConnectionForm />
          </>
        )}
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
        Command Palette &gt; "Verbis: Show Schema / ER Diagram"). The ER
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
