// Cinematic Studio AI — 音声再生エンジン (Task: 第3パッケージ 音声再生・同期)
//
// 設計:
// - マスタークロックは従来どおりアプリの再生ヘッド (rAF で進む state.currentTime)。
//   動画要素が「ヘッドに追随してシーク同期」するのと同じ方式で、音声もヘッドに合わせる。
// - 再生開始時に AudioContext の時刻へアンカーし、オーディオトラック上の
//   各クリップを AudioBufferSourceNode としてスケジュールする (Web Audio API)。
//   複数トラック・複数クリップは同一タイムラインへ同時にスケジュールされ、
//   コンテキスト側でミックスされる。
// - 一時停止・シーク時は全ソースを止めて現在位置からスケジュールし直す
//   (BufferSource は使い捨てのため、シーク=再スケジュールが基本動作)。
// - フェードイン/アウトは GainNode のエンベロープで再現する。
// - デコード済みバッファが無いクリップ (モック素材など実データが無いもの) は
//   無音でスキップする。動画クリップ自体の音声は対象外 (プレビューの
//   <video> は従来どおり muted。再生素材としての音声はオーディオトラックで扱う)。
//
// planAudioSegments / fadeGainAt は純粋関数で、単体テスト対象。
// AudioEngine クラスは Web Audio の薄いラッパー。

import type { Clip, MediaItem, Track } from '../types.ts';

// ─── 純粋関数: スケジュール計画 ──────────────────────────────

export interface AudioSegment {
  clipId: string;
  trackId: string;
  mediaId: string;
  /** クリップのタイムライン開始秒 (clip.startTime) */
  clipStart: number;
  /** クリップ全体の長さ (clip.duration) */
  clipDuration: number;
  /** 再生開始位置 (fromTime) からこのセグメントが鳴り始めるまでの遅延秒 */
  delay: number;
  /** セグメント先頭がクリップ内の何秒目か (0 = クリップ先頭) */
  startOffset: number;
  /** 素材内の再生開始秒 (clip.mediaStart + startOffset) */
  mediaStart: number;
  /** このセグメントで鳴らす長さ (秒) */
  duration: number;
  fadeIn: number;
  fadeOut: number;
}

/**
 * fromTime 以降に鳴るべき音声セグメントを計算する。
 * 対象は「ミュートでないオーディオトラック」上の「音声メディアを参照するクリップ」のみ。
 */
export function planAudioSegments(
  tracks: Track[],
  mediaItems: MediaItem[],
  fromTime: number,
): AudioSegment[] {
  const mediaById = new Map(mediaItems.map(m => [m.id, m]));
  const segments: AudioSegment[] = [];

  for (const track of tracks) {
    if (track.type !== 'audio' || track.muted) continue;
    for (const clip of track.clips) {
      const media = mediaById.get(clip.mediaId);
      if (!media || media.type !== 'audio') continue;

      const clipEnd = clip.startTime + clip.duration;
      if (clipEnd <= fromTime) continue;

      const startOffset = Math.max(0, fromTime - clip.startTime);
      segments.push({
        clipId: clip.id,
        trackId: track.id,
        mediaId: clip.mediaId,
        clipStart: clip.startTime,
        clipDuration: clip.duration,
        delay: Math.max(0, clip.startTime - fromTime),
        startOffset,
        mediaStart: (clip.mediaStart || 0) + startOffset,
        duration: clipEnd - Math.max(clip.startTime, fromTime),
        fadeIn: clip.fadeIn || 0,
        fadeOut: clip.fadeOut || 0,
      });
    }
  }

  return segments.sort((a, b) => a.delay - b.delay || a.clipStart - b.clipStart);
}

/**
 * クリップ内ローカル時刻におけるフェードゲイン (0..1)。
 * プレビューの映像フェードと同じく、フェードインとフェードアウトの
 * 小さい方を採用する。
 */
export function fadeGainAt(clip: Pick<Clip, 'fadeIn' | 'fadeOut' | 'duration'>, localTime: number): number {
  let gain = 1;
  if (clip.fadeIn > 0 && localTime < clip.fadeIn) {
    gain = Math.min(gain, Math.max(0, localTime / clip.fadeIn));
  }
  const remaining = clip.duration - localTime;
  if (clip.fadeOut > 0 && remaining < clip.fadeOut) {
    gain = Math.min(gain, Math.max(0, remaining / clip.fadeOut));
  }
  return gain;
}

// ─── Web Audio ラッパー ──────────────────────────────────────

