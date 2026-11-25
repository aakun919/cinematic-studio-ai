// ExportModal — 書き出し設定 & 実レンダリングダイアログ (Package 4)
//
// Package 4 でモックの進捗シミュレーションを廃止し、WebCodecs +
// Mediabunny による実書き出し (videoExporter) に結線した。
// - 形式の可否はブラウザの実行時プローブで決まる (H.264 が主役、
//   HEVC は対応環境のみ、ProRes はデスクトップ版で対応予定として無効表示)
// - 進捗は実フレーム数ベース、キャンセル可能
// - 完了後は MP4 を保存できる (showSaveFilePicker / ダウンロード)
// - 対応していない組み合わせや失敗は、理由を明示して止める (偽の成功はしない)

import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../store.ts';
import type { ExportFormat, ExportResolution, ExportFramerate } from '../types.ts';
import {
  decideExportSupport,
  exportDimensions,
  formatNote,
  isResolutionEnabled,
  pickFormat,
  resolutionNote,
  type ExportDecision,
} from '../utils/exportPlan.ts';
import { exportTimeline, probeCodecSupport, type ExportResult } from '../utils/videoExporter.ts';
import { saveBlobAs } from '../utils/saveBlob.ts';

type Phase = 'idle' | 'exporting' | 'done' | 'error';

