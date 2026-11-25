// Cinematic Studio AI — 実書き出しオーケストレーション (Package 4)
//
// タイムライン → MP4 の全体の流れ:
//   1. WebCodecs 対応プローブ (isConfigSupported) → exportPlan で可否決定
//   2. 音声: planAudioMixdown を OfflineAudioContext でミックスダウン
//   3. 映像: フレーム毎に computeFrameState (純粋関数) →
//      Mediabunny のデコーダからフレーム精度で素材フレームを引き →
//      Canvas コンポジッタで合成 → EncoderBackend でエンコード
//   4. 進捗は「エンコード済みフレーム数 / 総フレーム数」で通知し、
//      AbortSignal でキャンセルできる。
//
// 素材が見つからないクリップは黒で書き出し、警告として返す
// (黙って欠落させない)。モック素材 (実ファイルなし) もこの扱いになる。
// プレビューの装飾シーン (星空など) は書き出しでは再現しない。

import {
  Input,
  BlobSource,
  ALL_FORMATS,
  VideoSampleSink,
  type VideoSample,
} from 'mediabunny';
import type {
  AspectRatio,
  ExportSettings,
  Keyframe,
  MediaItem,
  Track,
  Transition,
} from '../types.ts';
import { computeFrameState, timelineDuration, type FrameState } from './frameState.ts';
import { renderFrame, type FrameAssets } from './compositor.ts';
import {
  decideExportSupport,
  exportDimensions,
  pickFormat,
  NO_SUPPORT,
  type CodecSupport,
} from './exportPlan.ts';
import { planAudioMixdown, renderAudioMixdown } from './audioMixdown.ts';
import { MediabunnyEncoder, type EncoderBackend } from './encoderBackend.ts';
import { mediaStorage } from './mediaStorage.ts';

export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportError';
  }
}

export interface ExportJobInput {
  tracks: Track[];
  transitions: Transition[];
  keyframes: Keyframe[];
  mediaItems: MediaItem[];
  aspectRatio: AspectRatio;
  settings: ExportSettings;
}

export interface ExportResult {
  blob: Blob;
  width: number;
  height: number;
  frames: number;
  audioCodec: 'aac' | 'opus' | null;
  warnings: string[];
}

export interface ExportOptions {
  onProgress?: (framesDone: number, totalFrames: number) => void;
  signal?: AbortSignal;
  /** テスト差し替え用 (通常は MediabunnyEncoder) */
  createEncoder?: () => EncoderBackend;
}

// ── WebCodecs プローブ ───────────────────────────────────────

function avcCodecString(width: number, height: number, frameRate: number): string {
  if (width > 1920 || height > 1080) return 'avc1.640033'; // High @ 5.1
  if (frameRate > 30) return 'avc1.64002a'; // High @ 4.2
  return 'avc1.640028'; // High @ 4.0
}

export async function probeCodecSupport(
  width: number,
  height: number,
  frameRate: number,
): Promise<CodecSupport> {
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
    return NO_SUPPORT;
  }
  const video = async (codec: string): Promise<boolean> => {
    try {
      const r = await VideoEncoder.isConfigSupported({
        codec, width, height, bitrate: 8_000_000, framerate: frameRate,
      });
      return !!r.supported;
    } catch {
      return false;
    }
  };
  const audio = async (codec: string): Promise<boolean> => {
    try {
      const r = await AudioEncoder.isConfigSupported({
        codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000,
      });
      return !!r.supported;
    } catch {
      return false;
    }
  };
  const [avc, hevc, aac, opus] = await Promise.all([
    video(avcCodecString(width, height, frameRate)),
    video(width > 1920 || height > 1080 ? 'hvc1.1.6.L150.00' : 'hvc1.1.6.L120.00'),
    audio('mp4a.40.2'),
    audio('opus'),
  ]);
  return { avc, hevc, aac, opus };
}

// ── 素材解決 ─────────────────────────────────────────────────

