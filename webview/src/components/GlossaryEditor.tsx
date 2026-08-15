// ============================================================================
// GlossaryEditor.tsx — Business glossary CRUD interface
// Implements Novel Contribution #10 (Semantic Layer with Business Glossary).
// ============================================================================
import { useState } from 'react';
import type { GlossaryTerm } from '../../../src/types';
import { postMessage } from '../vscode';

const SAMPLE: GlossaryTerm[] = [
  {
    term: 'active_user',
    sqlTemplate: "COUNT(DISTINCT user_id) WHERE last_login > NOW() - INTERVAL 30 DAY",
    aliases: ['active users', 'engaged users', 'monthly active', 'MAU'],
    description: 'Users who logged in within the last 30 days',
    dialect: 'postgresql',
    owner: 'analytics_team',
    lastValidated: '2026-08-10',
  },
  {
    term: 'revenue',
    sqlTemplate: 'SUM(order_total)',
    aliases: ['sales', 'gross sales'],
    description: 'Total revenue from completed orders',
    dialect: 'postgresql',
    owner: 'finance_team',
    lastValidated: '2026-08-12',
  },
];

export default function GlossaryEditor() {
  const [terms, setTerms] = useState<GlossaryTerm[]>(SAMPLE);
  const [editing, setEditing] = useState<GlossaryTerm | null>(null);

  const startNew = () => {
    setEditing({
      term: '',
      sqlTemplate: '',
      aliases: [],
      description: '',
      dialect: 'postgresql',
      owner: 'me',
      lastValidated: new Date().toISOString().slice(0, 10),
    });
  };

  const save = () => {
    if (!editing) return;
    if (!editing.term.trim()) return;
    setTerms(prev => {
      const idx = prev.findIndex(t => t.term === editing.term);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = editing;
        return copy;
      }
      return [...prev, editing];
    });
    postMessage('GLOSSARY_SAVED', editing);
    setEditing(null);
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-base font-semibold">Business Glossary</h2>
        <button
          onClick={startNew}
          className="bg-qm-accent text-white text-xs px-3 py-1 rounded"
        >
          + Add Term
        </button>
      </div>

      <p className="text-xs opacity-70 mb-4">
        Glossary terms enable deterministic SQL generation when NL input matches
        a known metric (similarity &gt; 0.80). For similarity 0.50–0.80, the
        template is used as a few-shot hint. Below 0.50, the full LLM
        text-to-SQL pipeline runs.
      </p>

      {/* Term list */}
      <div className="space-y-2">
        {terms.map(t => (
          <div
            key={t.term}
            className="border border-qm-border rounded p-2 cursor-pointer hover:bg-qm-hover"
            onClick={() => setEditing({ ...t })}
          >
            <div className="flex justify-between">
              <span className="font-mono text-qm-accent">{t.term}</span>
              <span className="text-xs opacity-60">{t.dialect} · {t.owner}</span>
            </div>
            <p className="text-xs mt-1 font-mono bg-[var(--vscode-editor-background)] p-1 rounded">
              {t.sqlTemplate}
            </p>
            <p className="text-xs mt-1 opacity-70">{t.description}</p>
            {t.aliases.length > 0 && (
              <div className="flex gap-1 mt-1 flex-wrap">
                {t.aliases.map(a => (
                  <span
                    key={a}
                    className="text-xs px-1 py-0.5 border border-qm-border rounded opacity-70"
                  >
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Editor modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--vscode-editor-background)] border border-qm-border rounded p-4 w-[500px] max-h-[80vh] overflow-auto">
            <h3 className="text-sm font-semibold mb-2">
              {terms.some(t => t.term === editing.term) ? 'Edit' : 'New'} Glossary Term
            </h3>
            <div className="space-y-2 text-xs">
              <Field label="Term (snake_case identifier)">
                <input
                  value={editing.term}
                  onChange={e => setEditing({ ...editing, term: e.target.value })}
                  className="w-full bg-transparent border border-qm-border rounded px-2 py-1 font-mono"
                  placeholder="active_user"
                />
              </Field>
              <Field label="SQL Template">
                <textarea
                  value={editing.sqlTemplate}
                  onChange={e => setEditing({ ...editing, sqlTemplate: e.target.value })}
                  className="w-full bg-transparent border border-qm-border rounded px-2 py-1 font-mono"
                  rows={3}
                />
              </Field>
              <Field label="Aliases (comma-separated)">
                <input
                  value={editing.aliases.join(', ')}
                  onChange={e => setEditing({
                    ...editing,
                    aliases: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                  })}
                  className="w-full bg-transparent border border-qm-border rounded px-2 py-1"
                />
              </Field>
              <Field label="Description">
                <input
                  value={editing.description}
                  onChange={e => setEditing({ ...editing, description: e.target.value })}
                  className="w-full bg-transparent border border-qm-border rounded px-2 py-1"
                />
              </Field>
              <div className="flex gap-2">
                <Field label="Dialect">
                  <select
                    value={editing.dialect}
                    onChange={e => setEditing({ ...editing, dialect: e.target.value })}
                    className="bg-transparent border border-qm-border rounded px-2 py-1"
                  >
                    {['postgresql', 'mysql', 'sqlite', 'mssql'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Owner">
                  <input
                    value={editing.owner}
                    onChange={e => setEditing({ ...editing, owner: e.target.value })}
                    className="bg-transparent border border-qm-border rounded px-2 py-1"
                  />
                </Field>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setEditing(null)}
                className="px-3 py-1 text-xs border border-qm-border rounded"
              >
                Cancel
              </button>
              <button
                onClick={save}
                className="px-3 py-1 text-xs bg-qm-accent text-white rounded"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs opacity-70 mb-1">{label}</span>
      {children}
    </label>
  );
}
