// InspectorPanel — 選択クリップの設定パネル (リアルタイムプレビュー & ロック保護)

import React, { useState, useCallback, useMemo } from 'react';
import { useEditorStore } from '../store.ts';
import type { Clip, Track, Transition, TransitionType, AnimatableProperty, EasingType } from '../types.ts';
import { interpolateProperty } from '../utils/interpolation.ts';

// ── ユーティリティ ────────────────────────────────────────────

function findSelectedClip(tracks: Track[], clipId: string | null): { clip: Clip; track: Track } | null {
  if (!clipId) return null;
  for (const track of tracks) {
    const clip = track.clips.find(c => c.id === clipId);
    if (clip) return { clip, track };
  }
  return null;
}

// ── Number Input ──────────────────────────────────────────────

interface NumberInputProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
}

function NumberInput({
  value,
  min,
  max,
  step = 1,
  unit,
  disabled = false,
  onChange,
  onCommit,
}: NumberInputProps) {
  const clamp = (v: number) => {
    let result = v;
    if (min !== undefined) result = Math.max(min, result);
    if (max !== undefined) result = Math.min(max, result);
    return result;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const v = clamp(parseFloat(e.currentTarget.value) || 0);
      onCommit(v);
      e.currentTarget.blur();
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <input
        className="num-input"
        type="number"
        value={Math.round(value * 100) / 100}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={e => onChange(clamp(parseFloat(e.target.value) || 0))}
        onBlur={e => onCommit(clamp(parseFloat(e.target.value) || 0))}
        onKeyDown={handleKeyDown}
      />
      {unit && <span className="num-input-unit">{unit}</span>}
    </div>
  );
}

