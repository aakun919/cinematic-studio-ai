// Cinematic Studio AI — 音声ミックスダウン (Package 4: 実書き出し)
//
// Package 3 の純粋関数 planAudioSegments / fadeGainAt をそのまま再利用し、
// タイムライン全体の音声を OfflineAudioContext で 1 本の AudioBuffer に
// ミックスダウンする。エンベロープの組み立ては AudioEngine.play と
// 同じ規則 (setValueAtTime / linearRampToValueAtTime の列) を
// 純粋関数 fadeEnvelopePoints として切り出し、単体テスト可能にした。

import type { MediaItem, Track } from '../types.ts';
import { planAudioSegments, fadeGainAt, type AudioSegment } from './audioEngine.ts';

// ── フェードエンベロープ (純粋関数) ───────────────────────────

export interface FadePoint {
  /** セグメント開始からの相対秒 */
  time: number;
  gain: number;
  /** 'set' = setValueAtTime / 'ramp' = linearRampToValueAtTime (AudioEngine.play と同じ並び) */
  type: 'set' | 'ramp';
}

/**
 * セグメントのフェード自動化ポイント列を返す。
 * AudioEngine.play のエンベロープ構築と同一規則:
 * 開始ゲインは fadeGainAt(startOffset)、フェードイン完了点へ ramp、
 * フェードアウト開始点で set、クリップ終端で 0 へ ramp。
 */
export function fadeEnvelopePoints(seg: AudioSegment): FadePoint[] {
  const clipLike = { fadeIn: seg.fadeIn, fadeOut: seg.fadeOut, duration: seg.clipDuration };
  const points: FadePoint[] = [
    { time: 0, gain: fadeGainAt(clipLike, seg.startOffset), type: 'set' },
  ];

  if (seg.fadeIn > 0 && seg.startOffset < seg.fadeIn && seg.fadeIn < seg.clipDuration) {
    points.push({
      time: seg.fadeIn - seg.startOffset,
      gain: fadeGainAt(clipLike, seg.fadeIn),
      type: 'ramp',
    });
  }

  if (seg.fadeOut > 0) {
    const fadeOutStartLocal = seg.clipDuration - seg.fadeOut;
    const audibleEnd = seg.startOffset + seg.duration;
    if (audibleEnd > fadeOutStartLocal) {
      const atLocal = Math.max(fadeOutStartLocal, seg.startOffset);
      points.push({
        time: atLocal - seg.startOffset,
        gain: fadeGainAt(clipLike, atLocal),
        type: 'set',
      });
      points.push({ time: seg.clipDuration - seg.startOffset, gain: 0, type: 'ramp' });
    }
  }

  // 時刻順に整え、同時刻は後のものを優先する
  points.sort((a, b) => a.time - b.time);
  return points.filter((p, i) => i === points.length - 1 || points[i + 1].time !== p.time);
}

// ── ミックスダウン計画 (純粋関数) ─────────────────────────────

export interface MixdownEntry {
  segment: AudioSegment;
  /** オフラインタイムライン上の開始秒 (= segment.delay, 先頭からの計画のため) */
  startAt: number;
  envelope: FadePoint[];
}

/** タイムライン先頭 (0 秒) からの計画として planAudioSegments を再利用する */
export function planAudioMixdown(tracks: Track[], mediaItems: MediaItem[]): MixdownEntry[] {
  return planAudioSegments(tracks, mediaItems, 0).map(segment => ({
    segment,
    startAt: segment.delay,
    envelope: fadeEnvelopePoints(segment),
  }));
}

// ── オフラインレンダリング (Web Audio) ────────────────────────

/**
 * 計画済みエントリを OfflineAudioContext でミックスダウンする。
 * resolveBuffer は素材 ID からデコード済みバッファを返す関数
 * (取得できない素材は無音でスキップ — AudioEngine と同じ規則)。
 */
export async function renderAudioMixdown(
  entries: MixdownEntry[],
  resolveBuffer: (mediaId: string) => Promise<AudioBuffer | null>,
  totalDuration: number,
  sampleRate = 48000,
): Promise<AudioBuffer> {
  const length = Math.max(1, Math.ceil(totalDuration * sampleRate));
  const ctx = new OfflineAudioContext(2, length, sampleRate);

  for (const entry of entries) {
    const buffer = await resolveBuffer(entry.segment.mediaId);
    if (!buffer) continue;

    const audible = Math.min(entry.segment.duration, buffer.duration - entry.segment.mediaStart);
    if (audible <= 0) continue;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    const t0 = entry.startAt;

    for (const point of entry.envelope) {
      const at = t0 + point.time;
      if (point.type === 'set') {
        gain.gain.setValueAtTime(point.gain, at);
      } else {
        gain.gain.linearRampToValueAtTime(point.gain, at);
      }
    }

    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(t0, entry.segment.mediaStart, audible + 0.05);
  }

  return ctx.startRendering();
}
