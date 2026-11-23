// TopBar — アプリロゴ・プロジェクト情報・ツールボタン

import { useEffect, useCallback } from 'react';
import { useEditorStore } from '../store.ts';
import type { EditorAction } from '../store.ts';

// ── SVG アイコン (インライン) ────────────────────────────────

function IconFilm() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
      <line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <line x1="2" y1="7" x2="7" y2="7"/><line x1="17" y1="7" x2="22" y2="7"/>
      <line x1="17" y1="17" x2="22" y2="17"/><line x1="2" y1="17" x2="7" y2="17"/>
    </svg>
  );
}

function IconUndo() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 14 4 9 9 4"/>
      <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
    </svg>
  );
}

function IconRedo() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 14 20 9 15 4"/>
      <path d="M4 20v-7a4 4 0 0 1 4-4h12"/>
    </svg>
  );
}

function IconExport() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
      <path d="M19 21H5"/>
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────

export function TopBar() {
  const { state, dispatch } = useEditorStore();
  const { projectName, saveStatus, past, future, previewQuality, aiStatus } = state;

  // ── キーボードショートカット ──
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (!mod) return;

    if (e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      dispatch({ type: 'UNDO' });
    } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
      e.preventDefault();
      dispatch({ type: 'REDO' });
    } else if (e.key === 's') {
      e.preventDefault();
      handleSave(dispatch);
    }
  }, [dispatch]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── AI 自動編集 ──
  const handleAIEdit = () => {
    dispatch({ type: 'START_AI_EDIT' });
    setTimeout(() => {
      dispatch({
        type: 'SET_AI_SUGGESTIONS',
        suggestions: [
          {
            id: 'ai-1',
            type: 'color_grade',
            description: 'Apply cinematic color grading to "Golden Hour Beach" — boost warmth and contrast for a filmic look.',
            clipId: 'clip-v1',
            accepted: null,
          },
          {
            id: 'ai-2',
            type: 'trim',
            description: 'Trim 2 seconds from "City Night Timelapse" — the opening frames are slightly overexposed.',
            clipId: 'clip-v2',
            accepted: null,
          },
          {
            id: 'ai-3',
            type: 'music_sync',
            description: 'Add 1s fade-in/out to "Cinematic Score Intro" to match the first scene transition.',
            clipId: 'clip-a1',
            accepted: null,
          },
        ],
      });
    }, 1800);
  };

  // ── Export ──
  const handleExport = () => {
    dispatch({ type: 'SHOW_EXPORT_MODAL' });
  };

  const saveLabels: Record<typeof saveStatus, string> = {
    saved: 'Saved',
    unsaved: 'Unsaved',
    saving: 'Saving…',
  };

  const qualityLabels: Record<typeof previewQuality, string> = {
    full: 'Full Quality',
    half: '½ Quality',
    quarter: '¼ Quality',
  };

  const isAnalyzing = aiStatus === 'analyzing';

  return (
    <header className="topbar">
      {/* Brand */}
      <div className="topbar-brand">
        <div className="topbar-logo">
          <IconFilm />
        </div>
        <span className="topbar-app-name">Cinematic Studio AI</span>
      </div>

      <div className="topbar-divider" />

      {/* Project Info */}
      <div className="topbar-project">
        <span className="topbar-project-name">{projectName}</span>
        <div className="save-status">
          <div className={`save-dot save-dot--${saveStatus}`} />
          <span>{saveLabels[saveStatus]}</span>
        </div>
      </div>

      <div className="topbar-divider" />

      {/* Undo / Redo */}
      <button
        className="tb-btn"
        onClick={() => dispatch({ type: 'UNDO' })}
        disabled={past.length === 0}
        title="Undo (⌘Z)"
        aria-label="Undo"
      >
        <IconUndo />
        <span>Undo</span>
      </button>
      <button
        className="tb-btn"
        onClick={() => dispatch({ type: 'REDO' })}
        disabled={future.length === 0}
        title="Redo (⌘⇧Z)"
        aria-label="Redo"
      >
        <IconRedo />
        <span>Redo</span>
      </button>

      <div className="topbar-divider" />

      {/* Preview Quality */}
      <div className="tb-select-wrap">
        <select
          className="tb-select"
          value={previewQuality}
          onChange={e => dispatch({
            type: 'SET_PREVIEW_QUALITY',
            quality: e.target.value as typeof previewQuality,
          })}
          aria-label="Preview quality"
        >
          <option value="full">{qualityLabels.full}</option>
          <option value="half">{qualityLabels.half}</option>
          <option value="quarter">{qualityLabels.quarter}</option>
        </select>
        <span className="tb-select-arrow">▾</span>
      </div>

      <div className="topbar-spacer" />

      {/* AI Auto Edit */}
      <button
        className={`tb-ai-btn${isAnalyzing ? ' analyzing' : ''}`}
        onClick={handleAIEdit}
        disabled={isAnalyzing}
        aria-label="AI Auto Edit"
      >
        {isAnalyzing ? (
          <>
            <div className="ai-spinner" />
            <span>Analyzing…</span>
          </>
        ) : (
          <>
            <IconSparkle />
            <span>AI Auto Edit</span>
          </>
        )}
      </button>

      {/* Export */}
      <button
        className="tb-export-btn"
        onClick={handleExport}
        aria-label="Export video"
      >
        <IconExport />
        <span>Export</span>
      </button>
    </header>
  );
}

function handleSave(dispatch: (a: EditorAction) => void) {
  dispatch({ type: 'SET_SAVE_STATUS', status: 'saving' });
  setTimeout(() => dispatch({ type: 'SET_SAVE_STATUS', status: 'saved' }), 800);
}
