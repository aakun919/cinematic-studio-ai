// Cinematic Studio AI — 書き出し計画 (解像度・対応可否の純粋関数) (Package 4)
//
// ブラウザの WebCodecs 対応状況 (CodecSupport) を入力に、
// 「どの形式が選べるか」「音声コーデックはどうするか」を決める純粋関数群。
// 実行時プローブ (isConfigSupported) は videoExporter 側に置き、
// ここはモックした対応状況で単体テストできるようにする。
//
// 形式の正直化 (スパイクレポート §5):
// - H.264 / MP4 が主役。HEVC は実行時に対応が確認できた環境でのみ有効。
// - ProRes は WebCodecs では実現できないため常時無効
//   (デスクトップ (Tauri) 版で対応予定と明示する)。
// - 4K はメモリ管理の検証が済むまで無効 (段階導入)。

import type { AspectRatio, ExportFormat, ExportResolution } from '../types.ts';

// ── コーデック対応状況 (プローブ結果) ─────────────────────────

export interface CodecSupport {
  avc: boolean;   // H.264 エンコード可否
  hevc: boolean;  // HEVC エンコード可否
  aac: boolean;   // AAC エンコード可否
  opus: boolean;  // Opus エンコード可否
}

export const NO_SUPPORT: CodecSupport = { avc: false, hevc: false, aac: false, opus: false };

// ── 対応可否の決定 ───────────────────────────────────────────

export interface FormatAvailability {
  format: ExportFormat;
  available: boolean;
  /** 選べない理由 (available のときは null) */
  note: string | null;
}

export interface ExportDecision {
  formats: FormatAvailability[];
  /** AAC 優先、不可なら Opus、どちらも不可なら null */
  audioCodec: 'aac' | 'opus' | null;
  /** 映像エンコード自体が可能か */
  canExport: boolean;
  /** canExport が false のときのユーザー向け理由 */
  blockingReason: string | null;
}

export function decideExportSupport(support: CodecSupport): ExportDecision {
  const formats: FormatAvailability[] = [
    {
      format: 'h264',
      available: support.avc,
      note: support.avc ? null : 'このブラウザでは H.264 エンコードに対応していません',
    },
    {
      format: 'hevc',
      available: support.hevc,
      note: support.hevc ? null : 'このブラウザでは HEVC エンコードに対応していません',
    },
    {
      format: 'prores',
      available: false,
      note: 'ProRes はデスクトップ (Tauri) 版で対応予定です',
    },
  ];

  const audioCodec: ExportDecision['audioCodec'] = support.aac
    ? 'aac'
    : support.opus
      ? 'opus'
      : null;

  const canExport = support.avc || support.hevc;
  return {
    formats,
    audioCodec,
    canExport,
    blockingReason: canExport
      ? null
      : 'このブラウザでは動画エンコード (WebCodecs) に対応していません。最新版の Chrome / Edge、または Safari 26 以降でお試しください。',
  };
}

/** 希望形式が使えない場合は H.264 → HEVC の順にフォールバックする */
export function pickFormat(decision: ExportDecision, requested: ExportFormat): ExportFormat | null {
  const isAvailable = (f: ExportFormat) =>
    decision.formats.find(x => x.format === f)?.available ?? false;
  if (isAvailable(requested)) return requested;
  if (isAvailable('h264')) return 'h264';
  if (isAvailable('hevc')) return 'hevc';
  return null;
}

export function formatNote(decision: ExportDecision, format: ExportFormat): string | null {
  return decision.formats.find(x => x.format === format)?.note ?? null;
}

// ── 解像度 ───────────────────────────────────────────────────

/** 4K は段階導入のため現在は無効 (スパイクレポート §5) */
export function isResolutionEnabled(resolution: ExportResolution): boolean {
  return resolution !== '4k';
}

export function resolutionNote(resolution: ExportResolution): string | null {
  return resolution === '4k'
    ? '4K はメモリ管理の検証が済むまで無効です'
    : null;
}

export function parseAspectRatio(ratio: AspectRatio): { w: number; h: number } {
  const [w, h] = ratio.split(':').map(Number);
  return { w: w || 16, h: h || 9 };
}

function toEven(v: number): number {
  return Math.max(2, Math.round(v / 2) * 2);
}

/**
 * 解像度プリセットとプロジェクトのアスペクト比から出力寸法を求める。
 * プリセット値は「短辺ではなく基準辺」: 横長は高さ、縦長は幅を基準にする。
 * H.264 の要求に合わせ寸法は偶数に丸める。
 */
export function exportDimensions(
  resolution: ExportResolution,
  aspectRatio: AspectRatio,
): { width: number; height: number } {
  const base = resolution === '4k' ? 2160 : resolution === '1080p' ? 1080 : 720;
  const { w, h } = parseAspectRatio(aspectRatio);
  if (w >= h) {
    return { width: toEven((base * w) / h), height: base };
  }
  return { width: base, height: toEven((base * h) / w) };
}