// ── Slider Row ────────────────────────────────────────────────

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
  onReset?: () => void;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  disabled = false,
  onChange,
  onCommit,
  onReset,
}: SliderRowProps) {
  return (
    <div className="inspector-row">
      <span
        className="inspector-label"
        onDoubleClick={onReset}
        title={onReset ? 'Double-click to reset' : undefined}
        style={{ cursor: onReset ? 'pointer' : 'default' }}
      >
        {label}
      </span>
      <div className="inspector-row-controls">
        <div className="slider-wrap">
          <input
            className="slider-input"
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            onChange={e => onChange(parseFloat(e.target.value))}
            onMouseUp={e => onCommit(parseFloat((e.target as HTMLInputElement).value))}
            onTouchEnd={e => onCommit(parseFloat((e.target as HTMLInputElement).value))}
          />
          <span className="slider-value">{Math.round(value)}{unit}</span>
        </div>
      </div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="inspector-section">
      <button
        className="inspector-section-header"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="inspector-section-title">{title}</span>
        <span className={`inspector-section-arrow${open ? ' open' : ''}`}>›</span>
      </button>
      {open && (
        <div className="inspector-section-body">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Keyframe Controls ────────────────────────────────────────

interface KeyframeControlProps {
  clip: Clip;
  property: AnimatableProperty;
  currentValue: number;
  disabled?: boolean;
}

function KeyframeControl({ clip, property, currentValue, disabled = false }: KeyframeControlProps) {
  const { state, dispatch } = useEditorStore();
  const { currentTime, keyframes } = state;

  const localTime = Math.round((currentTime - clip.startTime) * 100) / 100;
  const isWithinClip = localTime >= -0.05 && localTime <= clip.duration + 0.05;

  const propKeyframes = useMemo(() => {
    return keyframes
      .filter(kf => kf.clipId === clip.id && kf.property === property)
      .sort((a, b) => a.time - b.time);
  }, [keyframes, clip.id, property]);

  const activeKf = useMemo(() => {
    return propKeyframes.find(kf => Math.abs(kf.time - localTime) <= 0.06);
  }, [propKeyframes, localTime]);

  const prevKf = useMemo(() => {
    return propKeyframes.filter(kf => kf.time < localTime - 0.06).pop();
  }, [propKeyframes, localTime]);

  const nextKf = useMemo(() => {
    return propKeyframes.find(kf => kf.time > localTime + 0.06);
  }, [propKeyframes, localTime]);

  const handleToggle = () => {
    if (disabled || !isWithinClip) return;
    if (activeKf) {
      dispatch({ type: 'DELETE_KEYFRAME', keyframeId: activeKf.id });
    } else {
      const targetTime = Math.max(0, Math.min(clip.duration, localTime));
      dispatch({
        type: 'ADD_OR_UPDATE_KEYFRAME',
        clipId: clip.id,
        property,
        time: targetTime,
        value: currentValue,
        easing: 'ease-in-out',
      });
    }
  };

  const handleSeekPrev = () => {
    if (prevKf) {
      dispatch({ type: 'SET_CURRENT_TIME', time: clip.startTime + prevKf.time });
    }
  };

  const handleSeekNext = () => {
    if (nextKf) {
      dispatch({ type: 'SET_CURRENT_TIME', time: clip.startTime + nextKf.time });
    }
  };

  const handleEasingChange = (easing: EasingType) => {
    if (activeKf) {
      dispatch({ type: 'SET_KEYFRAME_EASING', keyframeId: activeKf.id, easing });
    }
  };

  return (
    <div className="kf-ctrl-group">
      <button
        type="button"
        className="kf-nav-btn"
        disabled={disabled || !prevKf}
        onClick={handleSeekPrev}
        title={prevKf ? `Jump to previous keyframe (${prevKf.time.toFixed(2)}s)` : 'No previous keyframe'}
      >
        ◀
      </button>

      <button
        type="button"
        className={`kf-toggle-btn${activeKf ? ' active' : ''}${propKeyframes.length > 0 ? ' has-keyframes' : ''}`}
        disabled={disabled || !isWithinClip}
        onClick={handleToggle}
        title={
          activeKf
            ? `Keyframe at ${activeKf.time.toFixed(2)}s (Click to remove)`
            : isWithinClip
            ? `Add keyframe at playhead (${localTime.toFixed(2)}s)`
            : 'Playhead is outside clip bounds'
        }
      >
        ◆
      </button>

      <button
        type="button"
        className="kf-nav-btn"
        disabled={disabled || !nextKf}
        onClick={handleSeekNext}
        title={nextKf ? `Jump to next keyframe (${nextKf.time.toFixed(2)}s)` : 'No next keyframe'}
      >
        ▶
      </button>

      {activeKf && (
        <select
          className="kf-easing-select"
          disabled={disabled}
          value={activeKf.easing}
          onChange={e => handleEasingChange(e.target.value as EasingType)}
          title="Keyframe Interpolation Easing"
        >
          <option value="linear">Linear</option>
          <option value="ease-in">Ease In</option>
          <option value="ease-out">Ease Out</option>
          <option value="ease-in-out">Ease In-Out</option>
        </select>
      )}
    </div>
  );
}

// ── Transform Section ─────────────────────────────────────────

function TransformSection({ clip, disabled }: { clip: Clip; disabled: boolean }) {
  const { state, dispatch } = useEditorStore();
  const { currentTime, keyframes } = state;

  const localTime = Math.round((currentTime - clip.startTime) * 100) / 100;
  const currentX = interpolateProperty(clip, 'positionX', localTime, keyframes);
  const currentY = interpolateProperty(clip, 'positionY', localTime, keyframes);
  const currentScale = interpolateProperty(clip, 'scale', localTime, keyframes);
  const currentRot = interpolateProperty(clip, 'rotation', localTime, keyframes);
  const currentOpacity = interpolateProperty(clip, 'opacity', localTime, keyframes);

  const isWithinClip = localTime >= -0.05 && localTime <= clip.duration + 0.05;

  const handlePropChange = (property: AnimatableProperty, value: number, isCommit: boolean) => {
    const hasKf = keyframes.some(kf => kf.clipId === clip.id && kf.property === property);
    if (hasKf && isWithinClip) {
      if (isCommit) {
        dispatch({
          type: 'ADD_OR_UPDATE_KEYFRAME',
          clipId: clip.id,
          property,
          time: Math.max(0, Math.min(clip.duration, localTime)),
          value,
        });
      }
    } else {
      // クリップ基本値の変更
      const keyMap: Record<AnimatableProperty, Partial<Clip>> = {
        positionX: { x: value },
        positionY: { y: value },
        scale: { scale: value },
        rotation: { rotation: value },
        opacity: {}, // opacityはデフォルト1.0、キーフレームまたは将来のプロパティ
      };
      const changes = keyMap[property];
      if (isCommit) {
        dispatch({ type: 'COMMIT_CLIP_CHANGE', clipId: clip.id, changes });
      } else {
        dispatch({ type: 'UPDATE_CLIP_PREVIEW', clipId: clip.id, changes });
      }
    }
  };

  return (
    <Section title="Transform & Animation">
      {/* Position X */}
      <div className="inspector-row">
        <span className="inspector-label">Position X</span>
        <div className="inspector-row-controls">
          <NumberInput
            value={currentX} min={-100} max={100} unit="%" disabled={disabled}
            onChange={v => handlePropChange('positionX', v, false)}
            onCommit={v => handlePropChange('positionX', v, true)}
          />
          <KeyframeControl
            clip={clip}
            property="positionX"
            currentValue={currentX}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Position Y */}
      <div className="inspector-row">
        <span className="inspector-label">Position Y</span>
        <div className="inspector-row-controls">
          <NumberInput
            value={currentY} min={-100} max={100} unit="%" disabled={disabled}
            onChange={v => handlePropChange('positionY', v, false)}
            onCommit={v => handlePropChange('positionY', v, true)}
          />
          <KeyframeControl
            clip={clip}
            property="positionY"
            currentValue={currentY}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Scale */}
      <div className="inspector-row">
        <span
          className="inspector-label"
          onDoubleClick={() => !disabled && handlePropChange('scale', 1, true)}
          title="Double-click to reset (100%)"
          style={{ cursor: disabled ? 'default' : 'pointer' }}
        >
          Scale
        </span>
        <div className="inspector-row-controls">
          <div className="slider-wrap">
            <input
              className="slider-input"
              type="range" min={10} max={300} step={1}
              value={Math.round(currentScale * 100)}
              disabled={disabled}
              onChange={e => handlePropChange('scale', parseFloat(e.target.value) / 100, false)}
              onMouseUp={e => handlePropChange('scale', parseFloat((e.target as HTMLInputElement).value) / 100, true)}
              onTouchEnd={e => handlePropChange('scale', parseFloat((e.target as HTMLInputElement).value) / 100, true)}
            />
            <span className="slider-value">{Math.round(currentScale * 100)}%</span>
          </div>
          <KeyframeControl
            clip={clip}
            property="scale"
            currentValue={currentScale}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Rotation */}
      <div className="inspector-row">
        <span
          className="inspector-label"
          onDoubleClick={() => !disabled && handlePropChange('rotation', 0, true)}
          title="Double-click to reset (0°)"
          style={{ cursor: disabled ? 'default' : 'pointer' }}
        >
          Rotation
        </span>
        <div className="inspector-row-controls">
          <div className="slider-wrap">
            <input
              className="slider-input"
              type="range" min={-180} max={180} step={1}
              value={Math.round(currentRot)}
              disabled={disabled}
              onChange={e => handlePropChange('rotation', parseFloat(e.target.value), false)}
              onMouseUp={e => handlePropChange('rotation', parseFloat((e.target as HTMLInputElement).value), true)}
              onTouchEnd={e => handlePropChange('rotation', parseFloat((e.target as HTMLInputElement).value), true)}
            />
            <span className="slider-value">{Math.round(currentRot)}°</span>
          </div>
          <KeyframeControl
            clip={clip}
            property="rotation"
            currentValue={currentRot}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Opacity */}
      <div className="inspector-row">
        <span
          className="inspector-label"
          onDoubleClick={() => !disabled && handlePropChange('opacity', 1.0, true)}
          title="Double-click to reset (100%)"
          style={{ cursor: disabled ? 'default' : 'pointer' }}
        >
          Opacity
        </span>
        <div className="inspector-row-controls">
          <div className="slider-wrap">
            <input
              className="slider-input"
              type="range" min={0} max={100} step={1}
              value={Math.round(currentOpacity * 100)}
              disabled={disabled}
              onChange={e => handlePropChange('opacity', parseFloat(e.target.value) / 100, false)}
              onMouseUp={e => handlePropChange('opacity', parseFloat((e.target as HTMLInputElement).value) / 100, true)}
              onTouchEnd={e => handlePropChange('opacity', parseFloat((e.target as HTMLInputElement).value) / 100, true)}
            />
            <span className="slider-value">{Math.round(currentOpacity * 100)}%</span>
          </div>
          <KeyframeControl
            clip={clip}
            property="opacity"
            currentValue={currentOpacity}
            disabled={disabled}
          />
        </div>
      </div>
    </Section>
  );
}