interface ActiveSource {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private active: ActiveSource[] = [];
  private anchorCtxTime = 0;
  private anchorTimeline = 0;
  private playing = false;

  /** AudioContext を遅延生成する (ユーザー操作起点で呼ばれる想定) */
  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
      return null;
    }
    this.ctx = new window.AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  /** コンテキストが suspended なら再開を試みる (自動再生ポリシー対策) */
  async resume(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // 再開できなくてもアプリは落とさない (無音のまま継続)
      }
    }
  }

  hasBuffer(mediaId: string): boolean {
    return this.buffers.has(mediaId);
  }

  getBuffer(mediaId: string): AudioBuffer | undefined {
    return this.buffers.get(mediaId);
  }

  /**
   * 素材を fetch してデコードし、バッファをキャッシュする。
   * URL が無い・失敗した場合は null (その素材は無音扱い)。
   */
  load(item: MediaItem): Promise<AudioBuffer | null> {
    if (this.buffers.has(item.id)) return Promise.resolve(this.buffers.get(item.id)!);
    const existing = this.loading.get(item.id);
    if (existing) return existing;

    const promise = (async (): Promise<AudioBuffer | null> => {
      const ctx = this.ensureContext();
      if (!ctx || !item.url) return null;
      try {
        const res = await fetch(item.url);
        const data = await res.arrayBuffer();
        const buffer = await ctx.decodeAudioData(data);
        this.buffers.set(item.id, buffer);
        return buffer;
      } catch (err) {
        console.warn('[AudioEngine] decode failed:', item.name, err);
        return null;
      } finally {
        this.loading.delete(item.id);
      }
    })();
    this.loading.set(item.id, promise);
    return promise;
  }

  /** エンジンのクロックから見た現在のタイムライン時刻 (再生中でない場合は null) */
  expectedTimelineTime(): number | null {
    if (!this.playing || !this.ctx) return null;
    return this.anchorTimeline + (this.ctx.currentTime - this.anchorCtxTime);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /**
   * fromTime を起点にセグメント群をスケジュールする。
   * バッファ未取得のセグメントはスキップする (取得完了後に呼び出し側が再スケジュールする)。
   */
  play(segments: AudioSegment[], fromTime: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    this.stop();

    const anchor = ctx.currentTime + 0.05;
    this.anchorCtxTime = anchor;
    this.anchorTimeline = fromTime;
    this.playing = true;

    for (const seg of segments) {
      const buffer = this.buffers.get(seg.mediaId);
      if (!buffer) continue;

      const audible = Math.min(seg.duration, buffer.duration - seg.mediaStart);
      if (audible <= 0) continue;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      const tStart = anchor + seg.delay;
      const clipLike = { fadeIn: seg.fadeIn, fadeOut: seg.fadeOut, duration: seg.clipDuration };

      // フェードエンベロープ (セグメント先頭のゲイン → フェードイン完了 → フェードアウト)
      gain.gain.setValueAtTime(fadeGainAt(clipLike, seg.startOffset), tStart);
      if (seg.fadeIn > 0 && seg.startOffset < seg.fadeIn && seg.fadeIn < seg.clipDuration) {
        gain.gain.linearRampToValueAtTime(
          fadeGainAt(clipLike, seg.fadeIn),
          tStart + (seg.fadeIn - seg.startOffset),
        );
      }
      if (seg.fadeOut > 0) {
        const fadeOutStartLocal = seg.clipDuration - seg.fadeOut;
        if (seg.startOffset + audible > fadeOutStartLocal) {
          const atLocal = Math.max(fadeOutStartLocal, seg.startOffset);
          gain.gain.setValueAtTime(fadeGainAt(clipLike, atLocal), tStart + (atLocal - seg.startOffset));
          gain.gain.linearRampToValueAtTime(0, tStart + (seg.clipDuration - seg.startOffset));
        }
      }

      source.connect(gain);
      gain.connect(this.master);
      source.start(tStart, seg.mediaStart, audible + 0.05);
      this.active.push({ source, gain });
    }
  }

  /** 全ソースを停止する */
  stop(): void {
    for (const { source, gain } of this.active) {
      try {
        source.stop();
      } catch {
        // 既に停止済みでも問題ない
      }
      try {
        source.disconnect();
        gain.disconnect();
      } catch {
        // 同上
      }
    }
    this.active = [];
    this.playing = false;
  }
}

/** アプリ全体で共有するシングルトン */
export const audioEngine = new AudioEngine();
