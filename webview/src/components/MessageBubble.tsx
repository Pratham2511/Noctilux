// ============================================================================
// MessageBubble.tsx — Individual message with SQL block + confidence badge
// ============================================================================
import type { ChatMessage } from '../../../src/types';
import SQLCodeBlock from './SQLCodeBlock';
import ResultTable from './ResultTable';
import ConfidenceBar from './ConfidenceBar';
import NarrativeCard from './NarrativeCard';

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const meta = message.metadata;

  if (isSystem) {
    return (
      <div className="text-center text-xs text-qm-warn p-2 italic">
        {message.content}
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[90%] rounded-lg p-3 ${
          isUser
            ? 'bg-qm-accent text-white'
            : 'bg-[var(--vscode-editorWidget-background)] text-qm-fg'
        }`}
      >
        {/* NL text */}
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>

        {/* SQL block */}
        {meta?.sql && (
          <div className="mt-2">
            <SQLCodeBlock sql={meta.sql} />
          </div>
        )}

        {/* Confidence bar + alternatives */}
        {meta?.confidence !== undefined && !isUser && (
          <div className="mt-2">
            <ConfidenceBar
              confidence={meta.confidence}
              alternatives={meta.alternatives}
            />
          </div>
        )}

        {/* Execution result */}
        {meta?.executionResult && (
          <div className="mt-2">
            <ResultTable result={meta.executionResult} />
          </div>
        )}

        {/* Plan explanation */}
        {meta?.planExplanation && (
          <div className="mt-2 p-2 bg-[var(--vscode-textBlockQuote-background)] rounded text-xs italic">
            <strong>Execution Plan:</strong> {meta.planExplanation}
          </div>
        )}

        {/* Narrative */}
        {meta?.narrative && (
          <div className="mt-2">
            <NarrativeCard narrative={meta.narrative} />
          </div>
        )}

        {/* Ambiguity questions */}
        {meta?.ambiguityQuestions && meta.ambiguityQuestions.length > 0 && (
          <div className="mt-2 p-2 border border-qm-warn rounded text-xs">
            <strong className="text-qm-warn">Clarification needed:</strong>
            {meta.ambiguityQuestions.map(q => (
              <div key={q.id} className="mt-2">
                <p className="mb-1">{q.question}</p>
                <div className="flex gap-2 flex-wrap">
                  {q.options.map(opt => (
                    <button
                      key={opt}
                      className="px-2 py-1 border border-qm-border rounded hover:bg-qm-hover text-xs"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