// ── Timing Section ────────────────────────────────────────────

function TimingSection({ clip, disabled }: { clip: Clip; disabled: boolean }) {
  const { dispatch } = useEditorStore();

  const preview = useCallback((changes: Partial<Clip>) => {
    dispatch({ type: 'UPDATE_CLIP_PREVIEW', clipId: clip.id, changes });
  }, [clip.id, dispatch]);

  const commit = useCallback((changes: Partial<Clip>) => {
    dispatch({ type: 'COMMIT_CLIP_CHANGE', clipId: clip.id, changes });
  }, [clip.id, dispatch]);

  return (
    <Section title="Timing">
      <div className="inspector-row">
        <span className="inspector-label">Duration</span>
        <div className="inspector-row-controls">
          <NumberInput
            value={clip.duration} min={0.5} max={300} step={0.5} unit="s" disabled={disabled}
            onChange={v => preview({ duration: v })}
            onCommit={v => commit({ duration: v })}
          />
        </div>
      </div>
      <SliderRow
        label="Fade In"
        value={clip.fadeIn} min={0} max={5} step={0.1} unit="s" disabled={disabled}
        onChange={v => preview({ fadeIn: v })}
        onCommit={v => commit({ fadeIn: v })}
      />
      <SliderRow
        label="Fade Out"
        value={clip.fadeOut} min={0} max={5} step={0.1} unit="s" disabled={disabled}
        onChange={v => preview({ fadeOut: v })}
        onCommit={v => commit({ fadeOut: v })}
      />
    </Section>
  );
}

