// PreviewPanel — 中央プレビュー・再生コントロール & リアルタイムシネマティック合成

import { useEffect, useRef, useMemo, useCallback } from 'react';
import { useEditorStore } from '../store.ts';
import type { AspectRatio, Clip, Transition, Keyframe, MediaItem } from '../types.ts';
import { getInterpolatedClipValues } from '../utils/interpolation.ts';

// ── Utilities ────────────────────────────────────────────────

function formatTime(sec: number): string {
  const total = Math.max(0, sec);
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = Math.floor(total % 60).toString().padStart(2, '0');
  const f = Math.floor((total % 1) * 30).toString().padStart(2, '0');
  return `${m}:${s}:${f}`;
}

// ── SVG Icons ────────────────────────────────────────────────

function IconPlay() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

function IconSkipBack() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" />
    </svg>
  );
}

function IconSkipForward() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" />
    </svg>
  );
}

function IconFrameBack() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconFrameForward() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}

// ── シネマティックシーン描画 ───────────────────────────────────

const STARS = Array.from({ length: 60 }, (_, i) => ({
  id: i,
  x: (Math.sin(i * 2.5) * 0.5 + 0.5) * 100,
  y: (Math.cos(i * 1.7) * 0.5 + 0.5) * 65,
  size: (Math.sin(i * 0.9) * 0.5 + 0.5) * 1.5 + 0.5,
  opacity: (Math.cos(i * 1.3) * 0.5 + 0.5) * 0.7 + 0.2,
}));

const WATER_LINES = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  bottom: i * 12 + 2,
  opacity: 0.04 + i * 0.01,
}));

interface CinematicSceneProps {
  currentTime: number;
  activeVideoClip?: Clip;
  nextVideoClip?: Clip;
  activeTransition?: Transition;
  activeTextClip?: Clip;
  keyframes: Keyframe[];
  mediaItems: MediaItem[];
  isPlaying: boolean;
  showSafeAreas: boolean;
}

