// Cinematic Studio AI — フレーム状態の純粋関数 (Package 4: 実書き出し)
//
// 「タイムライン時刻 t において何がどう見えるか」を、DOM に依存しない
// 純粋関数として定義する。計算規則は PreviewPanel の合成意味論
// (CSS filter / transform / opacity の min 合成、クロスディゾルブ、
// ディップ・トゥ・ブラック) をそのままフレーム描画用に翻訳したもの。
//
// プレビューとの意図的な差異 (書き出し側が正):
// - プレビューは再生ヘッドが全クリップの外にあるとき先頭クリップを
//   フォールバック表示するが、書き出しではギャップは黒になる。
// - クロスディゾルブの次クリップは、プレビューでは装飾シーンの
//   オーバーレイだが、書き出しでは実フレームを opacity = 進行度 で描く。
// - ディップ・トゥ・ブラックは黒が最大になる中点 (p = 0.5) で
//   from クリップから to クリップへ切り替える (プレビューは from のまま)。
//
// VideoFrame / Canvas には一切触れないため Node の単体テスト対象になる。

import type { Clip, Keyframe, Track, Transition } from '../types.ts';
import { getInterpolatedClipValues, type InterpolatedClipValues } from './interpolation.ts';
import { fadeGainAt } from './audioEngine.ts';

// ── 色補正フィルター (PreviewPanel の filterStyle と同一式) ─────

export interface ClipColorFilter {
  brightness: number;   // 乗数 (1 = 無補正)
  contrast: number;
  saturate: number;
  hueRotateDeg: number; // 色温度の近似 (temperature * 0.4)
}

export function clipColorFilter(clip: Clip): ClipColorFilter {
  return {
    brightness: 1 + (clip.brightness ?? 0) / 100,
    contrast: 1 + (clip.contrast ?? 0) / 100,
    saturate: 1 + (clip.saturation ?? 0) / 100,
    hueRotateDeg: (clip.temperature ?? 0) * 0.4,
  };
}

export function colorFilterCss(filter: ClipColorFilter): string {
  return `brightness(${filter.brightness}) contrast(${filter.contrast}) saturate(${filter.saturate}) hue-rotate(${filter.hueRotateDeg}deg)`;
}

// ── レイヤー状態 ─────────────────────────────────────────────

export interface LayerState {
  clip: Clip;
  /** キーフレーム補間後の transform / opacity 値 */
  values: InterpolatedClipValues;
  /** フェード・トランジションまで合成した最終不透明度 (0..1) */
  opacity: number;
  filter: ClipColorFilter;
  /** クリップ内ローカル秒 */
  localTime: number;
  /** 素材内秒 (mediaStart + localTime) — フレーム取得用 */
  mediaTime: number;
}

export interface TextLayerState {
  clip: Clip;
  values: InterpolatedClipValues;
  /** プレビュー同様、テキストはキーフレーム opacity のみ (フェードは適用しない) */
  opacity: number;
}

export interface FrameState {
  time: number;
  /** メイン映像レイヤー (ギャップでは null = 黒) */
  primary: LayerState | null;
  /** クロスディゾルブの遷移先レイヤー (それ以外は null) */
  next: LayerState | null;
  /** ディップ・トゥ・ブラックの黒オーバーレイ不透明度 (0..1) */
  dipToBlack: number;
  text: TextLayerState | null;
  transition: Transition | null;
  /** トランジション進行度 (0..1)。トランジション外では null */
  transitionProgress: number | null;
}

// ── 内部ヘルパー ─────────────────────────────────────────────

function clipAt(track: Track | undefined, time: number): Clip | undefined {
  if (!track) return undefined;
  return track.clips.find(c => time >= c.startTime && time <= c.startTime + c.duration);
}

function buildLayer(
  clip: Clip,
  time: number,
  keyframes: Keyframe[],
  opacityScale: number,
): LayerState {
  const localTime = time - clip.startTime;
  const values = getInterpolatedClipValues(clip, time, keyframes);
  // プレビューの videoOpacity と同一: 補間 opacity とフェード係数の min 合成
  const faded = Math.min(values.opacity, fadeGainAt(clip, localTime));
  return {
    clip,
    values,
    opacity: Math.max(0, Math.min(1, faded * opacityScale)),
    filter: clipColorFilter(clip),
    localTime,
    mediaTime: Math.max(0, (clip.mediaStart || 0) + localTime),
  };
}

// ── メイン: 時刻 t のフレーム状態 ─────────────────────────────

export function computeFrameState(
  tracks: Track[],
  transitions: Transition[],
  keyframes: Keyframe[],
  time: number,
): FrameState {
  const videoTrack = tracks.find(t => t.type === 'video');
  const textTrack = tracks.find(t => t.type === 'text');

  const transition = transitions.find(t =>
    t.enabled && time >= t.startTime && time <= t.startTime + t.duration,
  ) ?? null;
  const progress = transition
    ? Math.max(0, Math.min(1, (time - transition.startTime) / transition.duration))
    : null;

  let primary: LayerState | null = null;
  let next: LayerState | null = null;
  let dipToBlack = 0;

  const fromClip = transition && videoTrack
    ? videoTrack.clips.find(c => c.id === transition.fromClipId)
    : undefined;
  const toClip = transition && videoTrack
    ? videoTrack.clips.find(c => c.id === transition.toClipId)
    : undefined;

  if (transition && progress !== null && transition.type === 'cross-dissolve' && fromClip) {
    primary = buildLayer(fromClip, time, keyframes, 1 - progress);
    if (toClip) {
      // 遷移先はプレビュー同様、自身のフェードではなく進行度そのものが不透明度
      const toValues = getInterpolatedClipValues(toClip, time, keyframes);
      const localTime = time - toClip.startTime;
      next = {
        clip: toClip,
        values: toValues,
        opacity: progress,
        filter: clipColorFilter(toClip),
        localTime,
        mediaTime: Math.max(0, (toClip.mediaStart || 0) + localTime),
      };
    }
  } else if (transition && progress !== null && transition.type === 'dip-to-black') {
    dipToBlack = progress <= 0.5 ? progress * 2 : (1 - progress) * 2;
    const main = (progress < 0.5 ? fromClip : toClip) ?? clipAt(videoTrack, time);
    if (main) primary = buildLayer(main, time, keyframes, 1);
  } else {
    const main = clipAt(videoTrack, time);
    if (main) primary = buildLayer(main, time, keyframes, 1);
  }

  let text: TextLayerState | null = null;
  const textClip = clipAt(textTrack, time);
  if (textClip && textClip.text) {
    const values = getInterpolatedClipValues(textClip, time, keyframes);
    text = { clip: textClip, values, opacity: Math.max(0, Math.min(1, values.opacity)) };
  }

  return { time, primary, next, dipToBlack, text, transition, transitionProgress: progress };
}

// ── タイムライン全体の長さ (書き出し対象の実尺) ────────────────

/**
 * 全トラックのクリップ終端の最大値。store の totalDuration と違い
 * 最小 60 秒のような下限は付けない (書き出しは実尺で行う)。
 */
export function timelineDuration(tracks: Track[]): number {
  let max = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      max = Math.max(max, clip.startTime + clip.duration);
    }
  }
  return max;
}
