// Cinematic Studio AI — エンコーダバックエンド (Package 4: 実書き出し)
//
// 書き出しパイプラインとエンコード実装の境界。現在は WebCodecs +
// Mediabunny 実装のみだが、Tauri フェーズでは「合成済みフレーム列を
// ネイティブ FFmpeg サイドカーへ渡す」実装に差し替えられるよう、
// インターフェースをここに固定する (スパイクレポート §5 の二段構え)。
//
// 使い方: init(canvas) → encodeAudio (任意・1回) / encodeFrame (フレーム毎)
//         → finalize() で MP4 の Blob を得る。中断時は cancel()。

import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  CanvasSource,
  AudioBufferSource,
  QUALITY_HIGH,
} from 'mediabunny';

export type VideoCodecKind = 'avc' | 'hevc';
export type AudioCodecKind = 'aac' | 'opus';

export interface EncoderInitOptions {
  width: number;
  height: number;
  frameRate: number;
  videoCodec: VideoCodecKind;
  /** null のとき音声トラックなし */
  audioCodec: AudioCodecKind | null;
}

export interface EncoderBackend {
  init(canvas: HTMLCanvasElement, opts: EncoderInitOptions): Promise<void>;
  /** キャンバスの現在状態を 1 フレームとしてエンコードする */
  encodeFrame(timestamp: number, duration: number): Promise<void>;
  /** ミックスダウン済み音声を丸ごと追加する (最大 1 回) */
  encodeAudio(buffer: AudioBuffer): Promise<void>;
  /** 確定して MP4 の Blob を返す */
  finalize(): Promise<Blob>;
  /** 途中中断 (出力は破棄される) */
  cancel(): Promise<void>;
}

export class MediabunnyEncoder implements EncoderBackend {
  private output: Output | null = null;
  private target: BufferTarget | null = null;
  private videoSource: CanvasSource | null = null;
  private audioSource: AudioBufferSource | null = null;

  async init(canvas: HTMLCanvasElement, opts: EncoderInitOptions): Promise<void> {
    this.target = new BufferTarget();
    this.output = new Output({
      format: new Mp4OutputFormat(),
      target: this.target,
    });
    this.videoSource = new CanvasSource(canvas, {
      codec: opts.videoCodec,
      bitrate: QUALITY_HIGH,
    });
    this.output.addVideoTrack(this.videoSource, { frameRate: opts.frameRate });

    if (opts.audioCodec) {
      this.audioSource = new AudioBufferSource({
        codec: opts.audioCodec,
        bitrate: 128_000,
      });
      this.output.addAudioTrack(this.audioSource);
    }

    await this.output.start();
  }

  async encodeFrame(timestamp: number, duration: number): Promise<void> {
    if (!this.videoSource) throw new Error('EncoderBackend: init() が呼ばれていません');
    // CanvasSource.add はエンコーダのバックプレッシャに応じて待つ
    await this.videoSource.add(timestamp, duration);
  }

  async encodeAudio(buffer: AudioBuffer): Promise<void> {
    if (!this.audioSource) return;
    await this.audioSource.add(buffer);
  }

  async finalize(): Promise<Blob> {
    if (!this.output || !this.target) throw new Error('EncoderBackend: init() が呼ばれていません');
    this.videoSource?.close();
    this.audioSource?.close();
    await this.output.finalize();
    const buffer = this.target.buffer;
    if (!buffer) throw new Error('EncoderBackend: 出力バッファが生成されませんでした');
    return new Blob([buffer], { type: 'video/mp4' });
  }

  async cancel(): Promise<void> {
    try {
      await this.output?.cancel();
    } catch {
      // キャンセル失敗でも呼び出し側は中断を継続する
    }
    this.output = null;
    this.videoSource = null;
    this.audioSource = null;
  }
}