const FORMAT_LABELS: Record<ExportFormat, string> = {
  prores: 'Apple ProRes 422 HQ (10-bit)',
  h264: 'H.264 High Profile (MP4)',
  hevc: 'HEVC / H.265 (MP4)',
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function ExportModalDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useEditorStore();
  const { exportSettings, tracks, transitions, keyframes, mediaItems, aspectRatio, projectName } = state;

  const [decision, setDecision] = useState<ExportDecision | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ExportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fps = Number(exportSettings.framerate) || 30;
  const dims = exportDimensions(exportSettings.resolution, aspectRatio);

  // ブラウザの対応状況をプローブする (解像度・フレームレート依存のため依存値で再実行)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const support = await probeCodecSupport(dims.width, dims.height, fps);
      if (cancelled) return;
      setDecision(decideExportSupport(support));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims.width, dims.height, fps]);

  // 選べない形式・解像度が指定されていたら、選べるものへ寄せる
  useEffect(() => {
    if (!decision) return;
    const picked = pickFormat(decision, exportSettings.format);
    if (picked && picked !== exportSettings.format) {
      dispatch({ type: 'SET_EXPORT_SETTINGS', settings: { format: picked } });
    }
    if (!isResolutionEnabled(exportSettings.resolution)) {
      dispatch({ type: 'SET_EXPORT_SETTINGS', settings: { resolution: '1080p' } });
    }
  }, [decision, exportSettings.format, exportSettings.resolution, dispatch]);

  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const selectedNote = decision ? formatNote(decision, exportSettings.format) : null;
  const canStart = phase === 'idle' && decision !== null && decision.canExport;

  const handleStartRender = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('exporting');
    setProgress({ done: 0, total: 0 });
    setResult(null);
    setErrorMessage(null);
    setNotice(null);
    try {
      const res = await exportTimeline(
        { tracks, transitions, keyframes, mediaItems, aspectRatio, settings: exportSettings },
        {
          signal: controller.signal,
          onProgress: (done, total) => setProgress({ done, total }),
        },
      );
      setResult(res);
      setPhase('done');
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError' || controller.signal.aborted) {
        setNotice('書き出しをキャンセルしました。');
        setPhase('idle');
      } else {
        setErrorMessage(
          err instanceof Error ? err.message : '書き出し中に不明なエラーが発生しました。',
        );
        setPhase('error');
      }
    } finally {
      abortRef.current = null;
    }
  };

  const handleCancelExport = () => {
    abortRef.current?.abort();
  };

  const handleSave = async () => {
    if (!result) return;
    const name = `${projectName.replace(/[\\/:*?"<>|]/g, '_') || 'export'}.mp4`;
    const saved = await saveBlobAs(result.blob, name);
    if (saved === 'saved') setNotice('ファイルを保存しました。');
    if (saved === 'downloaded') setNotice('ダウンロードを開始しました。');
  };

  const isExporting = phase === 'exporting';
  const isDone = phase === 'done';

  return (
    <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 460 }}>
      <h2 className="modal-title">
        {isDone ? 'Export Complete' : isExporting ? 'Rendering Timeline…' : 'Export Video Project'}
      </h2>
      <p className="modal-subtitle">
        {isDone
          ? 'レンダリングが完了しました。MP4 ファイルを保存できます。'
          : isExporting
            ? `Encoding ${dims.width}×${dims.height} ${exportSettings.format.toUpperCase()} at ${exportSettings.framerate}fps…`
            : 'Configure your master delivery format, resolution, and color encoding settings.'}
      </p>

      {/* 設定エリア (レンダリング前のみ表示) */}
      {phase === 'idle' && (
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
                <option value="4k" disabled={!isResolutionEnabled('4k')}>
                  4K UHD (3840 × 2160) — Cinema Master{resolutionNote('4k') ? ' ※' : ''}
                </option>
                <option value="1080p">1080p Full HD (1920 × 1080) — Web Delivery</option>
                <option value="720p">720p HD (1280 × 720) — Preview Proxy</option>
              </select>
            </div>
          </div>
          {resolutionNote(exportSettings.resolution) && (
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-dim, #94a3b8)' }}>
              ※ {resolutionNote(exportSettings.resolution)}
            </p>
          )}

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
                {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map(f => {
                  const avail = decision?.formats.find(x => x.format === f);
                  return (
                    <option key={f} value={f} disabled={avail ? !avail.available : false}>
                      {FORMAT_LABELS[f]}{avail && !avail.available ? ' ※' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          {decision === null && (
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-dim, #94a3b8)' }}>
              ブラウザのエンコード対応を確認しています…
            </p>
          )}
          {selectedNote && (
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-dim, #94a3b8)' }}>
              ※ {selectedNote}
            </p>
          )}
          {decision && !decision.canExport && decision.blockingReason && (
            <p style={{ margin: 0, fontSize: 11, color: '#f87171' }}>
              {decision.blockingReason}
            </p>
          )}

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

          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-dim, #94a3b8)' }}>
            出力サイズ: {dims.width} × {dims.height} / {exportSettings.framerate} fps
            {decision?.audioCodec ? ` / 音声 ${decision.audioCodec.toUpperCase()}` : ''}
          </p>
        </div>
      )}

      {/* エラー表示 */}
      {phase === 'error' && errorMessage && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: 0, fontSize: 12, color: '#f87171', lineHeight: 1.6 }}>
            書き出しに失敗しました: {errorMessage}
          </p>
        </div>
      )}

      {/* 進捗バー (レンダリング中) */}
      {isExporting && (
        <div>
          <div className="modal-progress-label">
            <span>Encoding {progress.total > 0 ? `${progress.done} / ${progress.total} frames` : '…'}</span>
            <span>{percent}%</span>
          </div>
          <div className="modal-progress-track">
            <div className="modal-progress-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {/* 完了表示 */}
      {isDone && result && (
        <div style={{ marginBottom: 20 }}>
          <div className="modal-progress-label">
            <span>Encoding finished</span>
            <span>{formatBytes(result.blob.size)}</span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-dim, #94a3b8)', lineHeight: 1.6 }}>
            {result.width} × {result.height} / {result.frames} frames
            {result.audioCodec ? ` / 音声 ${result.audioCodec.toUpperCase()}` : ' / 音声なし'}
          </p>
          {result.warnings.map((w, i) => (
            <p key={i} style={{ margin: '6px 0 0', fontSize: 11, color: '#fbbf24', lineHeight: 1.6 }}>
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {notice && phase !== 'exporting' && (
        <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--text-dim, #94a3b8)' }}>{notice}</p>
      )}

      {/* フッターアクションボタン */}
      <div className="modal-footer">
        {isExporting ? (
          <button className="modal-btn-cancel" onClick={handleCancelExport}>
            Cancel Export
          </button>
        ) : (
          <button className="modal-btn-cancel" onClick={onClose}>
            {isDone ? 'Close' : 'Cancel'}
          </button>
        )}

        {phase === 'idle' && (
          <button className="modal-btn-primary" onClick={handleStartRender} disabled={!canStart}>
            Start Render
          </button>
        )}

        {phase === 'error' && (
          <button className="modal-btn-primary" onClick={() => setPhase('idle')}>
            Back to Settings
          </button>
        )}

        {isDone && (
          <button className="modal-btn-primary" onClick={handleSave}>
            Save MP4
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
