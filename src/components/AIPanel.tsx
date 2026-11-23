// AIPanel — AI自動編集提案パネル & 状態表示

import { useEditorStore } from '../store.ts';

function IconSparkle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
    </svg>
  );
}

export function AIPanel() {
  const { state, dispatch } = useEditorStore();
  const { aiStatus, aiSuggestions } = state;

  if (aiStatus === 'idle') return null;

  const handleApply = (id: string, clipId?: string) => {
    dispatch({ type: 'ACCEPT_AI_SUGGESTION', id });
    if (clipId) {
      dispatch({ type: 'SELECT_CLIP', clipId });
    }
  };

  return (
    <aside className="ai-panel" aria-label="AI Editing Assistant">
      <div className="ai-panel-header">
        <div className="ai-panel-title">
          <IconSparkle />
          <span>Cinematic AI Assistant</span>
        </div>
        <button
          className="ai-panel-close"
          onClick={() => dispatch({ type: 'DISMISS_AI' })}
          aria-label="Close AI panel"
        >
          ✕
        </button>
      </div>

      {aiStatus === 'analyzing' && (
        <div className="ai-analyzing-state">
          <div className="ai-analyzing-spinner" />
          <div className="ai-analyzing-text">
            Analyzing visual composition, color harmony, and audio beats…
          </div>
        </div>
      )}

      {(aiStatus === 'suggesting' || aiStatus === 'done') && (
        <div className="ai-suggestions-list">
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '2px 4px 6px' }}>
            Found {aiSuggestions.length} editorial enhancements based on scene analysis:
          </div>
          {aiSuggestions.map(sg => {
            const isAccepted = sg.accepted === true;
            const isRejected = sg.accepted === false;

            return (
              <div
                key={sg.id}
                className={`ai-suggestion-card${isAccepted ? ' accepted' : ''}${isRejected ? ' rejected' : ''}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className="ai-suggestion-type">
                    {sg.type.replace('_', ' ')}
                  </span>
                  {sg.clipId && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Target: {sg.clipId}
                    </span>
                  )}
                </div>
                <div className="ai-suggestion-desc">
                  {sg.description}
                </div>
                {sg.accepted === null ? (
                  <div className="ai-suggestion-actions">
                    <button
                      className="ai-action-accept"
                      onClick={() => handleApply(sg.id, sg.clipId)}
                    >
                      Apply to Clip
                    </button>
                    <button
                      className="ai-action-reject"
                      onClick={() => dispatch({ type: 'REJECT_AI_SUGGESTION', id: sg.id })}
                    >
                      Dismiss
                    </button>
                  </div>
                ) : (
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: isAccepted ? 'var(--accent-success)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}>
                    {isAccepted ? '✓ Enhancement Applied' : '✕ Dismissed'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
