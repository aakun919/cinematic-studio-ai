// Timeline — 本格的タイムライン編集 (トリミング・分割・スナップ・削除・リップル編集・コンテキストメニュー)

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { useEditorStore } from '../store.ts';
import type { Track, Clip, SelectedGap, Transition, TransitionType, Keyframe } from '../types.ts';

// ── ヘルパー ────────────────────────────────────────────────

const MIN_CLIP_DURATION = 0.3; // 最小クリップ長 0.3秒に統一
const SNAP_THRESHOLD_PX = 10;   // スナップ吸着ピクセル閾値

function formatRulerTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m > 0) {
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  return `${s}s`;
}

function formatTooltipTime(sec: number): string {
  const total = Math.max(0, sec);
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = Math.floor(total % 60).toString().padStart(2, '0');
  const f = Math.floor((total % 1) * 30).toString().padStart(2, '0');
  return `${m}:${s}:${f}`;
}

// ── SVG アイコン ────────────────────────────────────────────

function IconVolume() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function IconVolumeMute() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconMagnet() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3v7a6 6 0 0 0 12 0V3" />
      <line x1="4" y1="7" x2="8" y2="7" />
      <line x1="16" y1="7" x2="20" y2="7" />
    </svg>
  );
}

function IconScissors() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconRipple() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="11 17 6 12 11 7" />
      <polyline points="18 17 13 12 18 7" />
    </svg>
  );
}

// ── Timeline Ruler (ドラッグスクラビング対応) ─────────────────

interface TimelineRulerProps {
  totalDuration: number;
  zoom: number;
  onSeek: (time: number) => void;
}

