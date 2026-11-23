// Cinematic Studio AI — プロジェクトファイル形式 (Task 14)
//
// 設計:
// - 編集状態のうち「再現に必要なもの」だけを版管理された ProjectFile として保存する。
//   保存対象: projectName / mediaItems(メタ情報のみ) / tracks / transitions /
//             keyframes / exportSettings
//   保存しない: 再生位置・選択状態・Undo履歴・モーダル表示などの一時的状態、
//             そして MediaItem.url (Object URL はセッション限りで無効なため)。
//             実メディアの Blob 本体は mediaStorage (IndexedDB) が持ち、
//             復元時に mediaItems の id で再結合して Object URL を再生成する。
// - version が一致しないファイルは読み込まない (将来はここで移行処理を分岐する)。
// - このモジュールは純粋関数のみ。IndexedDB への読み書きは projectStorage.ts。

import type {
  EditorState, MediaItem, Track, Transition, Keyframe, ExportSettings,
} from '../types.ts';

export const PROJECT_FILE_KIND = 'cinematic-studio-project';
export const PROJECT_FILE_VERSION = 1;

export interface ProjectFile {
  kind: typeof PROJECT_FILE_KIND;
  version: typeof PROJECT_FILE_VERSION;
  savedAt: number;
  projectName: string;
  mediaItems: MediaItem[];
  tracks: Track[];
  transitions: Transition[];
  keyframes: Keyframe[];
  exportSettings: ExportSettings;
}

/** RESTORE_PROJECT アクションへ渡す、検証済みの状態スライス */
export interface ProjectStateSlice {
  projectName: string;
  mediaItems: MediaItem[];
  tracks: Track[];
  transitions: Transition[];
  keyframes: Keyframe[];
  exportSettings: ExportSettings;
  totalDuration: number;
}

function computeTotalDuration(tracks: Track[]): number {
  let max = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;
      if (end > max) max = end;
    }
  }
  return Math.max(max, 60);
}

/**
 * MediaItem を保存可能な形に整える。
 * url (Object URL) はセッションを跨ぐと無効なので落とす。
 * ローカルファイルは復元後に Blob から URL を再生成するまで 'loading' とする。
 */
export function sanitizeMediaItemForSave(item: MediaItem): MediaItem {
  const { url: _url, ...rest } = item;
  return {
    ...rest,
    loadStatus: item.isLocalFile ? 'loading' : item.loadStatus,
  };
}

/** EditorState から ProjectFile を組み立てる */
export function serializeProject(state: EditorState, now: number = Date.now()): ProjectFile {
  return {
    kind: PROJECT_FILE_KIND,
    version: PROJECT_FILE_VERSION,
    savedAt: now,
    projectName: state.projectName,
    mediaItems: state.mediaItems.map(sanitizeMediaItemForSave),
    tracks: structuredClone(state.tracks),
    transitions: structuredClone(state.transitions),
    keyframes: structuredClone(state.keyframes),
    exportSettings: { ...state.exportSettings },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isValidMediaItem(v: unknown): v is MediaItem {
  return isRecord(v)
    && typeof v.id === 'string'
    && typeof v.name === 'string'
    && (v.type === 'video' || v.type === 'photo' || v.type === 'audio');
}

/**
 * 未知のデータを ProjectFile として検証する。
 * 形式・版・必須配列が揃わない場合は null (読み込まない)。
 * mediaItems は個別に検証し、不正な要素だけを落とす。
 */
export function parseProjectFile(raw: unknown): ProjectFile | null {
  if (!isRecord(raw)) return null;
  if (raw.kind !== PROJECT_FILE_KIND) return null;
  if (raw.version !== PROJECT_FILE_VERSION) return null;
  if (typeof raw.projectName !== 'string') return null;
  if (!Array.isArray(raw.mediaItems)) return null;
  if (!Array.isArray(raw.tracks)) return null;
  if (!Array.isArray(raw.transitions)) return null;
  if (!Array.isArray(raw.keyframes)) return null;
  if (!isRecord(raw.exportSettings)) return null;

  return {
    kind: PROJECT_FILE_KIND,
    version: PROJECT_FILE_VERSION,
    savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0,
    projectName: raw.projectName,
    mediaItems: (raw.mediaItems as unknown[]).filter(isValidMediaItem),
    tracks: raw.tracks as Track[],
    transitions: raw.transitions as Transition[],
    keyframes: raw.keyframes as Keyframe[],
    exportSettings: raw.exportSettings as unknown as ExportSettings,
  };
}

/** ProjectFile を store へ復元できる状態スライスに変換する */
export function projectToStateSlice(file: ProjectFile): ProjectStateSlice {
  return {
    projectName: file.projectName,
    mediaItems: file.mediaItems.map(m => ({ ...m })),
    tracks: structuredClone(file.tracks),
    transitions: structuredClone(file.transitions),
    keyframes: structuredClone(file.keyframes),
    exportSettings: { ...file.exportSettings },
    totalDuration: computeTotalDuration(file.tracks),
  };
}
