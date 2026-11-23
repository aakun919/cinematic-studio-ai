// Cinematic Studio AI — 共通型定義

export type MediaType = 'video' | 'photo' | 'audio';
export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '21:9';
export type PreviewQuality = 'full' | 'half' | 'quarter';
export type TrackType = 'video' | 'text' | 'audio';
export type SaveStatus = 'saved' | 'unsaved' | 'saving';
export type AIStatus = 'idle' | 'analyzing' | 'suggesting' | 'done';
export type SortBy = 'name' | 'date' | 'duration';
export type TransitionType = 'cross-dissolve' | 'dip-to-black';
export type AnimatableProperty = 'positionX' | 'positionY' | 'scale' | 'rotation' | 'opacity';
export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export type ExportFormat = 'prores' | 'h264' | 'hevc';
export type ExportResolution = '4k' | '1080p' | '720p';
export type ExportFramerate = '24' | '30' | '60';

export interface MediaItem {
  id: string;
  name: string;
  type: MediaType;
  duration: number; // 秒
  thumbnail: string; // CSS gradient 文字列 または DataURL / ObjectURL
  tags: string[];
  addedAt: number; // timestamp
  // 実メディア管理用の拡張メタデータ (Task 09)
  fileSize?: number; // バイト数
  mimeType?: string;
  width?: number; // px
  height?: number; // px
  frameRate?: number; // fps (動画)
  aspectRatio?: string; // 例: "16:9"
  url?: string; // プレビュー用 ObjectURL
  isLocalFile?: boolean; // 実ローカルファイルかどうか
  loadStatus?: 'loading' | 'ready' | 'error';
  errorMessage?: string;
}

export interface Clip {
  id: string;
  mediaId: string;
  trackId: string;
  startTime: number; // タイムライン上の絶対秒数
  duration: number;
  mediaStart: number;
  label: string;
  // Transform
  x: number; // % (-50 ~ 50)
  y: number;
  scale: number; // 倍率 (0.1 ~ 3.0)
  rotation: number; // 度 (-180 ~ 180)
  // Timing
  fadeIn: number; // 秒
  fadeOut: number;
  // Color
  brightness: number; // -100 ~ 100
  contrast: number;
  saturation: number;
  temperature: number;
  // Text (text track のみ)
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
}

export interface Track {
  id: string;
  type: TrackType;
  label: string;
  muted: boolean;
  locked: boolean;
  clips: Clip[];
}

export interface SelectedGap {
  trackId: string;
  startTime: number;
  duration: number;
}

export interface Transition {
  id: string;
  type: TransitionType;
  trackId: string;
  fromClipId: string;
  toClipId: string;
  startTime: number; // タイムライン上の開始秒数 (boundaryTime - duration / 2)
  duration: number;  // 秒 (初期値1.0s, 最小0.2s)
  enabled: boolean;
}

export interface Keyframe {
  id: string;
  clipId: string;
  property: AnimatableProperty;
  time: number; // クリップ開始位置からの相対秒数 (0 <= time <= clip.duration)
  value: number;
  easing: EasingType;
}

export interface AISuggestion {
  id: string;
  type: 'trim' | 'transition' | 'music_sync' | 'color_grade';
  description: string;
  clipId?: string;
  accepted: boolean | null; // null = 未決定
}

export interface HistoryEntry {
  tracks: Track[];
  transitions: Transition[];
  keyframes: Keyframe[];
  selectedClipIds: string[];
  selectedClipId: string | null;
  selectedTransitionId: string | null;
  selectedKeyframeId: string | null;
}

export interface ExportSettings {
  format: ExportFormat;
  resolution: ExportResolution;
  framerate: ExportFramerate;
}

export interface EditorState {
  // Project
  projectName: string;
  saveStatus: SaveStatus;
  // Media library
  mediaItems: MediaItem[];
  activeMediaTab: MediaType;
  mediaSearch: string;
  mediaSortBy: SortBy;
  // Playback
  isPlaying: boolean;
  currentTime: number;
  totalDuration: number;
  aspectRatio: AspectRatio;
  previewQuality: PreviewQuality;
  showSafeAreas: boolean;
  // Timeline
  tracks: Track[];
  transitions: Transition[];
  keyframes: Keyframe[];
  selectedClipId: string | null; // 単一選択・アクティブクリップ
  selectedClipIds: string[]; // 複数選択された全クリップID
  selectedTransitionId: string | null; // 選択されたトランジションID
  selectedKeyframeId: string | null; // 選択されたキーフレームID
  selectedTrackId: string | null;
  selectedGap: SelectedGap | null; // 選択されたギャップ
  timelineZoom: number; // px / 秒
  timelineScrollLeft: number;
  snapEnabled: boolean; // スナップ吸着の有効/無効
  // Undo / Redo
  past: HistoryEntry[];
  future: HistoryEntry[];
  // AI
  aiStatus: AIStatus;
  aiSuggestions: AISuggestion[];
  // Export
  showExportModal: boolean;
  exportSettings: ExportSettings;
}
