// ============================================================================
// NarrativeCard.tsx — Analytical narrative display component
// Implements Novel Contribution #12 (Analytical Narrative Engine).
// ============================================================================
import { useState } from 'react';

export default function NarrativeCard({ narrative }: { narrative: string }) {
  const [thumbsUp, setThumbsUp] = useState<boolean | null>(null);

  return (
    <div className="border-l-2 border-qm-accent pl-3 bg-[var(--vscode-textBlockQuote-background)] py-2 px-3 rounded-r">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-qm-accent text-xs font-semibold">📊 Key Findings</span>
        <div className="ml-auto flex gap-1">
          <button
            className={`text-xs px-1 ${thumbsUp === true ? 'text-qm-good' : 'opacity-50 hover:opacity-100'}`}
            onClick={() => setThumbsUp(true)}
            title="Marked as useful"
          >
            👍
          </button>
          <button
            className={`text-xs px-1 ${thumbsUp === false ? 'text-qm-bad' : 'opacity-50 hover:opacity-100'}`}
            onClick={() => setThumbsUp(false)}
            title="Marked as not useful"
          >
            👎
          </button>
        </div>
      </div>
      <p className="text-xs whitespace-pre-wrap leading-relaxed">{narrative}</p>
      {thumbsUp !== null && (
        <p className="text-xs italic mt-1 opacity-60">
          {thumbsUp
            ? 'Thanks — feedback recorded to improve future narratives.'
            : 'Feedback recorded — narrative will be regenerated on next run.'}
        </p>
      )}
    </div>
  );
}
