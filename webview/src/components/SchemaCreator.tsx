import { useState, useEffect } from 'react';

declare function acquireVsCodeApi(): any;
const vscode = acquireVsCodeApi();

type Stage = 'input' | 'preview' | 'done';

export function SchemaCreator() {
    const [stage, setStage] = useState<Stage>('input');
    const [description, setDescription] = useState('');
    const [dialect, setDialect] = useState('postgresql');
    const [schema, setSchema] = useState<any>(null);
    const [ddl, setDdl] = useState('');
    const [mermaid, setMermaid] = useState('');
    const [tableCount, setTableCount] = useState(0);
    const [refinement, setRefinement] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const handler = (event: MessageEvent) => {
            const msg = event.data;
            if (msg.type === 'SCHEMA_RESULT') {
                setSchema(msg.payload.schema);
                setDdl(msg.payload.ddl);
                setMermaid(msg.payload.mermaid);
                setTableCount(msg.payload.table_count);
                setStage('preview');
                setLoading(false);
                setRefinement('');
            }
            if (msg.type === 'SCHEMA_EXECUTED') {
                setStage('done');
                setLoading(false);
            }
            if (msg.type === 'SCHEMA_ERROR') {
                setError(msg.payload.message);
                setLoading(false);
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    const generate = () => {
        if (!description.trim()) return;
        setLoading(true);
        setError('');
        vscode.postMessage({ type: 'SCHEMA_CREATE', payload: { description, dialect } });
    };

    const refine = () => {
        if (!refinement.trim()) return;
        setLoading(true);
        setError('');
        vscode.postMessage({ type: 'SCHEMA_REFINE', payload: { schema, refinement, dialect } });
    };

    const execute = () => {
        setLoading(true);
        vscode.postMessage({ type: 'SCHEMA_EXECUTE', payload: { ddl } });
    };

    const copyDdl = () => {
        navigator.clipboard.writeText(ddl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const downloadSql = () => {
        const blob = new Blob([ddl], { type: 'text/sql' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'verbis_schema.sql';
        a.click();
        URL.revokeObjectURL(url);
    };

    if (stage === 'input') return (
        <div className="p-4 space-y-4">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                Create Database from Scratch
            </h2>
            <p className="text-xs text-gray-400">
                Describe your application in plain English. Verbis designs the full
                schema — tables, types, relationships, and indexes.
            </p>
            <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={5}
                placeholder="e.g. I want a school management system with students, teachers, courses, attendance, and grade reports. Students enroll in multiple courses."
                className="w-full bg-gray-900 border border-gray-600 rounded p-3
                           text-sm text-gray-200 focus:border-blue-500 focus:outline-none resize-none"
            />
            <div className="flex gap-2">
                <select value={dialect} onChange={e => setDialect(e.target.value)}
                    className="bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200">
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                    <option value="sqlite">SQLite</option>
                </select>
                <button onClick={generate} disabled={!description.trim() || loading}
                    className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700
                               disabled:opacity-40 rounded text-sm font-medium transition-colors">
                    {loading ? 'Designing...' : 'Generate Schema'}
                </button>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
    );

    if (stage === 'preview') return (
        <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">
                    {tableCount} tables generated
                </span>
                <button onClick={() => setStage('input')}
                    className="text-xs text-gray-400 hover:text-white">
                    ← Start over
                </button>
            </div>

            <pre className="bg-gray-950 border border-gray-700 rounded p-3
                            text-xs font-mono text-green-400 overflow-auto max-h-52">
                {ddl}
            </pre>

            {/* Copy + Download buttons — user-friendliness */}
            <div className="flex gap-2">
                <button onClick={copyDdl}
                    className="flex-1 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors">
                    {copied ? '✓ Copied!' : 'Copy DDL'}
                </button>
                <button onClick={downloadSql}
                    className="flex-1 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors">
                    Download .sql
                </button>
            </div>

            <div className="flex gap-2">
                <input type="text" value={refinement}
                    onChange={e => setRefinement(e.target.value)}
                    placeholder='Refine: "add a payments table" or "add phone to students"'
                    className="flex-1 bg-gray-900 border border-gray-600 rounded
                               px-3 py-1.5 text-sm text-gray-200
                               focus:border-blue-500 focus:outline-none" />
                <button onClick={refine} disabled={!refinement.trim() || loading}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600
                               disabled:opacity-40 rounded text-sm transition-colors">
                    {loading ? '...' : 'Refine'}
                </button>
            </div>

            <button onClick={execute} disabled={loading}
                className="w-full py-2 bg-green-600 hover:bg-green-700
                           disabled:opacity-40 rounded text-sm font-medium transition-colors">
                {loading ? 'Creating...' : 'Create Database'}
            </button>
            {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
    );

    return (
        <div className="p-4 text-center space-y-3">
            <div className="text-4xl">✅</div>
            <p className="text-sm font-medium text-white">Database created successfully.</p>
            <p className="text-xs text-gray-400">Switch to Chat to start querying it.</p>
            <button onClick={() => { setStage('input'); setDescription(''); setDdl(''); setSchema(null); }}
                className="text-xs text-blue-400 hover:underline">
                Create another database
            </button>
        </div>
    );
}

export default SchemaCreator;
