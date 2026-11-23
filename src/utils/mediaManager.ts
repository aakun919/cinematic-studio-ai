// Cinematic Studio AI — メディア管理層 (Media Manager)
// メディア形式判定、メタデータ抽出、サムネイル生成、リソース管理 (ObjectURL)
// 将来の Tauri 2 / FFmpeg 移行時にこのモジュールを差し替え可能な抽象化

import type { MediaItem, MediaType } from '../types.ts';
import { mediaStorage } from './mediaStorage.ts';

// ── 対応拡張子・MIME定義 ──────────────────────────────────────────

export const SUPPORTED_EXTENSIONS = {
  video: ['mp4', 'mov', 'webm', 'm4v'],
  photo: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  audio: ['mp3', 'wav', 'aac', 'm4a', 'ogg'],
};

export function detectMediaType(filename: string, mimeType?: string): MediaType | null {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (SUPPORTED_EXTENSIONS.video.includes(ext) || (mimeType && mimeType.startsWith('video/'))) {
    return 'video';
  }
  if (SUPPORTED_EXTENSIONS.photo.includes(ext) || (mimeType && mimeType.startsWith('image/'))) {
    return 'photo';
  }
  if (SUPPORTED_EXTENSIONS.audio.includes(ext) || (mimeType && mimeType.startsWith('audio/'))) {
    return 'audio';
  }
  return null;
}

export function isFileSupported(file: File): boolean {
  return detectMediaType(file.name, file.type) !== null;
}

// ── ObjectURL 管理 (メモリリーク防止) ───────────────────────────

const activeUrls = new Map<string, string>();

export function getOrCreateObjectUrl(id: string, blob: Blob): string {
  const existing = activeUrls.get(id);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  activeUrls.set(id, url);
  return url;
}

export function revokeMediaUrl(id: string): void {
  const url = activeUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    activeUrls.delete(id);
  }
}

export function revokeAllMediaUrls(): void {
  activeUrls.forEach(url => URL.revokeObjectURL(url));
  activeUrls.clear();
}

// ── メタデータ抽出 & サムネイル生成 ─────────────────────────────

export interface ExtractedMetadata {
  duration: number;
  width?: number;
  height?: number;
  aspectRatio?: string;
  frameRate?: number;
  thumbnail: string;
}

/**
 * 動画のメタデータ抽出と先頭付近のサムネイルキャプチャ
 */
export async function extractVideoMetadata(blob: Blob): Promise<ExtractedMetadata> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const tempUrl = URL.createObjectURL(blob);
    video.src = tempUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    const cleanUp = () => {
      URL.revokeObjectURL(tempUrl);
      video.removeAttribute('src');
      video.load();
    };

    const timeout = setTimeout(() => {
      cleanUp();
      resolve({
        duration: 10,
        thumbnail: 'linear-gradient(135deg, #1f2937 0%, #111827 50%, #030712 100%)',
      });
    }, 4000);

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? Math.max(0.1, video.duration) : 10;
      const width = video.videoWidth || 1920;
      const height = video.videoHeight || 1080;
      const aspect = `${width}:${height}`;

      // 先頭0.5秒付近にシークしてサムネイル取得 (クリップが短い場合は 0秒)
      const seekTarget = Math.min(0.5, duration / 2);
      video.currentTime = seekTarget;

      video.onseeked = () => {
        clearTimeout(timeout);
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 320;
          let tw = width;
          let th = height;
          if (tw > th && tw > maxDim) {
            th = Math.round((th * maxDim) / tw);
            tw = maxDim;
          } else if (th > maxDim) {
            tw = Math.round((tw * maxDim) / th);
            th = maxDim;
          }
          canvas.width = Math.max(1, tw);
          canvas.height = Math.max(1, th);
          const ctx = canvas.getContext('2d');
          let thumb = '';
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            thumb = canvas.toDataURL('image/jpeg', 0.7);
          }
          cleanUp();
          resolve({
            duration: Math.round(duration * 10) / 10,
            width,
            height,
            aspectRatio: aspect,
            frameRate: 30, // ブラウザ標準では30fpsを基本設定
            thumbnail: thumb || 'linear-gradient(135deg, #1f2937 0%, #111827 50%, #030712 100%)',
          });
        } catch {
          cleanUp();
          resolve({
            duration: Math.round(duration * 10) / 10,
            width,
            height,
            aspectRatio: aspect,
            thumbnail: 'linear-gradient(135deg, #1f2937 0%, #111827 50%, #030712 100%)',
          });
        }
      };

      video.onerror = () => {
        clearTimeout(timeout);
        cleanUp();
        resolve({
          duration: Math.round(duration * 10) / 10,
          width,
          height,
          aspectRatio: aspect,
          thumbnail: 'linear-gradient(135deg, #1f2937 0%, #111827 50%, #030712 100%)',
        });
      };
    };

    video.onerror = () => {
      clearTimeout(timeout);
      cleanUp();
      resolve({
        duration: 10,
        thumbnail: 'linear-gradient(135deg, #1f2937 0%, #111827 50%, #030712 100%)',
      });
    };
  });
}