function TimelineRuler({ totalDuration, zoom, onSeek }: TimelineRulerProps) {
  const rulerWidth = Math.max(1200, (totalDuration + 15) * zoom);
  const isScrubbing = useRef(false);

  const stepSec = zoom >= 150 ? 1 : zoom >= 80 ? 2 : zoom >= 40 ? 5 : 10;
  const tickCount = Math.ceil((totalDuration + 15) / stepSec);

  const ticks = useMemo(() => {
    const items = [];
    for (let i = 0; i <= tickCount; i++) {
      const time = i * stepSec;
      const left = time * zoom;
      items.push({ time, left });
    }
    return items;
  }, [tickCount, stepSec, zoom]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isScrubbing.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    onSeek(Math.max(0, offsetX / zoom));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    onSeek(Math.max(0, offsetX / zoom));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isScrubbing.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="timeline-ruler"
      style={{ width: `${rulerWidth}px` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="slider"
      aria-label="Timeline Ruler"
    >
      {ticks.map(tick => (
        <React.Fragment key={tick.time}>
          <div
            className="ruler-tick ruler-tick--major"
            style={{ left: `${tick.left}px` }}
          />
          <div
            className="ruler-label"
            style={{ left: `${tick.left}px` }}
          >
            {formatRulerTime(tick.time)}
          </div>
          {zoom >= 50 && (
            <div
              className="ruler-tick ruler-tick--minor"
              style={{ left: `${tick.left + (stepSec * zoom) / 2}px` }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Timeline Gap Component (空白選択・削除) ──────────────────

interface TimelineGapProps {
  trackId: string;
  isLocked: boolean;
  startTime: number;
  duration: number;
  zoom: number;
  isSelected: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function TimelineGapItem({
  isLocked,
  startTime,
  duration,
  zoom,
  isSelected,
  onSelect,
  onContextMenu,
}: TimelineGapProps) {
  const leftPx = startTime * zoom;
  const widthPx = Math.max(10, duration * zoom);

  if (duration < 0.05) return null; // 50ms未満は隣接扱い

  return (
    <div
      className={`timeline-gap${isSelected ? ' selected' : ''}${isLocked ? ' locked' : ''}`}
      style={{
        left: `${leftPx}px`,
        width: `${widthPx}px`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (!isLocked) onSelect();
      }}
      onContextMenu={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!isLocked) {
          onSelect();
          onContextMenu(e);
        }
      }}
      title={`Gap: ${duration.toFixed(1)}s (Click to select, Del to close gap)`}
    >
      {isSelected && (
        <span className="gap-label-badge">
          Gap: {duration.toFixed(1)}s
        </span>
      )}
    </div>
  );
}

// ── Timeline Transition Item (トランジション描画 & リサイズ) ───

interface TimelineTransitionProps {
  transition: Transition;
  isLocked: boolean;
  zoom: number;
  isSelected: boolean;
  maxDuration: number;
  onSelect: () => void;
  onResize: (newDuration: number) => void;
  onCommitResize: (newDuration: number) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function TimelineTransitionItem({
  transition,
  isLocked,
  zoom,
  isSelected,
  maxDuration,
  onSelect,
  onResize,
  onCommitResize,
  onContextMenu,
}: TimelineTransitionProps) {
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const [tempDuration, setTempDuration] = useState<number>(transition.duration);

  const curDuration = isResizing ? tempDuration : transition.duration;
  // 境界を中心に対称配置
  const boundary = transition.startTime + transition.duration / 2;
  const leftPx = Math.max(0, (boundary - curDuration / 2) * zoom);
  const widthPx = Math.max(16, curDuration * zoom);

  const resizeInfo = useRef<{
    startX: number;
    origDuration: number;
  } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect();
  };

  const handleLeftResizeDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || isLocked) return;
    e.stopPropagation();
    onSelect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizeInfo.current = { startX: e.clientX, origDuration: transition.duration };
    setIsResizing('left');
    setTempDuration(transition.duration);
  };

  const handleRightResizeDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || isLocked) return;
    e.stopPropagation();
    onSelect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizeInfo.current = { startX: e.clientX, origDuration: transition.duration };
    setIsResizing('right');
    setTempDuration(transition.duration);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!resizeInfo.current || !isResizing || isLocked) return;
    const deltaX = e.clientX - resizeInfo.current.startX;
    // 片側ドラッグ量×2で対称に伸縮
    const factor = isResizing === 'left' ? -2 : 2;
    const raw = resizeInfo.current.origDuration + (deltaX / zoom) * factor;
    const clamped = Math.max(0.2, Math.min(maxDuration, raw));
    const rounded = Math.round(clamped * 10) / 10;
    setTempDuration(rounded);
    onResize(rounded);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!resizeInfo.current || !isResizing) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const rounded = Math.round(tempDuration * 10) / 10;
    if (Math.abs(rounded - transition.duration) > 0.05) {
      onCommitResize(rounded);
    }
    setIsResizing(null);
    resizeInfo.current = null;
  };

  const isDissolve = transition.type === 'cross-dissolve';
  const label = isDissolve ? 'Cross Dissolve' : 'Dip to Black';

  return (
    <div
      className={`timeline-transition timeline-transition--${transition.type}${isSelected ? ' selected' : ''}${!transition.enabled ? ' bypassed' : ''}${isLocked ? ' locked' : ''}`}
      style={{
        left: `${leftPx}px`,
        width: `${widthPx}px`,
      }}
      onPointerDown={handlePointerDown}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect();
        onContextMenu(e);
      }}
      title={`${label} (${curDuration.toFixed(1)}s)${!transition.enabled ? ' [Bypassed]' : ''}${isLocked ? ' [Locked]' : ''}`}
    >
      {/* 左端リサイズハンドル */}
      {!isLocked && (
        <div
          className="transition-resize-handle transition-resize-handle--left"
          onPointerDown={handleLeftResizeDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          title="Drag to adjust transition duration"
        />
      )}

      {/* グラフィック表現 */}
      <div className="transition-content">
        <span className="transition-type-icon">{isDissolve ? '⧗' : '◼'}</span>
        {widthPx > 36 && (
          <span className="transition-title-badge">
            {isDissolve ? 'Dissolve' : 'Dip Black'}
          </span>
        )}
      </div>

      {/* リサイズ中のツールチップ */}
      {isResizing && (
        <div className="clip-drag-tooltip">
          {label}: {curDuration.toFixed(1)}s
        </div>
      )}

      {/* 右端リサイズハンドル */}
      {!isLocked && (
        <div
          className="transition-resize-handle transition-resize-handle--right"
          onPointerDown={handleRightResizeDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          title="Drag to adjust transition duration"
        />
      )}
    </div>
  );
}

// ── Timeline Transition Hotspot (境界追加UI) ─────────────────

interface TimelineTransitionHotspotProps {
  boundaryTime: number;
  zoom: number;
  isLocked: boolean;
  onAdd: (type: TransitionType) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function TimelineTransitionHotspot({
  boundaryTime,
  zoom,
  isLocked,
  onAdd,
  onContextMenu,
}: TimelineTransitionHotspotProps) {
  const leftPx = boundaryTime * zoom;

  return (
    <div
      className={`timeline-transition-hotspot${isLocked ? ' locked' : ''}`}
      style={{ left: `${leftPx}px` }}
      onClick={(e) => {
        e.stopPropagation();
        if (!isLocked) onAdd('cross-dissolve');
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isLocked) onContextMenu(e);
      }}
      title={isLocked ? 'Track locked' : 'Click to Add Cross Dissolve (Right-click for options)'}
    >
      <div className="hotspot-trigger">
        <span className="hotspot-icon">+</span>
      </div>
    </div>
  );
}

// ── Keyframe Marker (タイムライン上のキーフレーム ◆) ──────────

interface KeyframeMarkerProps {
  keyframe: Keyframe;
  clip: Clip;
  zoom: number;
  isLocked: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onSeek: () => void;
  onTimeChange: (newTime: number) => void;
  onCommitTime: (newTime: number) => void;
}

function KeyframeMarker({
  keyframe,
  clip,
  zoom,
  isLocked,
  isSelected,
  onSelect,
  onSeek,
  onTimeChange,
  onCommitTime,
}: KeyframeMarkerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ clientX: number; origTime: number } | null>(null);

  const leftPx = keyframe.time * zoom;

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    onSelect();
    onSeek();
    if (isLocked) return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStartRef.current = {
      clientX: e.clientX,
      origTime: keyframe.time,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !dragStartRef.current) return;
    e.stopPropagation();
    const deltaSec = (e.clientX - dragStartRef.current.clientX) / zoom;
    const newTime = Math.max(0, Math.min(clip.duration, Math.round((dragStartRef.current.origTime + deltaSec) * 100) / 100));
    onTimeChange(newTime);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging || !dragStartRef.current) return;
    e.stopPropagation();
    const deltaSec = (e.clientX - dragStartRef.current.clientX) / zoom;
    const newTime = Math.max(0, Math.min(clip.duration, Math.round((dragStartRef.current.origTime + deltaSec) * 100) / 100));
    onCommitTime(newTime);
    setIsDragging(false);
    dragStartRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={`timeline-keyframe-diamond${isSelected ? ' selected' : ''}${isDragging ? ' dragging' : ''}`}
      style={{ left: `${leftPx}px` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      title={`${keyframe.property}: ${keyframe.value} (${keyframe.time.toFixed(2)}s, ${keyframe.easing})`}
    >
      <div className="diamond-shape" />
    </div>
  );
}

// ── Timeline Clip Item (移動 & トリム & スナップ & 右クリック & グループ移動) ─

interface TimelineClipProps {
  clip: Clip;
  trackType: Track['type'];
  isLocked: boolean;
  zoom: number;
  isSelected: boolean;
  isMultiSelected: boolean;
  hasLockedInSelection: boolean;
  groupMoveDeltaSec: number | null;
  snapTargets: number[];
  snapEnabled: boolean;
  clipKeyframes: Keyframe[];
  selectedKeyframeId: string | null;
  onSelect: (e: React.MouseEvent | React.PointerEvent) => void;
  onMove: (newStartTime: number) => void;
  onGroupMoveStart: (clip: Clip, clientX: number) => void;
  onGroupMoveDelta: (deltaSec: number, clientX: number) => void;
  onGroupMoveEnd: () => void;
  onTrim: (newStartTime: number, newDuration: number) => void;
  onSnapChange: (snapTime: number | null) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onKeyframeSelect: (keyframeId: string) => void;
  onKeyframeSeek: (time: number) => void;
  onKeyframeTimeChange: (keyframeId: string, newTime: number) => void;
  onKeyframeCommitTime: (keyframeId: string, newTime: number) => void;
}

function TimelineClipItem({
  clip,
  trackType,
  isLocked,
  zoom,
  isSelected,
  isMultiSelected,
  hasLockedInSelection,
  groupMoveDeltaSec,
  snapTargets,
  snapEnabled,
  clipKeyframes,
  selectedKeyframeId,
  onSelect,
  onMove,
  onGroupMoveStart,
  onGroupMoveDelta,
  onGroupMoveEnd,
  onTrim,
  onSnapChange,
  onContextMenu,
  onKeyframeSelect,
  onKeyframeSeek,
  onKeyframeTimeChange,
  onKeyframeCommitTime,
}: TimelineClipProps) {
  const [activeDrag, setActiveDrag] = useState<'move' | 'trim-left' | 'trim-right' | 'group-move' | 'group-locked' | null>(null);
  const [tempStart, setTempStart] = useState<number>(clip.startTime);
  const [tempDuration, setTempDuration] = useState<number>(clip.duration);
  const [isSnapped, setIsSnapped] = useState<boolean>(false);

  // グループ移動中かつ本クリップが選択されている場合、groupMoveDeltaSec分シフト
  const effectiveShift = (groupMoveDeltaSec !== null && isSelected) ? groupMoveDeltaSec : 0;
  const currentStart = (activeDrag === 'move' || activeDrag === 'trim-left')
    ? tempStart
    : Math.max(0, clip.startTime + effectiveShift);
  const currentDuration = (activeDrag === 'trim-left' || activeDrag === 'trim-right')
    ? tempDuration
    : clip.duration;

  const leftPx = currentStart * zoom;
  const widthPx = Math.max(20, currentDuration * zoom);

  const dragInfo = useRef<{
    startX: number;
    origStart: number;
    origDuration: number;
    origEnd: number;
  } | null>(null);

  const calculateSnap = useCallback((candidateTime: number): number | null => {
    if (!snapEnabled) return null;
    const thresholdSec = SNAP_THRESHOLD_PX / zoom;
    let closestTarget: number | null = null;
    let minDiff = Infinity;

    for (const target of snapTargets) {
      const diff = Math.abs(candidateTime - target);
      if (diff <= thresholdSec && diff < minDiff) {
        minDiff = diff;
        closestTarget = target;
      }
    }
    return closestTarget;
  }, [snapEnabled, zoom, snapTargets]);

  const handleBodyPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    // Shift + Click: 選択のトグル (ドラッグは行わない)
    if (e.shiftKey) {
      onSelect(e);
      return;
    }

    // 既に複数選択されている状態でドラッグを開始
    if (isSelected && isMultiSelected) {
      if (hasLockedInSelection) {
        // ロックトラックが含まれているためグループ移動不可
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setActiveDrag('group-locked');
        dragInfo.current = {
          startX: e.clientX,
          origStart: clip.startTime,
          origDuration: clip.duration,
          origEnd: clip.startTime + clip.duration,
        };
        return;
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setActiveDrag('group-move');
      dragInfo.current = {
        startX: e.clientX,
        origStart: clip.startTime,
        origDuration: clip.duration,
        origEnd: clip.startTime + clip.duration,
      };
      onGroupMoveStart(clip, e.clientX);
      return;
    }

    // 未選択だった場合は即座に選択
    if (!isSelected) {
      onSelect(e);
    }
    if (isLocked) return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragInfo.current = {
      startX: e.clientX,
      origStart: clip.startTime,
      origDuration: clip.duration,
      origEnd: clip.startTime + clip.duration,
    };
    setActiveDrag('move');
    setTempStart(clip.startTime);
    setTempDuration(clip.duration);
    setIsSnapped(false);
  };

  const handleLeftTrimPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect(e);
    if (isLocked) return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragInfo.current = {
      startX: e.clientX,
      origStart: clip.startTime,
      origDuration: clip.duration,
      origEnd: clip.startTime + clip.duration,
    };
    setActiveDrag('trim-left');
    setTempStart(clip.startTime);
    setTempDuration(clip.duration);
    setIsSnapped(false);
  };

  const handleRightTrimPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect(e);
    if (isLocked) return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragInfo.current = {
      startX: e.clientX,
      origStart: clip.startTime,
      origDuration: clip.duration,
      origEnd: clip.startTime + clip.duration,
    };
    setActiveDrag('trim-right');
    setTempStart(clip.startTime);
    setTempDuration(clip.duration);
    setIsSnapped(false);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragInfo.current || !activeDrag) return;
    const deltaX = e.clientX - dragInfo.current.startX;
    const deltaSec = deltaX / zoom;

    if (activeDrag === 'group-move') {
      onGroupMoveDelta(deltaSec, e.clientX);
      return;
    }

    if (activeDrag === 'group-locked') {
      return;
    }

    if (activeDrag === 'move' && !isLocked) {
      const rawStart = Math.max(0, dragInfo.current.origStart + deltaSec);
      const rawEnd = rawStart + dragInfo.current.origDuration;

      const snapStart = calculateSnap(rawStart);
      const snapEnd = calculateSnap(rawEnd);

      let finalStart = rawStart;
      let snapPos: number | null = null;

      if (snapStart !== null) {
        finalStart = Math.max(0, snapStart);
        snapPos = snapStart;
      } else if (snapEnd !== null) {
        finalStart = Math.max(0, snapEnd - dragInfo.current.origDuration);
        snapPos = snapEnd;
      }

      setTempStart(finalStart);
      setIsSnapped(snapPos !== null);
      onSnapChange(snapPos);

    } else if (activeDrag === 'trim-left' && !isLocked) {
      const maxAllowedStart = dragInfo.current.origEnd - MIN_CLIP_DURATION;
      const rawStart = Math.max(0, Math.min(maxAllowedStart, dragInfo.current.origStart + deltaSec));

      const snap = calculateSnap(rawStart);
      let finalStart = rawStart;
      if (snap !== null && snap <= maxAllowedStart && snap >= 0) {
        finalStart = snap;
      }

      const finalDuration = dragInfo.current.origEnd - finalStart;
      setTempStart(finalStart);
      setTempDuration(finalDuration);
      setIsSnapped(snap !== null);
      onSnapChange(snap);

    } else if (activeDrag === 'trim-right' && !isLocked) {
      const rawEnd = Math.max(dragInfo.current.origStart + MIN_CLIP_DURATION, dragInfo.current.origEnd + deltaSec);

      const snap = calculateSnap(rawEnd);
      let finalEnd = rawEnd;
      if (snap !== null && snap >= dragInfo.current.origStart + MIN_CLIP_DURATION) {
        finalEnd = snap;
      }

      const finalDuration = finalEnd - dragInfo.current.origStart;
      setTempDuration(finalDuration);
      setIsSnapped(snap !== null);
      onSnapChange(snap);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragInfo.current || !activeDrag) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    onSnapChange(null);
    setIsSnapped(false);

    if (activeDrag === 'group-move') {
      const deltaX = Math.abs(e.clientX - dragInfo.current.startX);
      onGroupMoveEnd();
      // 移動量がごく小さい（クリック動作）場合、このクリップのみの単一選択にする
      if (deltaX < 4) {
        onSelect(e);
      }
      setActiveDrag(null);
      dragInfo.current = null;
      return;
    }

    if (activeDrag === 'group-locked') {
      setActiveDrag(null);
      dragInfo.current = null;
      return;
    }

    if (activeDrag === 'move') {
      const roundedStart = Math.round(tempStart * 10) / 10;
      if (Math.abs(roundedStart - clip.startTime) > 0.05) {
        onMove(roundedStart);
      }
    } else if (activeDrag === 'trim-left') {
      const roundedStart = Math.round(tempStart * 10) / 10;
      const roundedDur = Math.round(tempDuration * 10) / 10;
      if (Math.abs(roundedStart - clip.startTime) > 0.05 || Math.abs(roundedDur - clip.duration) > 0.05) {
        onTrim(roundedStart, roundedDur);
      }
    } else if (activeDrag === 'trim-right') {
      const roundedDur = Math.round(tempDuration * 10) / 10;
      if (Math.abs(roundedDur - clip.duration) > 0.05) {
        onTrim(clip.startTime, roundedDur);
      }
    }

    setActiveDrag(null);
    dragInfo.current = null;
  };

  const isLockedForMove = isLocked || (isSelected && isMultiSelected && hasLockedInSelection);

  return (
    <div
      className={`timeline-clip timeline-clip--${trackType}${isSelected ? ' selected' : ''}${activeDrag === 'move' || activeDrag === 'group-move' ? ' dragging' : ''}${isLocked ? ' locked' : ''}${isLockedForMove ? ' group-locked-cursor' : ''}`}
      style={{
        left: `${leftPx}px`,
        width: `${widthPx}px`,
        cursor: isLockedForMove ? 'not-allowed' : (activeDrag === 'move' || activeDrag === 'group-move') ? 'grabbing' : 'grab',
      }}
      onPointerDown={handleBodyPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(e);
        onContextMenu(e);
      }}
      title={`${clip.label} (${currentDuration.toFixed(1)}s)${isLocked ? ' [Track Locked]' : ''}${isSelected && isMultiSelected && hasLockedInSelection ? ' [Group Move Blocked: Contains locked track]' : ''}`}
    >
      {/* ── 左端トリミングハンドル (単一選択時のみ有効) ── */}
      {!isLocked && !isMultiSelected && (
        <div
          className="clip-trim-handle clip-trim-handle--left"
          onPointerDown={handleLeftTrimPointerDown}
          title="Drag to trim start (Left Trim)"
        >
          <div className="trim-handle-bar" />
        </div>
      )}

      {/* ── ドラッグ・トリム中の時間ツールチップ ── */}
      {activeDrag && (
        <div className={`clip-drag-tooltip${activeDrag === 'group-locked' ? ' clip-drag-tooltip--locked' : ''}`}>
          {activeDrag === 'group-locked' && (
            <span>🔒 Locked Track in Selection — Move Blocked</span>
          )}
          {activeDrag === 'group-move' && (
            <>
              Group Move: {formatTooltipTime(currentStart)}
              {isSnapped && <span className="tooltip-snap-badge">🧲 Snapped</span>}
            </>
          )}
          {activeDrag === 'move' && (
            <>
              {formatTooltipTime(currentStart)}
              {isSnapped && <span className="tooltip-snap-badge">🧲 Snapped</span>}
            </>
          )}
          {activeDrag === 'trim-left' && (
            <>
              In: {formatTooltipTime(currentStart)} | Dur: {currentDuration.toFixed(1)}s
              {isSnapped && <span className="tooltip-snap-badge">🧲 Snapped</span>}
            </>
          )}
          {activeDrag === 'trim-right' && (
            <>
              Out: {formatTooltipTime(currentStart + currentDuration)} | Dur: {currentDuration.toFixed(1)}s
              {isSnapped && <span className="tooltip-snap-badge">🧲 Snapped</span>}
            </>
          )}
        </div>
      )}

      <span className="clip-label">{clip.label}</span>

      {trackType === 'audio' && (
        <div className="clip-waveform">
          {Array.from({ length: Math.min(30, Math.floor(widthPx / 4)) }).map((_, idx) => (
            <div
              key={idx}
              className="clip-wave-bar"
              style={{
                height: `${Math.sin(idx * 0.9) * 40 + 50}%`,
              }}
            />
          ))}
        </div>
      )}

      {/* ── キーフレームダイヤモンドマーカー ── */}
      {clipKeyframes.length > 0 && (
        <div className="clip-keyframe-track" style={{ pointerEvents: 'none' }}>
          {clipKeyframes.map(kf => (
            <div
              key={kf.id}
              style={{ pointerEvents: 'auto', position: 'absolute', top: 0, bottom: 0 }}
            >
              <KeyframeMarker
                keyframe={kf}
                clip={clip}
                zoom={zoom}
                isLocked={isLocked}
                isSelected={selectedKeyframeId === kf.id}
                onSelect={() => onKeyframeSelect(kf.id)}
                onSeek={() => onKeyframeSeek(clip.startTime + kf.time)}
                onTimeChange={(newTime) => onKeyframeTimeChange(kf.id, newTime)}
                onCommitTime={(newTime) => onKeyframeCommitTime(kf.id, newTime)}
              />
            </div>
          ))}
        </div>
      )}

      {/* ── 右端トリミングハンドル (単一選択時のみ有効) ── */}
      {!isLocked && !isMultiSelected && (
        <div
          className="clip-trim-handle clip-trim-handle--right"
          onPointerDown={handleRightTrimPointerDown}
          title="Drag to trim end (Right Trim)"
        >
          <div className="trim-handle-bar" />
        </div>
      )}
    </div>
  );
}