// ── Color Section ─────────────────────────────────────────────

function ColorSection({ clip, disabled }: { clip: Clip; disabled: boolean }) {
  const { dispatch } = useEditorStore();

  const preview = useCallback((changes: Partial<Clip>) => {
    dispatch({ type: 'UPDATE_CLIP_PREVIEW', clipId: clip.id, changes });
  }, [clip.id, dispatch]);

  const commit = useCallback((changes: Partial<Clip>) => {
    dispatch({ type: 'COMMIT_CLIP_CHANGE', clipId: clip.id, changes });
  }, [clip.id, dispatch]);

  return (
    <Section title="Color Correction">
      <SliderRow
        label="Brightness"
        value={clip.brightness} min={-100} max={100} disabled={disabled}
        onChange={v => preview({ brightness: v })}
        onCommit={v => commit({ brightness: v })}
        onReset={() => !disabled && commit({ brightness: 0 })}
      />
      <SliderRow
        label="Contrast"
        value={clip.contrast} min={-100} max={100} disabled={disabled}
        onChange={v => preview({ contrast: v })}
        onCommit={v => commit({ contrast: v })}
        onReset={() => !disabled && commit({ contrast: 0 })}
      />
      <SliderRow
        label="Saturation"
        value={clip.saturation} min={-100} max={100} disabled={disabled}
        onChange={v => preview({ saturation: v })}
        onCommit={v => commit({ saturation: v })}
        onReset={() => !disabled && commit({ saturation: 0 })}
      />
      <SliderRow
        label="Temperature"
        value={clip.temperature} min={-100} max={100} disabled={disabled}
        onChange={v => preview({ temperature: v })}
        onCommit={v => commit({ temperature: v })}
        onReset={() => !disabled && commit({ temperature: 0 })}
      />
    </Section>
  );
}

// ── Text Section ──────────────────────────────────────────────