/**
 * 画像のメタデータ抽出とサムネイル生成
 */
export async function extractImageMetadata(blob: Blob): Promise<ExtractedMetadata> {
  return new Promise((resolve) => {
    const img = new Image();
    const tempUrl = URL.createObjectURL(blob);
    img.src = tempUrl;

    const cleanUp = () => {
      URL.revokeObjectURL(tempUrl);
    };

    const timeout = setTimeout(() => {
      cleanUp();
      resolve({
        duration: 5,
        thumbnail: 'linear-gradient(135deg, #fb923c 0%, #db2777 100%)',
      });
    }, 3000);

    img.onload = () => {
      clearTimeout(timeout);
      const width = img.naturalWidth || 1920;
      const height = img.naturalHeight || 1080;
      try {
        const canvas = document.createElement('canvas');
        const maxDim = 320;
        let tw = width;
        let th = height;
        if (tw > th && tw > maxDim) {
          th = Math.round((th * maxDim) / tw);
          tw = maxDim;
        } else if (th > maxDim) {
          tw = Math.round((tw * maxDim) / th);
          th = maxDim;
        }
        canvas.width = Math.max(1, tw);
        canvas.height = Math.max(1, th);
        const ctx = canvas.getContext('2d');
        let thumb = '';
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          thumb = canvas.toDataURL('image/jpeg', 0.7);
        }
        cleanUp();
        resolve({
          duration: 5, // 画像クリップの標準表示時間: 5秒
          width,
          height,
          aspectRatio: `${width}:${height}`,
          thumbnail: thumb || tempUrl,
        });
      } catch {
        cleanUp();
        resolve({
          duration: 5,
          width,
          height,
          aspectRatio: `${width}:${height}`,
          thumbnail: 'linear-gradient(135deg, #fb923c 0%, #db2777 100%)',
        });
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      cleanUp();
      resolve({
        duration: 5,
        thumbnail: 'linear-gradient(135deg, #fb923c 0%, #db2777 100%)',
      });
    };
  });
}

/**
 * 音声のメタデータ抽出
 */
export async function extractAudioMetadata(blob: Blob): Promise<ExtractedMetadata> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const tempUrl = URL.createObjectURL(blob);
    audio.src = tempUrl;

    const cleanUp = () => {
      URL.revokeObjectURL(tempUrl);
      audio.removeAttribute('src');
    };

    const timeout = setTimeout(() => {
      cleanUp();
      resolve({
        duration: 30,
        thumbnail: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
      });
    }, 3000);

    audio.onloadedmetadata = () => {
      clearTimeout(timeout);
      const duration = Number.isFinite(audio.duration) ? Math.max(0.1, audio.duration) : 30;
      cleanUp();
      resolve({
        duration: Math.round(duration * 10) / 10,
        thumbnail: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
      });
    };

    audio.onerror = () => {
      clearTimeout(timeout);
      cleanUp();
      resolve({
        duration: 30,
        thumbnail: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
      });
    };
  });
}

// ── メディア登録オーケストレーション ─────────────────────────

export interface ProcessFileResult {
  success: boolean;
  item?: MediaItem;
  error?: string;
}

export async function processMediaFile(file: File): Promise<ProcessFileResult> {
  const type = detectMediaType(file.name, file.type);
  if (!type) {
    return {
      success: false,
      error: `Unsupported format: ${file.name} (${file.type || 'unknown type'})`,
    };
  }

  const id = `media-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  try {
    let metadata: ExtractedMetadata = {
      duration: type === 'photo' ? 5 : 10,
      thumbnail: '',
    };

    // ブラウザ環境でのメタデータ抽出
    if (typeof document !== 'undefined') {
      if (type === 'video') {
        metadata = await extractVideoMetadata(file);
      } else if (type === 'photo') {
        metadata = await extractImageMetadata(file);
      } else if (type === 'audio') {
        metadata = await extractAudioMetadata(file);
      }
    }

    // Object URL 作成
    const url = getOrCreateObjectUrl(id, file);

    // IndexedDB に保存
    await mediaStorage.saveBlob(id, file.name, file.type, file);

    const item: MediaItem = {
      id,
      name: file.name,
      type,
      duration: metadata.duration,
      thumbnail: metadata.thumbnail || (
        type === 'video'
          ? 'linear-gradient(135deg, #1f2937 0%, #111827 50%, #030712 100%)'
          : type === 'photo'
          ? 'linear-gradient(135deg, #fb923c 0%, #db2777 100%)'
          : 'linear-gradient(135deg, #065f46 0%, #047857 100%)'
      ),
      tags: ['imported', type],
      addedAt: Date.now(),
      fileSize: file.size,
      mimeType: file.type || `${type}/*`,
      width: metadata.width,
      height: metadata.height,
      frameRate: metadata.frameRate,
      aspectRatio: metadata.aspectRatio,
      url,
      isLocalFile: true,
      loadStatus: 'ready',
    };

    return { success: true, item };
  } catch (err) {
    return {
      success: false,
      error: `Failed to process ${file.name}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