// ── Timeline Component ───────────────────────────────────────

export function Timeline() {
  const { state, dispatch } = useEditorStore();
  const {
    tracks,
    transitions,
    keyframes,
    currentTime,
    totalDuration,
    timelineZoom,
    selectedClipId,
    selectedClipIds,
    selectedTransitionId,
    selectedKeyframeId,
    selectedGap,
    snapEnabled,
  } = state;

  const [snapGuideTime, setSnapGuideTime] = useState<number | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // 複数選択フラグとロック中トラックの有無
  const isMultiSelected = selectedClipIds.length > 1;
  const hasLockedInSelection = useMemo(() => {
    return tracks.some(t => t.locked && t.clips.some(c => selectedClipIds.includes(c.id)));
  }, [tracks, selectedClipIds]);

  // グループ移動の状態管理
  const [groupMove, setGroupMove] = useState<{
    active: boolean;
    anchorClip: Clip;
    startX: number;
    deltaSec: number;
    minStart: number;
    isSnapped: boolean;
  } | null>(null);

  // 範囲選択（Marquee / Box Selection）の状態管理
  const [marquee, setMarquee] = useState<{
    isDragging: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    isShift: boolean;
    initialIds: string[];
  } | null>(null);

  // コンテキストメニューの状態
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: 'clip' | 'gap' | 'group' | 'transition' | 'boundary';
    clipId?: string;
    gap?: SelectedGap;
    transitionId?: string;
    trackId?: string;
    fromClipId?: string;
    toClipId?: string;
  } | null>(null);

  // コンテキストメニューを外側クリックで閉じる
  useEffect(() => {
    const handleWindowClick = () => setContextMenu(null);
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, []);

  const rulerWidth = Math.max(1200, (totalDuration + 20) * timelineZoom);
  const playheadLeft = currentTime * timelineZoom;

  const handleSeek = useCallback((time: number) => {
    dispatch({ type: 'SET_CURRENT_TIME', time });
  }, [dispatch]);

  // 全スナップターゲット (0s, 再生ヘッド, 全クリップ端点)
  const allSnapTargets = useMemo(() => {
    const targets = new Set<number>();
    targets.add(0);
    targets.add(currentTime);

    for (const track of tracks) {
      for (const clip of track.clips) {
        targets.add(clip.startTime);
        targets.add(clip.startTime + clip.duration);
      }
    }
    return Array.from(targets);
  }, [tracks, currentTime]);

  // 単一選択中クリップと所属トラックの特定
  let selectedInfo: { clip: Clip; track: Track } | null = null;
  if (selectedClipId && !isMultiSelected) {
    for (const track of tracks) {
      const clip = track.clips.find(c => c.id === selectedClipId);
      if (clip) {
        selectedInfo = { clip, track };
        break;
      }
    }
  }

  // 分割（Split）可能判定 (単一選択かつ最小0.3秒ルール)
  const canSplit = Boolean(
    !isMultiSelected &&
    selectedInfo &&
    !selectedInfo.track.locked &&
    currentTime >= selectedInfo.clip.startTime + MIN_CLIP_DURATION &&
    currentTime <= selectedInfo.clip.startTime + selectedInfo.clip.duration - MIN_CLIP_DURATION
  );

  // 削除可能判定
  const canDeleteClip = Boolean(!isMultiSelected && selectedInfo && !selectedInfo.track.locked);
  const canDeleteGap = Boolean(selectedGap && !tracks.find(t => t.id === selectedGap.trackId)?.locked);
  const canDeleteMulti = Boolean(isMultiSelected && !hasLockedInSelection);
  const selectedTrans = transitions.find(t => t.id === selectedTransitionId);
  const canDeleteTransition = Boolean(selectedTrans && !tracks.find(t => t.id === selectedTrans.trackId)?.locked);
  const canDelete = canDeleteTransition || canDeleteMulti || canDeleteClip || canDeleteGap;

  // 1. 通常削除 (Lift / Group Lift / Transition Delete)
  const handleDelete = useCallback(() => {
    if (selectedTransitionId) {
      if (canDeleteTransition) {
        dispatch({ type: 'DELETE_TRANSITION', id: selectedTransitionId });
      }
    } else if (isMultiSelected) {
      if (!hasLockedInSelection) {
        dispatch({ type: 'DELETE_CLIPS', clipIds: selectedClipIds });
      }
    } else if (selectedClipId && canDeleteClip) {
      dispatch({ type: 'DELETE_CLIP', clipId: selectedClipId });
    } else if (selectedGap && canDeleteGap) {
      dispatch({
        type: 'DELETE_GAP',
        trackId: selectedGap.trackId,
        startTime: selectedGap.startTime,
        duration: selectedGap.duration,
      });
    }
  }, [selectedTransitionId, canDeleteTransition, isMultiSelected, hasLockedInSelection, selectedClipIds, selectedClipId, canDeleteClip, selectedGap, canDeleteGap, dispatch]);

  // 2. リップル削除 (Ripple Delete) — 単一選択時のみ
  const handleRippleDelete = useCallback(() => {
    if (isMultiSelected || selectedTransitionId) return;
    if (selectedClipId && canDeleteClip) {
      dispatch({ type: 'RIPPLE_DELETE_CLIP', clipId: selectedClipId });
    } else if (selectedGap && canDeleteGap) {
      dispatch({
        type: 'DELETE_GAP',
        trackId: selectedGap.trackId,
        startTime: selectedGap.startTime,
        duration: selectedGap.duration,
      });
    }
  }, [isMultiSelected, selectedTransitionId, selectedClipId, canDeleteClip, selectedGap, canDeleteGap, dispatch]);

  // 3. クリップ分割 (Split) — 単一選択時のみ
  const handleSplit = useCallback(() => {
    if (!canSplit || !selectedInfo) return;
    dispatch({
      type: 'SPLIT_CLIP',
      clipId: selectedInfo.clip.id,
      splitTime: currentTime,
    });
  }, [canSplit, selectedInfo, currentTime, dispatch]);

  // 4. クリップ複製 (Duplicate / Group Duplicate)
  const handleDuplicate = useCallback(() => {
    if (isMultiSelected) {
      if (!hasLockedInSelection) {
        dispatch({ type: 'DUPLICATE_CLIPS', clipIds: selectedClipIds });
      }
    } else if (selectedClipId && canDeleteClip) {
      dispatch({ type: 'DUPLICATE_CLIP', clipId: selectedClipId });
    }
  }, [isMultiSelected, hasLockedInSelection, selectedClipIds, selectedClipId, canDeleteClip, dispatch]);

  // クリップ選択ハンドラ (Shift+Clickによるトグル vs 通常単一選択)
  const handleClipSelect = useCallback((clipId: string, trackId: string, e: React.MouseEvent | React.PointerEvent) => {
    if (e.shiftKey) {
      dispatch({ type: 'TOGGLE_SELECT_CLIP', clipId });
    } else {
      dispatch({ type: 'SELECT_CLIP', clipId, trackId });
    }
  }, [dispatch]);

  // ── グループ移動ハンドラ ──
  const handleGroupMoveStart = useCallback((anchorClip: Clip, clientX: number) => {
    const selectedClips: Clip[] = [];
    for (const t of tracks) {
      for (const c of t.clips) {
        if (selectedClipIds.includes(c.id)) {
          selectedClips.push(c);
        }
      }
    }
    const minStart = selectedClips.length > 0 ? Math.min(...selectedClips.map(c => c.startTime)) : 0;
    setGroupMove({
      active: true,
      anchorClip,
      startX: clientX,
      deltaSec: 0,
      minStart,
      isSnapped: false,
    });
  }, [tracks, selectedClipIds]);

  const handleGroupMoveDelta = useCallback((rawDeltaSec: number) => {
    if (!groupMove) return;
    const allowedDelta = Math.max(-groupMove.minStart, rawDeltaSec);

    // スナップ吸着判定 (アンカークリップの端点で計算)
    let finalDelta = allowedDelta;
    let snapPos: number | null = null;

    if (snapEnabled) {
      const thresholdSec = SNAP_THRESHOLD_PX / timelineZoom;
      const rawAnchorStart = Math.max(0, groupMove.anchorClip.startTime + allowedDelta);
      const rawAnchorEnd = rawAnchorStart + groupMove.anchorClip.duration;

      const otherTargets = allSnapTargets.filter(t => {
        return Math.abs(t - groupMove.anchorClip.startTime) > 0.001;
      });

      let minDiff = Infinity;
      for (const target of otherTargets) {
        const diffStart = Math.abs(rawAnchorStart - target);
        if (diffStart <= thresholdSec && diffStart < minDiff) {
          minDiff = diffStart;
          finalDelta = target - groupMove.anchorClip.startTime;
          snapPos = target;
        }
        const diffEnd = Math.abs(rawAnchorEnd - target);
        if (diffEnd <= thresholdSec && diffEnd < minDiff) {
          minDiff = diffEnd;
          finalDelta = (target - groupMove.anchorClip.duration) - groupMove.anchorClip.startTime;
          snapPos = target;
        }
      }
    }

    finalDelta = Math.max(-groupMove.minStart, finalDelta);
    setGroupMove(prev => prev ? { ...prev, deltaSec: finalDelta, isSnapped: snapPos !== null } : null);
    setSnapGuideTime(snapPos);
  }, [groupMove, snapEnabled, timelineZoom, allSnapTargets]);

  const handleGroupMoveEnd = useCallback(() => {
    if (groupMove && Math.abs(groupMove.deltaSec) > 0.05 && !hasLockedInSelection) {
      dispatch({
        type: 'MOVE_CLIPS',
        clipIds: selectedClipIds,
        deltaSec: groupMove.deltaSec,
      });
    }
    setGroupMove(null);
    setSnapGuideTime(null);
  }, [groupMove, hasLockedInSelection, selectedClipIds, dispatch]);

  // ── 範囲選択 (Marquee / Box Selection) ハンドラ ──
  const handleScrollAreaPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const isBackground =
      target.classList.contains('timeline-track-row') ||
      target.classList.contains('timeline-scroll-inner') ||
      target.classList.contains('timeline-scroll-area');

    if (!isBackground) return;

    const scrollEl = scrollAreaRef.current;
    if (!scrollEl) return;

    const rect = scrollEl.getBoundingClientRect();
    const startX = e.clientX - rect.left + scrollEl.scrollLeft;
    const startY = e.clientY - rect.top + scrollEl.scrollTop;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setMarquee({
      isDragging: false,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      isShift: e.shiftKey,
      initialIds: [...selectedClipIds],
    });
  };

  const handleScrollAreaPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!marquee) return;
    const scrollEl = scrollAreaRef.current;
    if (!scrollEl) return;

    const rect = scrollEl.getBoundingClientRect();
    const currentX = e.clientX - rect.left + scrollEl.scrollLeft;
    const currentY = e.clientY - rect.top + scrollEl.scrollTop;

    const dist = Math.hypot(currentX - marquee.startX, currentY - marquee.startY);
    const isDragging = marquee.isDragging || dist > 5;

    setMarquee(prev => prev ? { ...prev, isDragging, currentX, currentY } : null);

    if (isDragging) {
      const minX = Math.min(marquee.startX, currentX);
      const maxX = Math.max(marquee.startX, currentX);
      const minY = Math.min(marquee.startY, currentY);
      const maxY = Math.max(marquee.startY, currentY);

      const hits: string[] = [];
      tracks.forEach((track, trackIdx) => {
        const trackTop = 26 + trackIdx * 52;
        const trackBottom = trackTop + 52;
        if (trackBottom < minY || trackTop > maxY) return;

        for (const clip of track.clips) {
          const clipLeft = clip.startTime * timelineZoom;
          const clipRight = (clip.startTime + clip.duration) * timelineZoom;
          if (!(clipRight < minX || clipLeft > maxX)) {
            hits.push(clip.id);
          }
        }
      });

      const combinedIds = marquee.isShift
        ? Array.from(new Set([...marquee.initialIds, ...hits]))
        : hits;

      dispatch({ type: 'SELECT_CLIPS', clipIds: combinedIds });
    }
  };

  const handleScrollAreaPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!marquee) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (!marquee.isDragging) {
      dispatch({ type: 'DESELECT_ALL' });
      const scrollEl = scrollAreaRef.current;
      if (scrollEl) {
        const rect = scrollEl.getBoundingClientRect();
        const offsetX = e.clientX - rect.left + scrollEl.scrollLeft;
        handleSeek(Math.max(0, offsetX / timelineZoom));
      }
    }

    setMarquee(null);
  };

  // キーボードショートカットハンドラ
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (e.key === 'Escape') {
        e.preventDefault();
        dispatch({ type: 'DESELECT_ALL' });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (selectedTransitionId) {
          handleDelete();
        } else if (e.shiftKey && !isMultiSelected) {
          handleRippleDelete();
        } else {
          handleDelete();
        }
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicate();
      } else if ((mod && e.key.toLowerCase() === 'b') || (!mod && (e.key === 'c' || e.key === 's'))) {
        if (canSplit) {
          e.preventDefault();
          handleSplit();
        }
      } else if (!mod && e.key === 'n') {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_SNAP' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canSplit, canDelete, isMultiSelected, selectedTransitionId, handleDelete, handleRippleDelete, handleDuplicate, handleSplit, dispatch]);

  return (
    <section className="timeline" aria-label="Timeline Editor">
      {/* タイムラインツールバー */}
      <div className="timeline-toolbar">
        <span className="timeline-toolbar-title">TIMELINE</span>

        {/* 選択バッジ */}
        {selectedTransitionId ? (
          <div className="selection-count-badge selection-count-badge--trans">
            Transition Selected
          </div>
        ) : selectedClipIds.length > 0 ? (
          <div className="selection-count-badge">
            {selectedClipIds.length === 1 ? '1 Clip Selected' : `${selectedClipIds.length} Clips Selected`}
          </div>
        ) : null}

        <div className="topbar-divider" style={{ height: 14, margin: '0 8px' }} />

        {/* クリップ分割 (Split) */}
        <button
          className={`tb-btn timeline-tool-btn${canSplit ? ' active' : ''}`}
          onClick={handleSplit}
          disabled={!canSplit}
          title={isMultiSelected ? 'Split disabled during multi-selection' : canSplit ? 'Split clip at playhead (⌘B / S)' : 'Position playhead inside selected clip to split'}
          aria-label="Split clip"
        >
          <IconScissors />
          <span>Split</span>
        </button>

        {/* 通常削除 (Delete / Lift / Delete Transition) */}
        <button
          className={`tb-btn timeline-tool-btn${canDelete ? ' active' : ''}`}
          onClick={handleDelete}
          disabled={!canDelete}
          title={selectedTransitionId ? 'Delete Transition (Delete / Backspace)' : isMultiSelected ? (hasLockedInSelection ? 'Cannot delete: contains locked track' : `Delete ${selectedClipIds.length} selected clips (Delete / Backspace)`) : 'Delete selected clip or gap (Delete / Backspace)'}
          aria-label="Delete"
        >
          <IconTrash />
          <span>{selectedTransitionId ? 'Delete Transition' : selectedGap ? 'Delete Gap' : isMultiSelected ? `Delete (${selectedClipIds.length})` : 'Delete'}</span>
        </button>

        {/* リップル削除 (Ripple Delete) */}
        <button
          className={`tb-btn timeline-tool-btn${canDeleteClip ? ' active' : ''}`}
          onClick={handleRippleDelete}
          disabled={!canDeleteClip || isMultiSelected || Boolean(selectedTransitionId)}
          title={isMultiSelected ? 'Ripple Delete is disabled for multiple selection' : 'Delete clip and close gap (Shift + Delete)'}
          aria-label="Ripple Delete"
        >
          <IconRipple />
          <span>Ripple Delete</span>
        </button>

        <div className="topbar-divider" style={{ height: 14, margin: '0 8px' }} />

        {/* スナップ吸着 (Snap) */}
        <button
          className={`tb-btn timeline-tool-btn${snapEnabled ? ' snap-active' : ''}`}
          onClick={() => dispatch({ type: 'TOGGLE_SNAP' })}
          title={snapEnabled ? 'Snapping is ON (Press N to toggle)' : 'Snapping is OFF (Press N to toggle)'}
          aria-label="Toggle snap"
        >
          <IconMagnet />
          <span>Snap {snapEnabled ? 'ON' : 'OFF'}</span>
        </button>

        <div className="timeline-toolbar-spacer" />

        {/* ズームスライダー */}
        <span className="timeline-zoom-label">Zoom</span>
        <input
          className="timeline-zoom-slider"
          type="range"
          min={20}
          max={300}
          value={timelineZoom}
          onChange={e => dispatch({ type: 'SET_TIMELINE_ZOOM', zoom: parseInt(e.target.value, 10) })}
          aria-label="Timeline zoom"
        />
        <span className="timeline-zoom-value">{timelineZoom} px/s</span>
      </div>

      {/* タイムライン本体 */}
      <div className="timeline-body">
        {/* 左側：トラックヘッダー一覧 */}
        <div className="timeline-labels">
          <div className="timeline-label-spacer" />
          {tracks.map(track => (
            <div key={track.id} className="track-label-row">
              <div className={`track-type-dot track-type-dot--${track.type}`} />
              <span className="track-label-name" title={track.label}>{track.label}</span>
              <div className="track-label-actions">
                <button
                  className={`track-action-btn${track.muted ? ' active' : ''}`}
                  onClick={() => dispatch({ type: 'TOGGLE_TRACK_MUTE', trackId: track.id })}
                  title={track.muted ? 'Unmute Track' : 'Mute Track'}
                  aria-label={`Mute track ${track.label}`}
                >
                  {track.muted ? <IconVolumeMute /> : <IconVolume />}
                </button>
                <button
                  className={`track-action-btn${track.locked ? ' active' : ''}`}
                  onClick={() => dispatch({ type: 'TOGGLE_TRACK_LOCK', trackId: track.id })}
                  title={track.locked ? 'Unlock Track' : 'Lock Track'}
                  aria-label={`Lock track ${track.label}`}
                >
                  <IconLock />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* 右側：スクロール可能トラックエリア */}
        <div
          className="timeline-scroll-area"
          ref={scrollAreaRef}
          onPointerDown={handleScrollAreaPointerDown}
          onPointerMove={handleScrollAreaPointerMove}
          onPointerUp={handleScrollAreaPointerUp}
          onPointerCancel={handleScrollAreaPointerUp}
        >
          <div
            className="timeline-scroll-inner"
            style={{ width: `${rulerWidth}px` }}
          >
            {/* 時間目盛りルーラー (ドラッグスクラビング対応) */}
            <TimelineRuler
              totalDuration={totalDuration}
              zoom={timelineZoom}
              onSeek={handleSeek}
            />

            {/* トラック行とクリップ & ギャップ & トランジション */}
            {tracks.map(track => {
              const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime);
              const gaps: { startTime: number; duration: number }[] = [];

              if (sortedClips.length > 0 && sortedClips[0].startTime > 0.05) {
                gaps.push({ startTime: 0, duration: sortedClips[0].startTime });
              }

              for (let i = 0; i < sortedClips.length - 1; i++) {
                const currentEnd = sortedClips[i].startTime + sortedClips[i].duration;
                const nextStart = sortedClips[i + 1].startTime;
                const gapDuration = nextStart - currentEnd;
                if (gapDuration >= 0.05) {
                  gaps.push({ startTime: currentEnd, duration: gapDuration });
                }
              }

              // 当該トラックのトランジション
              const trackTransitions = transitions.filter(t => t.trackId === track.id);

              // トランジション追加可能な隣接クリップ境界（カットポイント）の検出 (映像トラックのみ)
              const cutBoundaries: { boundaryTime: number; fromClip: Clip; toClip: Clip }[] = [];
              if (track.type === 'video') {
                for (let i = 0; i < sortedClips.length - 1; i++) {
                  const c1 = sortedClips[i];
                  const c2 = sortedClips[i + 1];
                  const b = c1.startTime + c1.duration;
                  // クリップが隣接している (gap < 0.1s)
                  if (Math.abs(c2.startTime - b) <= 0.1) {
                    const hasTrans = trackTransitions.some(
                      t => (t.fromClipId === c1.id && t.toClipId === c2.id) ||
                           Math.abs(t.startTime + t.duration / 2 - b) < 0.2
                    );
                    if (!hasTrans) {
                      cutBoundaries.push({ boundaryTime: b, fromClip: c1, toClip: c2 });
                    }
                  }
                }
              }

              return (
                <div
                  key={track.id}
                  className={`timeline-track-row${track.locked ? ' track-locked' : ''}`}
                  onDragOver={(e) => {
                    if (track.locked) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                  }}
                  onDrop={(e) => {
                    if (track.locked) return;
                    e.preventDefault();
                    try {
                      const data = JSON.parse(e.dataTransfer.getData('application/json'));
                      if (data && data.mediaId) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const clickX = e.clientX - rect.left;
                        const dropTime = Math.max(0, Math.round((clickX / timelineZoom) * 10) / 10);
                        dispatch({
                          type: 'ADD_CLIP_FROM_MEDIA',
                          mediaId: data.mediaId,
                          trackId: track.id,
                          startTime: dropTime,
                        });
                      }
                    } catch {
                      // ignore non-json drops
                    }
                  }}
                >
                  {/* ギャップ要素の描画 */}
                  {gaps.map(gap => (
                    <TimelineGapItem
                      key={`gap-${track.id}-${gap.startTime.toFixed(2)}`}
                      trackId={track.id}
                      isLocked={track.locked}
                      startTime={gap.startTime}
                      duration={gap.duration}
                      zoom={timelineZoom}
                      isSelected={Boolean(
                        selectedGap &&
                        selectedGap.trackId === track.id &&
                        Math.abs(selectedGap.startTime - gap.startTime) < 0.02
                      )}
                      onSelect={() => dispatch({
                        type: 'SELECT_GAP',
                        gap: { trackId: track.id, startTime: gap.startTime, duration: gap.duration },
                      })}
                      onContextMenu={(e) => {
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          type: 'gap',
                          gap: { trackId: track.id, startTime: gap.startTime, duration: gap.duration },
                        });
                      }}
                    />
                  ))}

                  {/* クリップ要素の描画 */}
                  {track.clips.map(clip => {
                    const clipSnapTargets = allSnapTargets.filter(
                      t => Math.abs(t - clip.startTime) > 0.001 && Math.abs(t - (clip.startTime + clip.duration)) > 0.001
                    );

                    const isClipSelected = selectedClipIds.includes(clip.id);
                    const clipKfs = keyframes.filter(kf => kf.clipId === clip.id);

                    return (
                      <TimelineClipItem
                        key={clip.id}
                        clip={clip}
                        trackType={track.type}
                        isLocked={track.locked}
                        zoom={timelineZoom}
                        isSelected={isClipSelected}
                        isMultiSelected={isMultiSelected}
                        hasLockedInSelection={hasLockedInSelection}
                        groupMoveDeltaSec={groupMove?.active ? groupMove.deltaSec : null}
                        snapTargets={clipSnapTargets}
                        snapEnabled={snapEnabled}
                        clipKeyframes={clipKfs}
                        selectedKeyframeId={selectedKeyframeId}
                        onSelect={(e) => handleClipSelect(clip.id, track.id, e)}
                        onMove={(newStartTime) => dispatch({ type: 'MOVE_CLIP', clipId: clip.id, newStartTime })}
                        onGroupMoveStart={handleGroupMoveStart}
                        onGroupMoveDelta={handleGroupMoveDelta}
                        onGroupMoveEnd={handleGroupMoveEnd}
                        onTrim={(newStartTime, newDuration) => dispatch({
                          type: 'TRIM_CLIP',
                          clipId: clip.id,
                          newStartTime,
                          newDuration,
                        })}
                        onSnapChange={setSnapGuideTime}
                        onContextMenu={(e) => {
                          if (isMultiSelected) {
                            setContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              type: 'group',
                              clipId: clip.id,
                            });
                          } else {
                            setContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              type: 'clip',
                              clipId: clip.id,
                            });
                          }
                        }}
                        onKeyframeSelect={(kfId) => dispatch({ type: 'SELECT_KEYFRAME', keyframeId: kfId })}
                        onKeyframeSeek={(time) => dispatch({ type: 'SET_CURRENT_TIME', time })}
                        onKeyframeTimeChange={(kfId, newTime) => dispatch({ type: 'UPDATE_KEYFRAME_TIME', keyframeId: kfId, time: newTime })}
                        onKeyframeCommitTime={(kfId, newTime) => dispatch({ type: 'COMMIT_KEYFRAME_TIME', keyframeId: kfId, time: newTime })}
                      />
                    );
                  })}

                  {/* トランジション要素の描画 */}
                  {trackTransitions.map(trans => {
                    const fromClip = track.clips.find(c => c.id === trans.fromClipId);
                    const toClip = track.clips.find(c => c.id === trans.toClipId);
                    const maxDur = fromClip && toClip ? Math.min(fromClip.duration, toClip.duration) * 2 : 10;

                    return (
                      <TimelineTransitionItem
                        key={trans.id}
                        transition={trans}
                        isLocked={track.locked}
                        zoom={timelineZoom}
                        isSelected={selectedTransitionId === trans.id}
                        maxDuration={maxDur}
                        onSelect={() => dispatch({ type: 'SELECT_TRANSITION', id: trans.id })}
                        onResize={(newDur) => dispatch({
                          type: 'UPDATE_TRANSITION',
                          id: trans.id,
                          changes: { duration: newDur },
                        })}
                        onCommitResize={(newDur) => dispatch({
                          type: 'COMMIT_TRANSITION',
                          id: trans.id,
                          changes: { duration: newDur },
                        })}
                        onContextMenu={(e) => {
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            type: 'transition',
                            transitionId: trans.id,
                            trackId: track.id,
                          });
                        }}
                      />
                    );
                  })}

                  {/* トランジション追加用ホットスポット */}
                  {!track.locked && cutBoundaries.map(cut => (
                    <TimelineTransitionHotspot
                      key={`hotspot-${track.id}-${cut.boundaryTime.toFixed(2)}`}
                      boundaryTime={cut.boundaryTime}
                      zoom={timelineZoom}
                      isLocked={track.locked}
                      onAdd={(type) => {
                        dispatch({
                          type: 'ADD_TRANSITION',
                          trackId: track.id,
                          fromClipId: cut.fromClip.id,
                          toClipId: cut.toClip.id,
                          transitionType: type,
                        });
                      }}
                      onContextMenu={(e) => {
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          type: 'boundary',
                          trackId: track.id,
                          fromClipId: cut.fromClip.id,
                          toClipId: cut.toClip.id,
                        });
                      }}
                    />
                  ))}
                </div>
              );
            })}

            {/* スナップガイドライン (吸着位置に垂直表示) */}
            {snapGuideTime !== null && (
              <div
                className="timeline-snap-guide"
                style={{ left: `${snapGuideTime * timelineZoom}px` }}
              >
                <div className="snap-guide-badge">🧲 {formatRulerTime(snapGuideTime)}</div>
              </div>
            )}

            {/* 範囲選択（Marquee）矩形 */}
            {marquee && marquee.isDragging && (
              <div
                className="timeline-marquee"
                style={{
                  left: `${Math.min(marquee.startX, marquee.currentX)}px`,
                  top: `${Math.min(marquee.startY, marquee.currentY)}px`,
                  width: `${Math.abs(marquee.currentX - marquee.startX)}px`,
                  height: `${Math.abs(marquee.currentY - marquee.startY)}px`,
                }}
              />
            )}

            {/* 再生ヘッドライン */}
            <div
              className="timeline-playhead"
              style={{ left: `${playheadLeft}px` }}
            />
          </div>
        </div>
      </div>

      {/* ── 右クリックコンテキストメニュー ── */}
      {contextMenu && (
        <div
          className="timeline-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* トランジションのコンテキストメニュー */}
          {contextMenu.type === 'transition' && contextMenu.transitionId && (
            <>
              {(() => {
                const tr = transitions.find(t => t.id === contextMenu.transitionId);
                if (!tr) return null;
                const nextType: TransitionType = tr.type === 'cross-dissolve' ? 'dip-to-black' : 'cross-dissolve';
                const nextLabel = tr.type === 'cross-dissolve' ? 'Switch to Dip to Black' : 'Switch to Cross Dissolve';

                return (
                  <>
                    <button
                      className="context-menu-item"
                      onClick={() => {
                        dispatch({
                          type: 'COMMIT_TRANSITION',
                          id: tr.id,
                          changes: { type: nextType },
                        });
                        setContextMenu(null);
                      }}
                    >
                      <span>{nextLabel}</span>
                    </button>

                    <button
                      className="context-menu-item"
                      onClick={() => {
                        dispatch({
                          type: 'COMMIT_TRANSITION',
                          id: tr.id,
                          changes: { enabled: !tr.enabled },
                        });
                        setContextMenu(null);
                      }}
                    >
                      <span>{tr.enabled ? 'Bypass Transition' : 'Enable Transition'}</span>
                    </button>

                    <div className="context-menu-divider" />

                    <button
                      className="context-menu-item"
                      onClick={() => {
                        dispatch({ type: 'DELETE_TRANSITION', id: tr.id });
                        setContextMenu(null);
                      }}
                    >
                      <span>Remove Transition</span>
                      <span className="context-menu-shortcut">Del</span>
                    </button>
                  </>
                );
              })()}
            </>
          )}

          {/* クリップ境界（カットポイント）のコンテキストメニュー */}
          {contextMenu.type === 'boundary' && contextMenu.trackId && contextMenu.fromClipId && contextMenu.toClipId && (
            <>
              <button
                className="context-menu-item"
                onClick={() => {
                  dispatch({
                    type: 'ADD_TRANSITION',
                    trackId: contextMenu.trackId!,
                    fromClipId: contextMenu.fromClipId!,
                    toClipId: contextMenu.toClipId!,
                    transitionType: 'cross-dissolve',
                  });
                  setContextMenu(null);
                }}
              >
                <span>Add Cross Dissolve</span>
              </button>

              <button
                className="context-menu-item"
                onClick={() => {
                  dispatch({
                    type: 'ADD_TRANSITION',
                    trackId: contextMenu.trackId!,
                    fromClipId: contextMenu.fromClipId!,
                    toClipId: contextMenu.toClipId!,
                    transitionType: 'dip-to-black',
                  });
                  setContextMenu(null);
                }}
              >
                <span>Add Dip to Black</span>
              </button>
            </>
          )}

          {contextMenu.type === 'group' && (
            <>
              <button
                className="context-menu-item"
                disabled={hasLockedInSelection}
                onClick={() => {
                  handleDelete();
                  setContextMenu(null);
                }}
              >
                <span>Delete {selectedClipIds.length} Clips</span>
                <span className="context-menu-shortcut">Del</span>
              </button>

              <button
                className="context-menu-item"
                disabled={hasLockedInSelection}
                onClick={() => {
                  handleDuplicate();
                  setContextMenu(null);
                }}
              >
                <span>Duplicate {selectedClipIds.length} Clips</span>
                <span className="context-menu-shortcut">⌘D</span>
              </button>

              <div className="context-menu-divider" />

              <button
                className="context-menu-item"
                onClick={() => {
                  dispatch({ type: 'DESELECT_ALL' });
                  setContextMenu(null);
                }}
              >
                <span>Deselect All</span>
                <span className="context-menu-shortcut">Esc</span>
              </button>
            </>
          )}

          {contextMenu.type === 'clip' && (
            <>
              <button
                className="context-menu-item"
                onClick={() => {
                  handleDelete();
                  setContextMenu(null);
                }}
              >
                <span>Delete (Lift)</span>
                <span className="context-menu-shortcut">Del</span>
              </button>

              <button
                className="context-menu-item"
                onClick={() => {
                  handleRippleDelete();
                  setContextMenu(null);
                }}
              >
                <span>Ripple Delete</span>
                <span className="context-menu-shortcut">⇧Del</span>
              </button>

              <div className="context-menu-divider" />

              <button
                className="context-menu-item"
                disabled={!canSplit}
                onClick={() => {
                  handleSplit();
                  setContextMenu(null);
                }}
              >
                <span>Split at Playhead</span>
                <span className="context-menu-shortcut">⌘B</span>
              </button>

              <button
                className="context-menu-item"
                onClick={() => {
                  handleDuplicate();
                  setContextMenu(null);
                }}
              >
                <span>Duplicate Clip</span>
                <span className="context-menu-shortcut">⌘D</span>
              </button>
            </>
          )}

          {contextMenu.type === 'gap' && (
            <button
              className="context-menu-item"
              onClick={() => {
                handleDelete();
                setContextMenu(null);
              }}
            >
              <span>Delete Gap (Close)</span>
              <span className="context-menu-shortcut">Del</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}
