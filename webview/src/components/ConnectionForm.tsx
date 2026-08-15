// ============================================================================
// ConnectionForm.tsx — DB connection form (no password stored here)
// ============================================================================
import { useState } from 'react';
import { postMessage } from '../vscode';

const DIALECTS = ['postgresql', 'mysql', 'sqlite', 'mssql', 'mongodb'] as const;

export default function ConnectionForm() {
  const [form, setForm] = useState({
    name: '',
    dialect: 'postgresql' as typeof DIALECTS[number],
    host: 'localhost',
    port: 5432,
    database: '',
    user: '',
    password: '',
    ssl: false,
  });
  const [saved, setSaved] = useState(false);

  const submit = () => {
    if (!form.name || !form.database || !form.user) return;
    // Send WITHOUT password — password goes through SecretStorage via extension host
    postMessage('CONNECTION_FORM_SAVE', { ...form, password: '' });
    if (form.password) {
      // Password is sent over postMessage to extension host, which stores it in SecretStorage
      postMessage('STORE_DB_PASSWORD', { name: form.name, password: form.password });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-4 max-w-xl">
      <h2 className="text-base font-semibold mb-3">Add Database Connection</h2>
      <p className="text-xs opacity-70 mb-4">
        Passwords are stored in VS Code SecretStorage (backed by the OS keychain).
        They never appear in any file under <code>.qmind/</code>.
      </p>

      <div className="space-y-3 text-xs">
        <Row label="Connection name">
          <input
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="Production Postgres"
            className="w-full bg-transparent border border-qm-border rounded px-2 py-1"
          />
        </Row>
        <Row label="Dialect">
          <select
            value={form.dialect}
            onChange={e => setForm({ ...form, dialect: e.target.value as any, port: e.target.value === 'mysql' ? 3306 : e.target.value === 'postgresql' ? 5432 : 1433 })}
            className="bg-transparent border border-qm-border rounded px-2 py-1"
          >
            {DIALECTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </Row>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Host">
            <input
              value={form.host}
              onChange={e => setForm({ ...form, host: e.target.value })}
              className="w-full bg-transparent border border-qm-border rounded px-2 py-1"
            />
          </Row>
          <Row label="Port">
            <input
              type="number"
              value={form.port}
              onChange={e => setForm({ ...form, port: parseInt(e.target.value || '5432', 10) })}
              className="w-full bg-transparent border border-qm-border rounded px-2 py-1"
            />
          </Row>
        </div>
        <Row label="Database / Collection">
          <input
            value={form.database}
            onChange={e => setForm({ ...form, database: e.target.value })}
            className="w-full bg-transparent border border-qm-border rounded px-2 py-1"
          />
        </Row>
        <Row label="User">
          <input
            value={form.user}
            onChange={e => setForm({ ...form, user: e.target.value })}
            className="w-full bg-transparent border border-qm-border rounded px-2 py-1"
          />
        </Row>
        <Row label="Password (stored in OS keychain)">
          <input
            type="password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            className="w-full bg-transparent border border-qm-border rounded px-2 py-1"
          />
        </Row>
        <Row label="SSL">
          <input
            type="checkbox"
            checked={form.ssl}
            onChange={e => setForm({ ...form, ssl: e.target.checked })}
          />
        </Row>
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={submit}
            disabled={!form.name || !form.database || !form.user}
            className="bg-qm-accent text-white px-4 py-1 rounded disabled:opacity-50"
          >
            Save
          </button>
          {saved && <span className="text-qm-good">✓ Saved</span>}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block opacity-70 mb-1">{label}</span>
      {children}
    </label>
  );
}
