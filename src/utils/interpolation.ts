// Cinematic Studio AI — キーフレーム補間ユーティリティ (Interpolation Engine)

import type { Clip, Keyframe, AnimatableProperty, EasingType } from '../types.ts';

// ── プロパティのベース値取得 ──────────────────────────────────

export function getBasePropertyValue(clip: Clip, property: AnimatableProperty): number {
  switch (property) {
    case 'positionX': return clip.x ?? 0;
    case 'positionY': return clip.y ?? 0;
    case 'scale':     return clip.scale ?? 1;
    case 'rotation':  return clip.rotation ?? 0;
    case 'opacity':   return 1.0;
  }
}

// ── イージング関数 ───────────────────────────────────────────

export function applyEasing(t: number, easing: EasingType): number {
  const clampedT = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'linear':
      return clampedT;
    case 'ease-in':
      return clampedT * clampedT;
    case 'ease-out':
      return clampedT * (2 - clampedT);
    case 'ease-in-out':
      return clampedT < 0.5
        ? 2 * clampedT * clampedT
        : -1 + (4 - 2 * clampedT) * clampedT;
    default:
      return clampedT;
  }
}

// ── 単一プロパティのキーフレーム補間計算 ─────────────────────

export function interpolateProperty(
  clip: Clip,
  property: AnimatableProperty,
  localTime: number,
  keyframes: Keyframe[]
): number {
  // 該当クリップ・該当プロパティのキーフレームを取得し、時間順にソート
  const kfs = keyframes
    .filter(k => k.clipId === clip.id && k.property === property)
    .sort((a, b) => a.time - b.time);

  // キーフレームがなければクリップの基本値を返す
  if (kfs.length === 0) {
    return getBasePropertyValue(clip, property);
  }

  // キーフレームが1つだけならその値を維持
  if (kfs.length === 1) {
    return kfs[0].value;
  }

  // 先頭キーフレーム以前
  if (localTime <= kfs[0].time) {
    return kfs[0].value;
  }

  // 末尾キーフレーム以降
  const lastKf = kfs[kfs.length - 1];
  if (localTime >= lastKf.time) {
    return lastKf.value;
  }

  // キーフレーム間の探索
  for (let i = 0; i < kfs.length - 1; i++) {
    const k1 = kfs[i];
    const k2 = kfs[i + 1];

    if (localTime >= k1.time && localTime <= k2.time) {
      const span = k2.time - k1.time;
      if (span <= 0.0001) return k1.value;

      const normT = (localTime - k1.time) / span;
      const easedT = applyEasing(normT, k1.easing);
      const val = k1.value + (k2.value - k1.value) * easedT;
      return Math.round(val * 100) / 100;
    }
  }

  return lastKf.value;
}

// ── クリップの全アニメーション値一括算出 ──────────────────────

export interface InterpolatedClipValues {
  positionX: number;
  positionY: number;
  scale: number;
  rotation: number;
  opacity: number;
  hasKeyframes: boolean;
}

export function getInterpolatedClipValues(
  clip: Clip,
  currentTime: number,
  keyframes: Keyframe[]
): InterpolatedClipValues {
  const localTime = currentTime - clip.startTime;
  const clipKeyframes = keyframes.filter(k => k.clipId === clip.id);
  const hasKeyframes = clipKeyframes.length > 0;

  return {
    positionX: interpolateProperty(clip, 'positionX', localTime, clipKeyframes),
    positionY: interpolateProperty(clip, 'positionY', localTime, clipKeyframes),
    scale:     interpolateProperty(clip, 'scale',     localTime, clipKeyframes),
    rotation:  interpolateProperty(clip, 'rotation',  localTime, clipKeyframes),
    opacity:   interpolateProperty(clip, 'opacity',   localTime, clipKeyframes),
    hasKeyframes,
  };
}
