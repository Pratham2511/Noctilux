// ============================================================================
// ConfidenceBar.tsx — Visual confidence indicator + alternatives switcher
// Implements Novel Contribution #5 (Confidence-Calibrated Output with
// Alternative Interpretations).
// ============================================================================
import { useState } from 'react';
import type { AlternativeSQL } from '../../../src/types';

interface Props {
  confidence: number;                     // 0.0 – 1.0
  alternatives?: AlternativeSQL[];
}

export default function ConfidenceBar({ confidence, alternatives = [] }: Props) {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const pct = Math.round(confidence * 100);
  const color =
    confidence >= 0.8 ? '#4ec9b0' : confidence >= 0.5 ? '#d4a017' : '#f14c4c';

  return (
    <div className="text-xs">
      <div className="flex items-center gap-2 mb-1">
        <span className="opacity-70">Confidence:</span>
        <span style={{ color }} className="font-semibold">
          {pct}%
        </span>
        {alternatives.length > 0 && (
          <button
            className="ml-auto opacity-70 hover:opacity-100 underline"
            onClick={() => setShowAlternatives(s => !s)}
          >
            {showAlternatives ? 'Hide' : 'Show'} {alternatives.length} alternative{alternatives.length !== 1 ? 's' : ''}
          </button>
        )}
      </div>
      <div className="confidence-bar">
        <div style={{ width: `${pct}%`, background: color }} />
      </div>
      {confidence < 0.8 && (
        <p className="mt-1 text-qm-warn italic text-xs">
          Confidence below 80% — alternative interpretations shown below.
        </p>
      )}
      {showAlternatives && alternatives.length > 0 && (
        <div className="mt-2 space-y-2">
          {alternatives.map((alt, i) => (
            <div
              key={i}
              className="border border-qm-border rounded p-2 bg-[var(--vscode-textBlockQuote-background)]"
            >
              <div className="flex justify-between mb-1">
                <span className="font-medium text-qm-accent">{alt.interpretation}</span>
                <span style={{ color: alt.confidence >= 0.7 ? '#4ec9b0' : '#d4a017' }}>
                  {Math.round(alt.confidence * 100)}%
                </span>
              </div>
              <pre className="text-xs font-mono whitespace-pre-wrap bg-[var(--vscode-editor-background)] p-1 rounded">
                {alt.sql}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
