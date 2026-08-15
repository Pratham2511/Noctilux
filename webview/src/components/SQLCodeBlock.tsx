// ============================================================================
// SQLCodeBlock.tsx — CodeMirror 6 SQL editor with annotation gutter
// Implements part of Component 12 (Collaborative Annotations).
// ============================================================================
import { useState, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql, PostgreSQL, MySQL } from '@codemirror/lang-sql';

interface Props {
  sql: string;
  dialect?: 'postgresql' | 'mysql';
  queryId?: string;
  annotations?: Array<{ line: number; comment: string; resolved: boolean }>;
  onAnnotationAdd?: (line: number, comment: string) => void;
}

export default function SQLCodeBlock({
  sql,
  dialect = 'postgresql',
  queryId,
  annotations = [],
  onAnnotationAdd,
}: Props) {
  const [showAnnotationInput, setShowAnnotationInput] = useState<number | null>(null);
  const [draftComment, setDraftComment] = useState('');

  const extensions = useMemo(
    () => [sql({ dialect: dialect === 'mysql' ? MySQL : PostgreSQL })],
    [dialect]
  );

  const lines = sql.split('\n');

  const saveAnnotation = (line: number) => {
    if (!draftComment.trim()) return;
    onAnnotationAdd?.(line, draftComment.trim());
    setDraftComment('');
    setShowAnnotationInput(null);
  };

  return (
    <div className="border border-qm-border rounded overflow-hidden">
      <div className="bg-[var(--vscode-editorWidget-background)] px-2 py-1 text-xs flex justify-between items-center">
        <span className="font-mono">SQL · {dialect}</span>
        {queryId && (
          <span className="opacity-60">query #{queryId.slice(0, 8)}</span>
        )}
      </div>
      <div className="flex">
        {/* Gutter */}
        <div className="bg-[var(--vscode-editorGutter-background)] text-xs text-qm-fg opacity-70 select-none">
          {lines.map((_, i) => {
            const ann = annotations.find(a => a.line === i + 1);
            return (
              <div
                key={i}
                className="h-5 px-1 cursor-pointer flex items-center"
                onClick={() => setShowAnnotationInput(i + 1)}
                title={ann?.comment || 'Click to annotate'}
              >
                {ann ? (
                  <span className={`gutter-icon ${ann.resolved ? 'resolved' : 'unresolved'}`} />
                ) : (
                  <span className="opacity-30">{i + 1}</span>
                )}
              </div>
            );
          })}
        </div>
        {/* Editor */}
        <div className="flex-1">
          <CodeMirror
            value={sql}
            readOnly
            extensions={extensions}
            theme="dark"
            height="auto"
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: false,
            }}
          />
        </div>
      </div>
      {/* Annotation input popup */}
      {showAnnotationInput && (
        <div className="border-t border-qm-border p-2">
          <p className="text-xs mb-1">Annotate line {showAnnotationInput}:</p>
          <textarea
            value={draftComment}
            onChange={e => setDraftComment(e.target.value)}
            className="w-full bg-transparent border border-qm-border rounded px-2 py-1 text-xs"
            rows={2}
            autoFocus
          />
          <div className="flex gap-2 mt-1 justify-end">
            <button
              className="px-2 py-1 text-xs border border-qm-border rounded hover:bg-qm-hover"
              onClick={() => setShowAnnotationInput(null)}
            >
              Cancel
            </button>
            <button
              className="px-2 py-1 text-xs bg-qm-accent text-white rounded"
              onClick={() => saveAnnotation(showAnnotationInput)}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
