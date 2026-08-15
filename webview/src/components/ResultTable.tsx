// ============================================================================
// ResultTable.tsx — Paginated result grid with cell annotation support
// Implements part of Component 12 (cell-level annotations + anomaly flags)
// ============================================================================
import { useState, useMemo } from 'react';
import type { ExecutionResult } from '../../../src/types';

interface Props {
  result: ExecutionResult;
  onCellAnnotate?: (rowIdx: number, col: string, flagType: string) => void;
}

const PAGE_SIZE = 50;

export default function ResultTable({ result, onCellAnnotate }: Props) {
  const [page, setPage] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ rowIdx: number; col: string; x: number; y: number } | null>(null);

  const pageRows = useMemo(() => {
    const start = page * PAGE_SIZE;
    return result.rows.slice(start, start + PAGE_SIZE);
  }, [result.rows, page]);

  const totalPages = Math.ceil(result.rows.length / PAGE_SIZE);

  return (
    <div className="border border-qm-border rounded">
      {/* Header bar */}
      <div className="bg-[var(--vscode-editorWidget-background)] px-2 py-1 text-xs flex justify-between items-center">
        <span>
          {result.rowCount} rows · {result.executionTimeMs}ms
          {result.truncated && <span className="text-qm-warn ml-2">(truncated)</span>}
          {result.rowsScanned && <span className="opacity-60 ml-2">scanned {result.rowsScanned}</span>}
        </span>
        {result.piiColumnsMasked && result.piiColumnsMasked.length > 0 && (
          <span className="text-qm-warn" title="PII-masked columns">
            🔒 PII masked: {result.piiColumnsMasked.join(', ')}
          </span>
        )}
      </div>

      {/* Regression alert */}
      {result.regressionAlert && (
        <div className="bg-[rgba(244,124,124,0.1)] border-b border-qm-bad px-2 py-1 text-xs">
          <strong className="text-qm-bad">⚠ Performance Regression:</strong>{' '}
          {result.regressionAlert.percentSlower}% slower than baseline (
          {result.regressionAlert.currentMs}ms vs {result.regressionAlert.baselineMs}ms).{' '}
          {result.regressionAlert.possibleCauses.join('; ')}
          {result.regressionAlert.suggestedFix && (
            <span className="block mt-1 text-qm-accent">→ {result.regressionAlert.suggestedFix}</span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto max-h-[400px]">
        <table className="result-table">
          <thead>
            <tr>
              <th>#</th>
              {result.columns.map(c => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={i}>
                <td className="opacity-50 text-right">{page * PAGE_SIZE + i + 1}</td>
                {result.columns.map(col => {
                  const isMasked = result.piiColumnsMasked?.includes(col);
                  return (
                    <td
                      key={col}
                      className={isMasked ? 'pii-cell' : ''}
                      onContextMenu={e => {
                        e.preventDefault();
                        setContextMenu({
                          rowIdx: page * PAGE_SIZE + i,
                          col,
                          x: e.clientX,
                          y: e.clientY,
                        });
                      }}
                      title={isMasked ? 'PII-masked' : 'Right-click to annotate'}
                    >
                      {String(row[col] ?? '')}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-2 py-1 text-xs flex justify-between items-center border-t border-qm-border">
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              className="px-2 py-0.5 border border-qm-border rounded disabled:opacity-30"
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              className="px-2 py-0.5 border border-qm-border rounded disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Context menu for cell annotation */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-20 bg-[var(--vscode-menu-background)] border border-qm-border rounded shadow-lg text-xs py-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {['ANOMALY', 'VERIFY_NEEDED', 'CORRECT', 'INCORRECT', 'NOTE'].map(flag => (
              <button
                key={flag}
                className="block w-full text-left px-3 py-1 hover:bg-qm-hover"
                onClick={() => {
                  onCellAnnotate?.(contextMenu.rowIdx, contextMenu.col, flag);
                  setContextMenu(null);
                }}
              >
                Flag as: {flag}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