async function resolveMediaBlob(item: MediaItem): Promise<Blob | null> {
  const stored = await mediaStorage.getBlob(item.id);
  if (stored) return stored;
  if (item.url) {
    try {
      const res = await fetch(item.url);
      if (res.ok) return await res.blob();
    } catch {
      // 取得できない素材は null (呼び出し側で警告にする)
    }
  }
  return null;
}

// ── 映像フレーム供給 ─────────────────────────────────────────
//
// 全フレームの FrameState は純粋関数で先に確定できるため、
// クリップごとに「必要な素材時刻の列」を集めてから
// VideoSampleSink.samplesAtTimestamps(配列) に渡し、
// 返ってくるサンプルをフレーム順に 1 つずつ消費する。
// (時刻を逐次 push する方式は、デコーダ側の先読みと噛み合わず
//  デッドロックするため採用しない — スモークテストで確認済み)

interface ClipVisualSource {
  kind: 'video' | 'photo';
  sink?: VideoSampleSink;
  image?: ImageBitmap;
}

// ── メイン ───────────────────────────────────────────────────

export async function exportTimeline(
  input: ExportJobInput,
  options: ExportOptions = {},
): Promise<ExportResult> {
  const { tracks, transitions, keyframes, mediaItems, aspectRatio, settings } = input;
  const { onProgress, signal } = options;
  const warnings: string[] = [];

  const duration = timelineDuration(tracks);
  if (duration <= 0) {
    throw new ExportError('書き出せるクリップがタイムラインにありません。');
  }
  const fps = Number(settings.framerate) || 30;
  const { width, height } = exportDimensions(settings.resolution, aspectRatio);

  // 1. 対応可否
  const support = await probeCodecSupport(width, height, fps);
  const decision = decideExportSupport(support);
  const format = pickFormat(decision, settings.format);
  if (!format || !decision.canExport) {
    throw new ExportError(
      decision.blockingReason ??
        'このブラウザでは選択した形式のエンコードに対応していません。',
    );
  }
  const videoCodec = format === 'hevc' ? 'hevc' : 'avc';

  const mediaById = new Map(mediaItems.map(m => [m.id, m]));
  const blobCache = new Map<string, Promise<Blob | null>>();
  const blobFor = (item: MediaItem): Promise<Blob | null> => {
    let p = blobCache.get(item.id);
    if (!p) {
      p = resolveMediaBlob(item);
      blobCache.set(item.id, p);
    }
    return p;
  };

  // 2. 音声ミックスダウン (映像より先に行い、失敗を早期に知る)
  const mixEntries = planAudioMixdown(tracks, mediaItems);
  let audioBuffer: AudioBuffer | null = null;
  let audioCodec: 'aac' | 'opus' | null = null;
  if (mixEntries.length > 0) {
    if (decision.audioCodec) {
      audioCodec = decision.audioCodec;
      const decodeCtx = new OfflineAudioContext(2, 48000, 48000);
      const decodeCache = new Map<string, Promise<AudioBuffer | null>>();
      const resolveBuffer = (mediaId: string): Promise<AudioBuffer | null> => {
        let p = decodeCache.get(mediaId);
        if (!p) {
          p = (async () => {
            const item = mediaById.get(mediaId);
            if (!item) return null;
            const blob = await blobFor(item);
            if (!blob) return null;
            try {
              return await decodeCtx.decodeAudioData(await blob.arrayBuffer());
            } catch {
              return null;
            }
          })();
          decodeCache.set(mediaId, p);
        }
        return p;
      };
      audioBuffer = await renderAudioMixdown(mixEntries, resolveBuffer, duration);
      if (audioCodec === 'opus') {
        warnings.push(
          'AAC エンコードが利用できないため、音声は Opus で書き出しました。一部のプレイヤーでは再生できない場合があります。',
        );
      }
    } else {
      warnings.push(
        'このブラウザでは音声エンコードに対応していないため、無音で書き出しました。',
      );
    }
  }

  // 3. 映像ソースの準備 (ビデオトラックのクリップのみ)
  const videoTrack = tracks.find(t => t.type === 'video');
  const visualSources = new Map<string, ClipVisualSource | null>();
  if (videoTrack) {
    for (const clip of videoTrack.clips) {
      const item = mediaById.get(clip.mediaId);
      let source: ClipVisualSource | null = null;
      if (item && (item.type === 'video' || item.type === 'photo')) {
        const blob = await blobFor(item);
        if (blob) {
          try {
            if (item.type === 'photo') {
              source = { kind: 'photo', image: await createImageBitmap(blob) };
            } else {
              const inp = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
              const track = await inp.getPrimaryVideoTrack();
              if (track) {
                source = { kind: 'video', sink: new VideoSampleSink(track) };
              }
            }
          } catch {
            source = null;
          }
        }
      }
      visualSources.set(clip.id, source);
      if (!source) {
        warnings.push(
          `クリップ「${clip.label || clip.id}」のメディアが見つからないため、その区間は黒で書き出されました。`,
        );
      }
    }
  }

  // 4. 全フレームの状態を先に確定し、クリップごとの必要素材時刻を集める
  const totalFrames = Math.max(1, Math.round(duration * fps));
  const states: FrameState[] = [];
  const requestsByClip = new Map<string, number[]>();
  for (let i = 0; i < totalFrames; i++) {
    const state = computeFrameState(tracks, transitions, keyframes, i / fps);
    states.push(state);
    for (const layer of [state.primary, state.next]) {
      if (!layer) continue;
      if (visualSources.get(layer.clip.id)?.kind === 'video') {
        const arr = requestsByClip.get(layer.clip.id) ?? [];
        arr.push(layer.mediaTime);
        requestsByClip.set(layer.clip.id, arr);
      }
    }
  }
  const sampleStreams = new Map<string, AsyncGenerator<VideoSample | null, void, unknown>>();
  for (const [clipId, times] of requestsByClip) {
    const sink = visualSources.get(clipId)?.sink;
    if (sink) sampleStreams.set(clipId, sink.samplesAtTimestamps(times));
  }

  // 5. フレームループ (合成 → エンコード)
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new ExportError('Canvas 2D コンテキストを取得できませんでした。');
  }

  const encoder = (options.createEncoder ?? (() => new MediabunnyEncoder()))();
  let framesDone = 0;

  try {
    await encoder.init(canvas, {
      width,
      height,
      frameRate: fps,
      videoCodec,
      audioCodec: audioBuffer ? audioCodec : null,
    });
    if (audioBuffer) {
      await encoder.encodeAudio(audioBuffer);
    }

    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) {
        throw new DOMException('書き出しがキャンセルされました', 'AbortError');
      }
      const state = states[i];

      const assets: FrameAssets = new Map();
      const closables: { close(): void }[] = [];
      for (const layer of [state.primary, state.next]) {
        if (!layer) continue;
        const source = visualSources.get(layer.clip.id);
        if (!source) continue;
        if (source.kind === 'photo' && source.image) {
          assets.set(layer.clip.id, {
            source: source.image,
            width: source.image.width,
            height: source.image.height,
          });
        } else if (source.kind === 'video') {
          const stream = sampleStreams.get(layer.clip.id);
          if (!stream) continue;
          const r = await stream.next();
          const sample = r.done ? null : r.value;
          if (sample) {
            const frame = sample.toVideoFrame();
            assets.set(layer.clip.id, {
              source: frame,
              width: frame.displayWidth,
              height: frame.displayHeight,
            });
            closables.push(frame, sample);
          }
        }
      }

      renderFrame(ctx, state, assets, width, height);
      for (const c of closables) {
        try {
          c.close();
        } catch {
          // クローズ失敗は無視
        }
      }

      await encoder.encodeFrame(i / fps, 1 / fps);
      framesDone++;
      onProgress?.(framesDone, totalFrames);
    }

    const blob = await encoder.finalize();
    return { blob, width, height, frames: framesDone, audioCodec: audioBuffer ? audioCodec : null, warnings };
  } catch (err) {
    await encoder.cancel();
    throw err;
  } finally {
    for (const stream of sampleStreams.values()) {
      try {
        await stream.return(undefined);
      } catch {
        // ストリームの終了失敗は無視
      }
    }
    for (const source of visualSources.values()) {
      source?.image?.close();
    }
  }
}