function TextSection({ clip, disabled }: { clip: Clip; disabled: boolean }) {
  const { dispatch } = useEditorStore();

  const preview = useCallback((changes: Partial<Clip>) => {
    dispatch({ type: 'UPDATE_CLIP_PREVIEW', clipId: clip.id, changes });
  }, [clip.id, dispatch]);

  const commit = useCallback((changes: Partial<Clip>) => {
    dispatch({ type: 'COMMIT_CLIP_CHANGE', clipId: clip.id, changes });
  }, [clip.id, dispatch]);

  const aligns = ['left', 'center', 'right'] as const;

  return (
    <Section title="Typography">
      <div className="inspector-row" style={{ alignItems: 'flex-start' }}>
        <span className="inspector-label" style={{ paddingTop: 4 }}>Content</span>
        <div className="inspector-row-controls">
          <textarea
            style={{
              flex: 1,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              padding: '6px 8px',
              resize: 'vertical',
              minHeight: '52px',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              opacity: disabled ? 0.5 : 1,
            }}
            disabled={disabled}
            value={clip.text ?? ''}
            onChange={e => {
              preview({ text: e.target.value });
            }}
            onBlur={e => {
              commit({ text: e.target.value });
            }}
            placeholder="Enter title text…"
          />
        </div>
      </div>

      <div className="inspector-row">
        <span className="inspector-label">Font Family</span>
        <div className="inspector-row-controls">
          <select
            className="inspector-select"
            value={clip.fontFamily || 'var(--font-ui)'}
            disabled={disabled}
            onChange={e => commit({ fontFamily: e.target.value })}
          >
            <option value="var(--font-ui)">System Default Sans</option>
            <option value="Georgia, 'Times New Roman', serif">Cinematic Serif</option>
            <option value="'Helvetica Neue', Arial, sans-serif">Modern Swiss Sans</option>
            <option value="var(--font-mono)">Monospace Code</option>
          </select>
        </div>
      </div>

      <SliderRow
        label="Size"
        value={clip.fontSize ?? 36} min={14} max={120} step={1} unit="px" disabled={disabled}
        onChange={v => preview({ fontSize: v })}
        onCommit={v => commit({ fontSize: v })}
        onReset={() => !disabled && commit({ fontSize: 36 })}
      />

      <div className="inspector-row">
        <span className="inspector-label">Align</span>
        <div className="inspector-row-controls">
          <div className="text-align-btns">
            {aligns.map(a => (
              <button
                key={a}
                className={`align-btn${(clip.textAlign ?? 'center') === a ? ' active' : ''}`}
                onClick={() => commit({ textAlign: a })}
                disabled={disabled}
                aria-pressed={(clip.textAlign ?? 'center') === a}
                aria-label={`Align ${a}`}
              >
                {a === 'left' ? '⇤' : a === 'center' ? '≡' : '⇥'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

// ── Transition Inspector Section ─────────────────────────────

interface TransitionInspectorProps {
  transition: Transition;
  track: Track;
  fromClip?: Clip;
  toClip?: Clip;
  disabled?: boolean;
}

function TransitionInspector({
  transition,
  track,
  fromClip,
  toClip,
  disabled = false,
}: TransitionInspectorProps) {
  const { dispatch } = useEditorStore();

  const maxDuration = useMemo(() => {
    if (fromClip && toClip) {
      return Math.round(Math.min(fromClip.duration, toClip.duration) * 2 * 10) / 10;
    }
    return 10;
  }, [fromClip, toClip]);

  const handleTypeChange = (type: TransitionType) => {
    if (disabled) return;
    dispatch({
      type: 'COMMIT_TRANSITION',
      id: transition.id,
      changes: { type },
    });
  };

  const handleToggleEnabled = () => {
    if (disabled) return;
    dispatch({
      type: 'COMMIT_TRANSITION',
      id: transition.id,
      changes: { enabled: !transition.enabled },
    });
  };

  const handleDurationChange = (v: number) => {
    dispatch({
      type: 'UPDATE_TRANSITION',
      id: transition.id,
      changes: { duration: v },
    });
  };

  const handleDurationCommit = (v: number) => {
    dispatch({
      type: 'COMMIT_TRANSITION',
      id: transition.id,
      changes: { duration: v },
    });
  };

  const handleDelete = () => {
    if (disabled) return;
    dispatch({
      type: 'DELETE_TRANSITION',
      id: transition.id,
    });
  };

  const boundary = fromClip ? fromClip.startTime + fromClip.duration : transition.startTime + transition.duration / 2;

  return (
    <div className="inspector-transition-view">
      <div className="inspector-clip-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="inspector-clip-type">VIDEO TRANSITION</div>
          {disabled && (
            <span style={{ fontSize: '10px', color: 'var(--accent-warning)', display: 'flex', alignItems: 'center', gap: 3 }}>
              🔒 Locked
            </span>
          )}
        </div>
        <div className="inspector-clip-name">
          {transition.type === 'cross-dissolve' ? 'Cross Dissolve' : 'Dip to Black'}
        </div>
      </div>

      <Section title="Transition Settings">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 種類切り替え */}
          <div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: 6 }}>
              Transition Type
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button
                className={`tb-btn${transition.type === 'cross-dissolve' ? ' active' : ''}`}
                style={{ height: 28, fontSize: '11px', justifyContent: 'center' }}
                disabled={disabled}
                onClick={() => handleTypeChange('cross-dissolve')}
              >
                Cross Dissolve
              </button>
              <button
                className={`tb-btn${transition.type === 'dip-to-black' ? ' active' : ''}`}
                style={{ height: 28, fontSize: '11px', justifyContent: 'center' }}
                disabled={disabled}
                onClick={() => handleTypeChange('dip-to-black')}
              >
                Dip to Black
              </button>
            </div>
          </div>

          {/* 有効/無効トグル */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
            <span style={{ fontSize: '11.5px', color: 'var(--text-primary)' }}>Status</span>
            <button
              className={`tb-btn${transition.enabled ? ' active' : ''}`}
              style={{
                height: 24,
                padding: '0 10px',
                fontSize: '11px',
                borderRadius: '12px',
                borderColor: transition.enabled ? 'rgba(0,240,255,0.4)' : 'rgba(255,255,255,0.1)',
                background: transition.enabled ? 'rgba(0,240,255,0.15)' : 'transparent',
                color: transition.enabled ? 'var(--accent-cyan)' : 'var(--text-muted)',
              }}
              disabled={disabled}
              onClick={handleToggleEnabled}
            >
              {transition.enabled ? 'Enabled' : 'Bypassed'}
            </button>
          </div>

          {/* 長さスライダー */}
          <SliderRow
            label="Duration"
            value={transition.duration}
            min={0.2}
            max={maxDuration}
            step={0.1}
            unit="s"
            disabled={disabled}
            onChange={handleDurationChange}
            onCommit={handleDurationCommit}
            onReset={() => handleDurationCommit(1.0)}
          />
        </div>
      </Section>

      <Section title="Bound Clips & Placement">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '11px', color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Track:</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{track.label}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Cut Point:</span>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {boundary.toFixed(1)}s
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Span on Timeline:</span>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {transition.startTime.toFixed(1)}s → {(transition.startTime + transition.duration).toFixed(1)}s
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>From Clip:</span>
            <span style={{ color: 'var(--text-primary)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fromClip?.label}>
              {fromClip?.label ?? 'Unknown'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>To Clip:</span>
            <span style={{ color: 'var(--text-primary)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={toClip?.label}>
              {toClip?.label ?? 'Unknown'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Max Duration Limit:</span>
            <span style={{ color: 'var(--text-muted)' }}>
              {maxDuration.toFixed(1)}s
            </span>
          </div>
        </div>
      </Section>

      <Section title="Danger Zone">
        <button
          className="tb-btn"
          style={{
            width: '100%',
            height: 30,
            justifyContent: 'center',
            borderColor: 'rgba(239,68,68,0.4)',
            color: 'var(--accent-danger)',
            background: 'rgba(239,68,68,0.08)',
          }}
          disabled={disabled}
          onClick={handleDelete}
        >
          <span>Delete Transition</span>
        </button>
      </Section>
    </div>
  );
}

// ── Inspector Panel ───────────────────────────────────────────

export function InspectorPanel() {
  const { state } = useEditorStore();
  const { tracks, transitions, selectedClipId, selectedClipIds, selectedTransitionId } = state;

  const isMultiSelect = selectedClipIds.length > 1;

  // 選択中トランジションの検索
  const selectedTransition = useMemo(() => {
    if (!selectedTransitionId) return null;
    const trans = transitions.find(t => t.id === selectedTransitionId);
    if (!trans) return null;
    const track = tracks.find(t => t.id === trans.trackId);
    if (!track) return null;
    const fromClip = track.clips.find(c => c.id === trans.fromClipId);
    const toClip = track.clips.find(c => c.id === trans.toClipId);
    return { transition: trans, track, fromClip, toClip };
  }, [transitions, selectedTransitionId, tracks]);

  // 複数選択時のクリップ群とトラック情報を集約
  const selectedClipsData = React.useMemo(() => {
    if (!isMultiSelect) return null;
    const items: { clip: Clip; track: Track }[] = [];
    for (const t of tracks) {
      for (const c of t.clips) {
        if (selectedClipIds.includes(c.id)) {
          items.push({ clip: c, track: t });
        }
      }
    }
    const totalDuration = items.reduce((acc, cur) => acc + cur.clip.duration, 0);
    const minStart = items.length > 0 ? Math.min(...items.map(i => i.clip.startTime)) : 0;
    const maxEnd = items.length > 0 ? Math.max(...items.map(i => i.clip.startTime + i.clip.duration)) : 0;
    const groupSpan = maxEnd - minStart;
    const uniqueTracks = Array.from(new Set(items.map(i => i.track)));
    const hasLockedTrack = uniqueTracks.some(t => t.locked);

    return {
      items,
      count: items.length,
      totalDuration,
      groupSpan,
      minStart,
      maxEnd,
      uniqueTracks,
      hasLockedTrack,
    };
  }, [isMultiSelect, tracks, selectedClipIds]);

  const found = findSelectedClip(tracks, selectedClipId);

  const trackTypeLabel: Record<string, string> = {
    video: 'VIDEO CLIP',
    text:  'TITLE CLIP',
    audio: 'AUDIO CLIP',
  };

  return (
    <aside className="inspector-panel">
      <div className="panel-header">
        <span className="panel-title">Inspector</span>
      </div>

      <div className="inspector-body">
        {selectedTransition ? (
          <TransitionInspector
            transition={selectedTransition.transition}
            track={selectedTransition.track}
            fromClip={selectedTransition.fromClip}
            toClip={selectedTransition.toClip}
            disabled={selectedTransition.track.locked}
          />
        ) : isMultiSelect && selectedClipsData ? (
          <div className="inspector-group-summary">
            <div className="inspector-clip-header">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="inspector-clip-type">MULTIPLE CLIPS SELECTED</div>
                {selectedClipsData.hasLockedTrack && (
                  <span style={{ fontSize: '10px', color: 'var(--accent-warning)', display: 'flex', alignItems: 'center', gap: 3 }}>
                    🔒 Locked Track Included
                  </span>
                )}
              </div>
              <div className="inspector-clip-name">
                {selectedClipsData.count} Clips Selected
              </div>
            </div>

            <Section title="Selection Overview">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '11px', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Total Duration:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {selectedClipsData.totalDuration.toFixed(1)}s
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Group Span:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {selectedClipsData.groupSpan.toFixed(1)}s ({selectedClipsData.minStart.toFixed(1)}s → {selectedClipsData.maxEnd.toFixed(1)}s)
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Tracks Involved:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {selectedClipsData.uniqueTracks.map(t => t.label).join(', ')}
                  </span>
                </div>
              </div>
            </Section>

            <Section title="Selected Items">
              <div className="inspector-group-list">
                {selectedClipsData.items.map(({ clip, track }) => (
                  <div key={clip.id} className="inspector-group-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span className={`track-type-dot track-type-dot--${track.type}`} />
                      <span className="group-item-name" title={clip.label}>{clip.label}</span>
                    </div>
                    <span className="group-item-time">
                      {clip.startTime.toFixed(1)}s ({clip.duration.toFixed(1)}s)
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Group Actions Guide">
              <div style={{ fontSize: '11px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                <p style={{ margin: '0 0 6px 0' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Drag Clip:</strong> Move entire group together preserving relative timing
                </p>
                <p style={{ margin: '0 0 6px 0' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>⌘D / Ctrl+D:</strong> Duplicate all selected clips
                </p>
                <p style={{ margin: '0 0 6px 0' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Delete / Backspace:</strong> Lift delete all selected clips
                </p>
                <p style={{ margin: 0 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Escape / Empty click:</strong> Deselect all clips
                </p>
              </div>
            </Section>
          </div>
        ) : !found ? (
          <div className="inspector-empty">
            <div className="inspector-empty-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div className="inspector-empty-text">
              Select a clip in the timeline<br />to inspect and grade properties
            </div>
          </div>
        ) : (
          <>
            <div className="inspector-clip-header">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="inspector-clip-type">
                  {trackTypeLabel[found.track.type] ?? found.track.type.toUpperCase()}
                </div>
                {found.track.locked && (
                  <span style={{ fontSize: '10px', color: 'var(--accent-warning)', display: 'flex', alignItems: 'center', gap: 3 }}>
                    🔒 Locked
                  </span>
                )}
              </div>
              <div className="inspector-clip-name">{found.clip.label}</div>
            </div>

            <TransformSection clip={found.clip} disabled={found.track.locked} />
            <TimingSection clip={found.clip} disabled={found.track.locked} />

            {found.track.type !== 'audio' && (
              <ColorSection clip={found.clip} disabled={found.track.locked} />
            )}

            {found.track.type === 'text' && (
              <TextSection clip={found.clip} disabled={found.track.locked} />
            )}
          </>
        )}
      </div>
    </aside>
  );
}