function CinematicScene({
  currentTime,
  activeVideoClip,
  nextVideoClip,
  activeTransition,
  activeTextClip,
  keyframes,
  mediaItems,
  isPlaying,
  showSafeAreas,
}: CinematicSceneProps) {
  const glowIntensity = 0.3 + Math.sin(currentTime * 0.3) * 0.1;
  const moonX = 72 + Math.sin(currentTime * 0.05) * 2;
  const moonY = 18 + Math.sin(currentTime * 0.08) * 1.5;

  // キーフレームによるリアルタイムプロパティ補間
  const animatedClipValues = useMemo(() => {
    if (!activeVideoClip) return null;
    return getInterpolatedClipValues(activeVideoClip, currentTime, keyframes);
  }, [activeVideoClip, currentTime, keyframes]);

  const animatedTextValues = useMemo(() => {
    if (!activeTextClip) return null;
    return getInterpolatedClipValues(activeTextClip, currentTime, keyframes);
  }, [activeTextClip, currentTime, keyframes]);

  // トランジション進行度 (0.0 ~ 1.0)
  const transProgress = useMemo(() => {
    if (!activeTransition || !activeTransition.enabled) return null;
    const p = (currentTime - activeTransition.startTime) / activeTransition.duration;
    return Math.max(0, Math.min(1, p));
  }, [activeTransition, currentTime]);

  // Video クリップの色補正フィルターを計算
  const filterStyle = useMemo(() => {
    if (!activeVideoClip) return undefined;
    const brightness = 1 + (activeVideoClip.brightness ?? 0) / 100;
    const contrast = 1 + (activeVideoClip.contrast ?? 0) / 100;
    const saturate = 1 + (activeVideoClip.saturation ?? 0) / 100;
    const hue = (activeVideoClip.temperature ?? 0) * 0.4; // 色温度の近似表現
    return `brightness(${brightness}) contrast(${contrast}) saturate(${saturate}) hue-rotate(${hue}deg)`;
  }, [activeVideoClip]);

  // Video クリップのトランスフォーム (位置・スケール・回転 — キーフレーム補間値を優先反映)
  const transformStyle = useMemo(() => {
    if (!activeVideoClip) return undefined;
    const x = animatedClipValues ? animatedClipValues.positionX : (activeVideoClip.x ?? 0);
    const y = animatedClipValues ? animatedClipValues.positionY : (activeVideoClip.y ?? 0);
    const scale = animatedClipValues ? animatedClipValues.scale : (activeVideoClip.scale ?? 1);
    const rot = animatedClipValues ? animatedClipValues.rotation : (activeVideoClip.rotation ?? 0);
    return `translate(${x}%, ${y}%) scale(${scale}) rotate(${rot}deg)`;
  }, [activeVideoClip, animatedClipValues]);

  // クリップのフェードイン・フェードアウトの不透明度計算（キーフレーム補間 opacity と乗算合成）
  const videoOpacity = useMemo(() => {
    if (!activeVideoClip) return 1;
    let baseOp = animatedClipValues ? animatedClipValues.opacity : 1.0;
    const localTime = currentTime - activeVideoClip.startTime;
    if (localTime >= 0 && localTime <= activeVideoClip.duration) {
      if (activeVideoClip.fadeIn > 0 && localTime < activeVideoClip.fadeIn) {
        baseOp = Math.min(baseOp, localTime / activeVideoClip.fadeIn);
      }
      const remaining = activeVideoClip.duration - localTime;
      if (activeVideoClip.fadeOut > 0 && remaining < activeVideoClip.fadeOut) {
        baseOp = Math.min(baseOp, remaining / activeVideoClip.fadeOut);
      }
    }

    // トランジション効果による不透明度調整
    if (transProgress !== null && activeTransition) {
      if (activeTransition.type === 'cross-dissolve') {
        // Cross Dissolve: 前クリップがフェードアウト
        baseOp *= (1 - transProgress);
      }
    }

    return Math.max(0, Math.min(1, baseOp));
  }, [activeVideoClip, currentTime, transProgress, activeTransition, animatedClipValues]);

  // 実メディアアイテムの検索
  const activeMediaItem = useMemo(() => {
    if (!activeVideoClip?.mediaId) return undefined;
    return mediaItems.find(m => m.id === activeVideoClip.mediaId);
  }, [activeVideoClip, mediaItems]);

  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  // 実動画の再生・シーク同期
  useEffect(() => {
    const video = videoElementRef.current;
    if (!video || !activeVideoClip || activeMediaItem?.type !== 'video') return;

    const clipLocalTime = Math.max(0, currentTime - activeVideoClip.startTime + (activeVideoClip.mediaStart || 0));
    if (Math.abs(video.currentTime - clipLocalTime) > 0.3) {
      video.currentTime = clipLocalTime;
    }

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [currentTime, isPlaying, activeVideoClip, activeMediaItem]);

  // 次クリップ（Cross Dissolve時のクロスフェード用）
  const nextVideoOpacity = useMemo(() => {
    if (!nextVideoClip || transProgress === null || !activeTransition || activeTransition.type !== 'cross-dissolve') {
      return 0;
    }
    return Math.max(0, Math.min(1, transProgress));
  }, [nextVideoClip, transProgress, activeTransition]);

  // Dip to Black の黒幕不透明度 (0 -> 1 -> 0)
  const blackDipOpacity = useMemo(() => {
    if (transProgress === null || !activeTransition || activeTransition.type !== 'dip-to-black') {
      return 0;
    }
    // 前半: 0 -> 1 (黒へフェード), 後半: 1 -> 0 (黒から復帰)
    if (transProgress <= 0.5) {
      return transProgress * 2;
    } else {
      return (1 - transProgress) * 2;
    }
  }, [transProgress, activeTransition]);

  return (
    <div className="preview-scene">
      {/* 映像レイヤー（メイン映像） */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          filter: filterStyle,
          transform: transformStyle,
          opacity: videoOpacity,
          transformOrigin: 'center center',
          transition: 'filter 0.1s ease, transform 0.1s ease',
        }}
      >
        {/* 実メディア (画像または動画) が存在する場合はそれを描画、それ以外はデフォルトのシネマティックSVG */}
        {activeMediaItem?.url ? (
          activeMediaItem.type === 'video' ? (
            <video
              ref={videoElementRef}
              src={activeMediaItem.url}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              playsInline
              muted
            />
          ) : activeMediaItem.type === 'photo' ? (
            <img
              src={activeMediaItem.url}
              alt={activeMediaItem.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            // 音声クリップの場合の波形プレビュー
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#0f172a',
              color: '#38bdf8',
            }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎵</div>
              <div style={{ fontSize: '16px', fontWeight: 600 }}>{activeMediaItem.name}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Audio Track Preview</div>
            </div>
          )
        ) : activeVideoClip?.mediaId && !['v1', 'v2', 'v3'].includes(activeVideoClip.mediaId) ? (
          // メディアが削除されたかオフラインの場合の警告表示
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'repeating-linear-gradient(45deg, #1e293b, #1e293b 20px, #0f172a 20px, #0f172a 40px)',
            color: '#f87171',
            border: '2px dashed rgba(239, 68, 68, 0.4)',
          }}>
            <div style={{ fontSize: '40px', marginBottom: '8px' }}>⚠️</div>
            <div style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '0.05em' }}>MEDIA OFFLINE</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              ID: {activeVideoClip.mediaId} (ファイルが見つかりません)
            </div>
          </div>
        ) : (
          <>
            <div className="scene-sky" />

            <div className="scene-stars">
              {STARS.map(star => (
                <div
                  key={star.id}
                  className="scene-star"
                  style={{
                    left: `${star.x}%`,
                    top: `${star.y}%`,
                    width: `${star.size}px`,
                    height: `${star.size}px`,
                    opacity: star.opacity * (0.7 + Math.sin(currentTime * 0.5 + star.id) * 0.15),
                  }}
                />
              ))}
            </div>

            {/* Moon glow */}
            <div
              className="scene-glow"
              style={{
                left: `${moonX}%`,
                top: `${moonY}%`,
                width: '120px',
                height: '120px',
                background: `radial-gradient(circle, rgba(180,200,255,${glowIntensity}) 0%, transparent 70%)`,
                transform: 'translate(-50%, -50%)',
              }}
            />

            {/* Moon */}
            <div
              style={{
                position: 'absolute',
                left: `${moonX}%`,
                top: `${moonY}%`,
                transform: 'translate(-50%, -50%)',
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: 'radial-gradient(circle at 40% 35%, #e8eeff, #b0c4de)',
                boxShadow: '0 0 20px rgba(180,200,255,0.4)',
              }}
            />

            <div className="scene-horizon" />

            <div className="scene-water">
              {WATER_LINES.map(line => (
                <div
                  key={line.id}
                  className="scene-water-line"
                  style={{ bottom: `${line.bottom}%`, opacity: line.opacity }}
                />
              ))}
              <div style={{
                position: 'absolute',
                left: `${moonX - 2}%`,
                top: 0,
                width: '6px',
                bottom: 0,
                background: `linear-gradient(180deg, rgba(180,200,255,${glowIntensity * 0.3}) 0%, transparent 100%)`,
                filter: 'blur(4px)',
              }} />
            </div>

            <div className="scene-vignette" />
          </>
        )}
      </div>

      {/* Cross Dissolve 重ね合わせレイヤー（次クリップのフェードイン） */}
      {nextVideoOpacity > 0 && nextVideoClip && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: nextVideoOpacity,
            pointerEvents: 'none',
            zIndex: 6,
          }}
        >
          <div className="scene-sky" style={{ filter: 'hue-rotate(45deg) saturate(1.2)' }} />
          <div className="scene-horizon" style={{ background: 'linear-gradient(0deg, #1a0b2e 0%, transparent 70%)' }} />
          <div className="scene-vignette" />
        </div>
      )}

      {/* Dip to Black 用のブラックオーバーレイ */}
      {blackDipOpacity > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#000000',
            opacity: blackDipOpacity,
            pointerEvents: 'none',
            zIndex: 7,
          }}
        />
      )}

      {/* テキストトラック（タイトル演出のオーバーレイ合成） */}
      {activeTextClip && activeTextClip.text && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: activeTextClip.textAlign === 'left' ? 'flex-start' : activeTextClip.textAlign === 'right' ? 'flex-end' : 'center',
            padding: '10% 12%',
            pointerEvents: 'none',
            zIndex: 10,
            opacity: animatedTextValues ? animatedTextValues.opacity : 1,
            transform: `translate(${animatedTextValues ? animatedTextValues.positionX : (activeTextClip.x ?? 0)}%, ${animatedTextValues ? animatedTextValues.positionY : (activeTextClip.y ?? 0)}%) scale(${animatedTextValues ? animatedTextValues.scale : (activeTextClip.scale ?? 1)}) rotate(${animatedTextValues ? animatedTextValues.rotation : (activeTextClip.rotation ?? 0)}deg)`,
            transformOrigin: 'center center',
          }}
        >
          <div
            style={{
              fontFamily: activeTextClip.fontFamily || 'var(--font-ui)',
              fontSize: `${(activeTextClip.fontSize || 36) * 0.75}px`,
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: '#ffffff',
              textAlign: activeTextClip.textAlign || 'center',
              textShadow: '0 2px 16px rgba(0,0,0,0.85), 0 0 32px rgba(168,85,247,0.4)',
              lineHeight: 1.25,
            }}
          >
            {activeTextClip.text}
          </div>
        </div>
      )}

      {/* セーフエリアガイド (Title Safe & Action Safe) */}
      {showSafeAreas && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 15 }}>
          {/* Action Safe (90%) */}
          <div style={{
            position: 'absolute',
            inset: '5%',
            border: '1px dashed rgba(255,255,255,0.22)',
            boxSizing: 'border-box',
          }}>
            <span style={{ position: 'absolute', top: 2, left: 4, fontSize: '9px', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)' }}>ACTION SAFE 90%</span>
          </div>
          {/* Title Safe (80%) */}
          <div style={{
            position: 'absolute',
            inset: '10%',
            border: '1px dashed rgba(74,108,247,0.35)',
            boxSizing: 'border-box',
          }}>
            <span style={{ position: 'absolute', top: 2, left: 4, fontSize: '9px', color: 'rgba(74,108,247,0.5)', fontFamily: 'var(--font-mono)' }}>TITLE SAFE 80%</span>
          </div>
          {/* センタークロス */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 14,
            height: 14,
            transform: 'translate(-50%, -50%)',
          }}>
            <div style={{ position: 'absolute', top: 6, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.3)' }} />
            <div style={{ position: 'absolute', left: 6, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.3)' }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Seek Bar ──────────────────────────────────────────────────

interface SeekBarProps {
  current: number;
  total: number;
  onChange: (t: number) => void;
}

function SeekBar({ current, total, onChange }: SeekBarProps) {
  const percent = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="seek-bar-wrap">
      <div className="seek-bar-track">
        <div className="seek-bar-fill" style={{ width: `${percent}%` }} />
        <div className="seek-bar-thumb" style={{ left: `${percent}%` }} />
      </div>
      <input
        className="seek-bar-input"
        type="range"
        min={0}
        max={total}
        step={0.033}
        value={current}
        onChange={e => onChange(parseFloat(e.target.value))}
        aria-label="Seek position"
      />
    </div>
  );
}

// ── Aspect Ratio Buttons ──────────────────────────────────────

const ASPECT_RATIOS: AspectRatio[] = ['16:9', '9:16', '1:1', '4:3', '21:9'];

// ── Preview Panel ─────────────────────────────────────────────

export function PreviewPanel() {
  const { state, dispatch } = useEditorStore();
  const {
    isPlaying,
    currentTime,
    totalDuration,
    aspectRatio,
    previewQuality,
    showSafeAreas,
    tracks,
    transitions,
    keyframes,
    mediaItems,
    selectedClipId,
  } = state;

  // Refs to avoid stale closures
  const isPlayingRef = useRef(isPlaying);
  const currentTimeRef = useRef(currentTime);
  const totalDurationRef = useRef(totalDuration);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    totalDurationRef.current = totalDuration;
  }, [totalDuration]);

  const rafRef = useRef<number | null>(null);
  const prevTimestampRef = useRef<number | null>(null);

  // 再生ループ
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        prevTimestampRef.current = null;
      }
      return;
    }

    const frame = (timestamp: number) => {
      if (prevTimestampRef.current === null) {
        prevTimestampRef.current = timestamp;
      }
      const delta = (timestamp - prevTimestampRef.current) / 1000;
      prevTimestampRef.current = timestamp;

      const newTime = currentTimeRef.current + delta;

      if (newTime >= totalDurationRef.current) {
        dispatch({ type: 'SET_CURRENT_TIME', time: totalDurationRef.current });
        dispatch({ type: 'TOGGLE_PLAY' });
        return;
      }

      dispatch({ type: 'SET_CURRENT_TIME', time: newTime });
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        prevTimestampRef.current = null;
      }
    };
  }, [isPlaying, dispatch]);

  // グローバルショートカット (Space: Play/Pause, ←/→: 1秒スキップ)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      dispatch({ type: 'TOGGLE_PLAY' });
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      dispatch({ type: 'SET_CURRENT_TIME', time: Math.max(0, currentTimeRef.current - (e.shiftKey ? 5 : 1)) });
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      dispatch({ type: 'SET_CURRENT_TIME', time: Math.min(totalDurationRef.current, currentTimeRef.current + (e.shiftKey ? 5 : 1)) });
    }
  }, [dispatch]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // 現在の再生時刻に重なる有効なトランジション
  const activeTransition = useMemo(() => {
    return transitions.find(t =>
      t.enabled &&
      currentTime >= t.startTime &&
      currentTime <= t.startTime + t.duration
    );
  }, [transitions, currentTime]);

  // 現在の再生時刻または選択中クリップからアクティブな素材を特定
  const activeVideoClip = useMemo(() => {
    const videoTrack = tracks.find(t => t.type === 'video');
    if (!videoTrack) return undefined;

    // トランジションが動作中の場合は fromClip を優先
    if (activeTransition) {
      const from = videoTrack.clips.find(c => c.id === activeTransition.fromClipId);
      if (from) return from;
    }

    // 選択中のクリップが動画ならそれを優先
    if (selectedClipId) {
      const selected = videoTrack.clips.find(c => c.id === selectedClipId);
      if (selected) return selected;
    }

    // 再生ヘッド直下のクリップ
    return videoTrack.clips.find(c =>
      currentTime >= c.startTime && currentTime <= (c.startTime + c.duration)
    ) || videoTrack.clips[0];
  }, [tracks, selectedClipId, currentTime, activeTransition]);

  // トランジション時の遷移先クリップ
  const nextVideoClip = useMemo(() => {
    if (!activeTransition) return undefined;
    const videoTrack = tracks.find(t => t.id === activeTransition.trackId);
    return videoTrack?.clips.find(c => c.id === activeTransition.toClipId);
  }, [tracks, activeTransition]);

  const activeTextClip = useMemo(() => {
    const textTrack = tracks.find(t => t.type === 'text');
    if (!textTrack) return undefined;

    // 選択中のクリップがテキストならそれを優先
    if (selectedClipId) {
      const selected = textTrack.clips.find(c => c.id === selectedClipId);
      if (selected) return selected;
    }

    // 再生ヘッド直下のテキストクリップ
    return textTrack.clips.find(c =>
      currentTime >= c.startTime && currentTime <= (c.startTime + c.duration)
    );
  }, [tracks, selectedClipId, currentTime]);

  const qualityLabel = useMemo(() => {
    if (previewQuality === 'full') return 'FULL';
    if (previewQuality === 'half') return '½';
    return '¼';
  }, [previewQuality]);

  const transitionBadgeText = useMemo(() => {
    if (!activeTransition || !activeTransition.enabled) return null;
    const p = Math.round(((currentTime - activeTransition.startTime) / activeTransition.duration) * 100);
    const label = activeTransition.type === 'cross-dissolve' ? 'Cross Dissolve' : 'Dip to Black';
    return `⧗ ${label} (${p}%)`;
  }, [activeTransition, currentTime]);

  return (
    <main className="preview-panel">
      {/* Stage */}
      <div className="preview-stage">
        <div className="preview-aspect-wrap" data-ratio={aspectRatio}>
          <CinematicScene
            currentTime={currentTime}
            activeVideoClip={activeVideoClip}
            nextVideoClip={nextVideoClip}
            activeTransition={activeTransition}
            activeTextClip={activeTextClip}
            keyframes={keyframes}
            mediaItems={mediaItems}
            isPlaying={isPlaying}
            showSafeAreas={showSafeAreas}
          />

          {transitionBadgeText && (
            <div className="preview-transition-indicator">
              {transitionBadgeText}
            </div>
          )}

          <div className="preview-timecode">
            {formatTime(currentTime)}
          </div>

          <div className="preview-quality-badge">
            {qualityLabel}
          </div>

          {isPlaying && (
            <div
              className="preview-playing-indicator"
              aria-label="Playing"
              style={{ left: '50%', transform: 'translateX(-50%)' }}
            />
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="preview-controls">
        {/* Seek */}
        <div className="preview-seek-row">
          <div className="preview-time-display">
            {formatTime(currentTime)}
          </div>
          <SeekBar
            current={currentTime}
            total={totalDuration}
            onChange={t => dispatch({ type: 'SET_CURRENT_TIME', time: t })}
          />
          <div className="preview-time-display" style={{ textAlign: 'left' }}>
            {formatTime(totalDuration)}
          </div>
        </div>

        {/* Buttons row */}
        <div className="preview-btn-row">
          <button
            className="preview-ctrl-btn"
            onClick={() => dispatch({ type: 'SET_CURRENT_TIME', time: 0 })}
            title="Go to Start (Home)"
            aria-label="Skip to start"
          >
            <IconSkipBack />
          </button>

          <button
            className="preview-ctrl-btn"
            onClick={() => dispatch({ type: 'SET_CURRENT_TIME', time: Math.max(0, currentTime - 1) })}
            title="Step Back 1s (←)"
            aria-label="Step back"
          >
            <IconFrameBack />
          </button>

          <button
            className="preview-play-btn"
            onClick={() => dispatch({ type: 'TOGGLE_PLAY' })}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <IconPause /> : <IconPlay />}
          </button>

          <button
            className="preview-ctrl-btn"
            onClick={() => dispatch({ type: 'SET_CURRENT_TIME', time: Math.min(totalDuration, currentTime + 1) })}
            title="Step Forward 1s (→)"
            aria-label="Step forward"
          >
            <IconFrameForward />
          </button>

          <button
            className="preview-ctrl-btn"
            onClick={() => dispatch({ type: 'SET_CURRENT_TIME', time: totalDuration })}
            title="Go to End (End)"
            aria-label="Skip to end"
          >
            <IconSkipForward />
          </button>

          {/* セーフエリア表示トグルボタン */}
          <button
            className={`preview-ctrl-btn${showSafeAreas ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_SAFE_AREAS' })}
            title="Toggle Safe Area Guides"
            aria-label="Toggle safe area guides"
            style={{ marginLeft: 6, color: showSafeAreas ? 'var(--accent)' : undefined }}
          >
            <IconGrid />
          </button>

          <div className="preview-btn-spacer" />

          {/* Aspect Ratio */}
          <div className="aspect-ratio-btns" role="group" aria-label="Aspect ratio">
            {ASPECT_RATIOS.map(ratio => (
              <button
                key={ratio}
                className={`ar-btn${aspectRatio === ratio ? ' active' : ''}`}
                onClick={() => dispatch({ type: 'SET_ASPECT_RATIO', ratio })}
                aria-pressed={aspectRatio === ratio}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
