// ExportModal — 書き出し設定 & レンダリングダイアログ

import { useEffect, useState } from 'react';
import { useEditorStore } from '../store.ts';
import type { ExportFormat, ExportResolution, ExportFramerate } from '../types.ts';

function ExportModalDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useEditorStore();
  const { exportSettings } = state;

  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDone, setIsDone] = useState(false);

  // レンダリング処理のシミュレーション
  useEffect(() => {
    if (!isExporting) return;

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsExporting(false);
          setIsDone(true);
          return 100;
        }
        const step = Math.floor(Math.random() * 12) + 8;
        return Math.min(100, prev + step);
      });
    }, 250);

    return () => clearInterval(interval);
  }, [isExporting]);

  const handleStartRender = () => {
    setIsExporting(true);
    setProgress(0);
    setIsDone(false);
  };

  return (
    <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 460 }}>
      <h2 className="modal-title">
        {isDone ? 'Export Complete' : isExporting ? 'Rendering Timeline…' : 'Export Video Project'}
      </h2>
      <p className="modal-subtitle">
        {isDone
          ? 'Your master video file has been successfully rendered and color graded.'
          : isExporting
          ? `Encoding ${exportSettings.resolution.toUpperCase()} ${exportSettings.format.toUpperCase()} at ${exportSettings.framerate}fps…`
          : 'Configure your master delivery format, resolution, and color encoding settings.'}
      </p>

      {/* 設定エリア (レンダリング前のみ表示) */}
      {!isExporting && !isDone && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {/* Resolution */}
          <div className="inspector-row">
            <span className="inspector-label" style={{ minWidth: 90 }}>Resolution</span>
            <div className="inspector-row-controls">
              <select
                className="tb-select"
                style={{ width: '100%', height: 30 }}
                value={exportSettings.resolution}
                onChange={e => dispatch({
                  type: 'SET_EXPORT_SETTINGS',
                  settings: { resolution: e.target.value as ExportResolution },
                })}
              >
                <option value="4k">4K UHD (3840 × 2160) — Cinema Master</option>
                <option value="1080p">1080p Full HD (1920 × 1080) — Web Delivery</option>
                <option value="720p">720p HD (1280 × 720) — Preview Proxy</option>
              </select>
            </div>
          </div>

          {/* Codec */}
          <div className="inspector-row">
            <span className="inspector-label" style={{ minWidth: 90 }}>Format / Codec</span>
            <div className="inspector-row-controls">
              <select
                className="tb-select"
                style={{ width: '100%', height: 30 }}
                value={exportSettings.format}
                onChange={e => dispatch({
                  type: 'SET_EXPORT_SETTINGS',
                  settings: { format: e.target.value as ExportFormat },
                })}
              >
                <option value="prores">Apple ProRes 422 HQ (10-bit)</option>
                <option value="h264">H.264 High Profile (MP4)</option>
                <option value="hevc">HEVC / H.265 (High Dynamic Range)</option>
              </select>
            </div>
          </div>

          {/* Frame Rate */}
          <div className="inspector-row">
            <span className="inspector-label" style={{ minWidth: 90 }}>Frame Rate</span>
            <div className="inspector-row-controls">
              <select
                className="tb-select"
                style={{ width: '100%', height: 30 }}
                value={exportSettings.framerate}
                onChange={e => dispatch({
                  type: 'SET_EXPORT_SETTINGS',
                  settings: { framerate: e.target.value as ExportFramerate },
                })}
              >
                <option value="24">24 fps (Cinematic Standard)</option>
                <option value="30">30 fps (Broadcast NTSC)</option>
                <option value="60">60 fps (High Motion Smooth)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* 進捗バー (レンダリング中または完了時) */}
      {(isExporting || isDone) && (
        <div>
          <div className="modal-progress-label">
            <span>{isDone ? 'Encoding finished' : `Encoding ${exportSettings.resolution.toUpperCase()}…`}</span>
            <span>{progress}%</span>
          </div>

          <div className="modal-progress-track">
            <div
              className="modal-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* フッターアクションボタン */}
      <div className="modal-footer">
        <button
          className="modal-btn-cancel"
          onClick={onClose}
        >
          {isDone ? 'Close' : 'Cancel'}
        </button>

        {!isExporting && !isDone && (
          <button
            className="modal-btn-primary"
            onClick={handleStartRender}
          >
            Start Render
          </button>
        )}

        {isDone && (
          <button
            className="modal-btn-primary"
            onClick={onClose}
          >
            Open in Finder
          </button>
        )}
      </div>
    </div>
  );
}

export function ExportModal() {
  const { state, dispatch } = useEditorStore();
  const { showExportModal } = state;

  if (!showExportModal) return null;

  return (
    <div className="modal-overlay" onClick={() => dispatch({ type: 'HIDE_EXPORT_MODAL' })}>
      <ExportModalDialog onClose={() => dispatch({ type: 'HIDE_EXPORT_MODAL' })} />
    </div>
  );
}
