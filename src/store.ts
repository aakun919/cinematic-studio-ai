// Cinematic Studio AI — 状態管理 (useReducer + Context + Hook)

import { createContext, useContext, useReducer, useMemo, createElement } from 'react';
import type { Dispatch, ReactNode } from 'react';
import type {
  EditorState, MediaType, SortBy, AspectRatio, PreviewQuality,
  Clip, AISuggestion, HistoryEntry, Track, SaveStatus, ExportSettings, MediaItem, SelectedGap,
  Transition, TransitionType, Keyframe, AnimatableProperty, EasingType,
} from './types.ts';
import { mockMediaItems, mockTracks, mockTransitions, mockKeyframes } from './mockData.ts';
import type { ProjectStateSlice } from './utils/projectFile.ts';

// ─── ヘルパー ────────────────────────────────────────────────

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

function takeSnapshot(state: EditorState): HistoryEntry {
  return {
    tracks: structuredClone(state.tracks),
    transitions: structuredClone(state.transitions),
    keyframes: structuredClone(state.keyframes),
    selectedClipIds: [...state.selectedClipIds],
    selectedClipId: state.selectedClipId,
    selectedTransitionId: state.selectedTransitionId,
    selectedKeyframeId: state.selectedKeyframeId,
  };
}

function pushHistory(state: EditorState): EditorState {
  const snapshot = takeSnapshot(state);
  const past = [...state.past, snapshot].slice(-50);
  return { ...state, past, future: [] };
}

// クリップ移動・削除時のトランジション整合性ヘルパー
function reconcileTransitions(transitions: Transition[], tracks: Track[]): Transition[] {
  const allClips = new Map<string, Clip>();
  for (const track of tracks) {
    for (const clip of track.clips) {
      allClips.set(clip.id, clip);
    }
  }

  const result: Transition[] = [];
  for (const trans of transitions) {
    const fromClip = allClips.get(trans.fromClipId);
    const toClip = allClips.get(trans.toClipId);
    if (!fromClip || !toClip) continue;
    if (fromClip.trackId !== toClip.trackId || fromClip.trackId !== trans.trackId) continue;

    const boundary = fromClip.startTime + fromClip.duration;
    // 境界ギャップが0.2秒以上離れた場合は除外
    if (Math.abs(toClip.startTime - boundary) > 0.2) continue;

    const maxDur = Math.min(fromClip.duration, toClip.duration) * 2;
    const dur = Math.max(0.2, Math.min(maxDur, trans.duration));
    const newStart = Math.round((boundary - dur / 2) * 100) / 100;

    result.push({
      ...trans,
      startTime: Math.max(0, newStart),
      duration: Math.round(dur * 10) / 10,
    });
  }
  return result;
}

// ─── アクション型 ─────────────────────────────────────────────

export type EditorAction =
  | { type: 'SET_ACTIVE_MEDIA_TAB'; tab: MediaType }
  | { type: 'SET_MEDIA_SEARCH'; search: string }
  | { type: 'SET_MEDIA_SORT'; sortBy: SortBy }
  | { type: 'ADD_MOCK_MEDIA'; item: MediaItem }
  | { type: 'ADD_MEDIA_ITEM'; item: MediaItem }
  | { type: 'UPDATE_MEDIA_URL'; id: string; url: string }
  | { type: 'REMOVE_MEDIA_ITEM'; id: string }
  | { type: 'ADD_CLIP_FROM_MEDIA'; mediaId: string; trackId?: string; startTime?: number }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'SET_CURRENT_TIME'; time: number }
  | { type: 'SET_ASPECT_RATIO'; ratio: AspectRatio }
  | { type: 'SET_PREVIEW_QUALITY'; quality: PreviewQuality }
  | { type: 'TOGGLE_SAFE_AREAS' }
  | { type: 'SELECT_CLIP'; clipId: string | null; trackId?: string | null }
  | { type: 'SELECT_CLIPS'; clipIds: string[]; primaryClipId?: string | null }
  | { type: 'TOGGLE_SELECT_CLIP'; clipId: string }
  | { type: 'DESELECT_ALL' }
  | { type: 'SELECT_GAP'; gap: SelectedGap | null }
  | { type: 'DELETE_CLIP'; clipId: string }
  | { type: 'DELETE_CLIPS'; clipIds: string[] }
  | { type: 'RIPPLE_DELETE_CLIP'; clipId: string }
  | { type: 'DELETE_GAP'; trackId: string; startTime: number; duration: number }
  | { type: 'DUPLICATE_CLIP'; clipId: string }
  | { type: 'DUPLICATE_CLIPS'; clipIds: string[] }
  | { type: 'UPDATE_CLIP_PREVIEW'; clipId: string; changes: Partial<Clip> }
  | { type: 'COMMIT_CLIP_CHANGE'; clipId: string; changes: Partial<Clip> }
  | { type: 'MOVE_CLIP'; clipId: string; newStartTime: number }
  | { type: 'MOVE_CLIPS'; clipIds: string[]; deltaSec: number }
  | { type: 'TRIM_CLIP'; clipId: string; newStartTime: number; newDuration: number; newMediaStart?: number }
  | { type: 'SPLIT_CLIP'; clipId: string; splitTime: number }
  | { type: 'ADD_TRANSITION'; trackId: string; fromClipId: string; toClipId: string; transitionType: TransitionType; duration?: number }
  | { type: 'DELETE_TRANSITION'; id: string }
  | { type: 'UPDATE_TRANSITION'; id: string; changes: Partial<Pick<Transition, 'type' | 'duration' | 'enabled'>> }
  | { type: 'COMMIT_TRANSITION'; id: string; changes: Partial<Pick<Transition, 'type' | 'duration' | 'enabled'>> }
  | { type: 'SELECT_TRANSITION'; id: string | null }
  | { type: 'ADD_OR_UPDATE_KEYFRAME'; clipId: string; property: AnimatableProperty; time: number; value: number; easing?: EasingType }
  | { type: 'DELETE_KEYFRAME'; keyframeId: string }
  | { type: 'UPDATE_KEYFRAME_VALUE'; keyframeId: string; value: number }
  | { type: 'COMMIT_KEYFRAME_VALUE'; keyframeId: string; value: number }
  | { type: 'UPDATE_KEYFRAME_TIME'; keyframeId: string; time: number }
  | { type: 'COMMIT_KEYFRAME_TIME'; keyframeId: string; time: number }
  | { type: 'SET_KEYFRAME_EASING'; keyframeId: string; easing: EasingType }
  | { type: 'SELECT_KEYFRAME'; keyframeId: string | null }
  | { type: 'TOGGLE_SNAP' }
  | { type: 'TOGGLE_TRACK_MUTE'; trackId: string }
  | { type: 'TOGGLE_TRACK_LOCK'; trackId: string }
  | { type: 'SET_TIMELINE_ZOOM'; zoom: number }
  | { type: 'SET_TIMELINE_SCROLL'; scrollLeft: number }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'START_AI_EDIT' }
  | { type: 'SET_AI_SUGGESTIONS'; suggestions: AISuggestion[] }
  | { type: 'ACCEPT_AI_SUGGESTION'; id: string }
  | { type: 'REJECT_AI_SUGGESTION'; id: string }
  | { type: 'DISMISS_AI' }
  | { type: 'SHOW_EXPORT_MODAL' }
  | { type: 'HIDE_EXPORT_MODAL' }
  | { type: 'SET_EXPORT_SETTINGS'; settings: Partial<ExportSettings> }
  | { type: 'SET_SAVE_STATUS'; status: SaveStatus }
  | { type: 'RESTORE_PROJECT'; slice: ProjectStateSlice }
  | { type: 'PROJECT_RESTORE_DONE' };

// ─── 初期状態 ─────────────────────────────────────────────────

export const initialState: EditorState = {
  projectName: 'Summer Memories 2024',
  saveStatus: 'saved',
  projectRestored: false,
  mediaItems: mockMediaItems,
  activeMediaTab: 'video',
  mediaSearch: '',
  mediaSortBy: 'date',
  isPlaying: false,
  currentTime: 0,
  totalDuration: computeTotalDuration(mockTracks),
  aspectRatio: '16:9',
  previewQuality: 'full',
  showSafeAreas: false,
  tracks: mockTracks,
  transitions: mockTransitions,
  keyframes: mockKeyframes,
  selectedClipId: null,
  selectedClipIds: [],
  selectedTransitionId: null,
  selectedKeyframeId: null,
  selectedTrackId: null,
  selectedGap: null,
  timelineZoom: 80,
  timelineScrollLeft: 0,
  snapEnabled: true,
  past: [],
  future: [],
  aiStatus: 'idle',
  aiSuggestions: [],
  showExportModal: false,
  exportSettings: {
    format: 'prores',
    resolution: '4k',
    framerate: '24',
  },
};

// ─── Reducer ──────────────────────────────────────────────────

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {

    case 'SET_ACTIVE_MEDIA_TAB':
      return { ...state, activeMediaTab: action.tab };

    case 'SET_MEDIA_SEARCH':
      return { ...state, mediaSearch: action.search };

    case 'SET_MEDIA_SORT':
      return { ...state, mediaSortBy: action.sortBy };

    case 'ADD_MOCK_MEDIA':
      return {
        ...state,
        mediaItems: [action.item, ...state.mediaItems],
        saveStatus: 'unsaved',
      };

    case 'ADD_MEDIA_ITEM': {
      // 重複登録防止 (同じIDまたは同じ名前かつ同じサイズのファイル)
      const exists = state.mediaItems.some(
        m => m.id === action.item.id || (m.name === action.item.name && m.fileSize && m.fileSize === action.item.fileSize)
      );
      if (exists) {
        return state;
      }
      return {
        ...state,
        mediaItems: [action.item, ...state.mediaItems],
        saveStatus: 'unsaved',
      };
    }

    case 'UPDATE_MEDIA_URL': {
      return {
        ...state,
        mediaItems: state.mediaItems.map(m =>
          m.id === action.id ? { ...m, url: action.url } : m
        ),
      };
    }

    case 'REMOVE_MEDIA_ITEM': {
      return {
        ...state,
        mediaItems: state.mediaItems.filter(m => m.id !== action.id),
        saveStatus: 'unsaved',
      };
    }

    case 'ADD_CLIP_FROM_MEDIA': {
      const media = state.mediaItems.find(m => m.id === action.mediaId);
      if (!media) return state;

      // 配置先トラックの決定
      // 指定があればそれを優先、なければメディアのタイプに一致する最初の非ロックトラック
      let targetTrack = action.trackId
        ? state.tracks.find(t => t.id === action.trackId)
        : state.tracks.find(t => (media.type === 'audio' ? t.type === 'audio' : t.type === 'video') && !t.locked);

      if (!targetTrack && state.tracks.length > 0) {
        targetTrack = state.tracks.find(t => !t.locked) || state.tracks[0];
      }
      if (!targetTrack || targetTrack.locked) return state;

      const s = pushHistory(state);

      // 配置開始時刻の決定
      let startTime = action.startTime !== undefined
        ? Math.max(0, Math.round(action.startTime * 10) / 10)
        : Math.round(state.currentTime * 10) / 10;

      // クリップ長さの決定 (画像はデフォルト5秒、動画/音声はduration)
      const duration = media.type === 'photo' ? 5.0 : Math.max(0.3, Math.round(media.duration * 10) / 10);

      const newClipId = `clip-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const newClip: Clip = {
        id: newClipId,
        mediaId: media.id,
        trackId: targetTrack.id,
        startTime,
        duration,
        mediaStart: 0,
        label: media.name,
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        fadeIn: 0.5,
        fadeOut: 0.5,
        brightness: 0,
        contrast: 0,
        saturation: 0,
        temperature: 0,
      };

      const tracks = s.tracks.map(t => {
        if (t.id !== targetTrack.id) return t;
        const newClips = [...t.clips, newClip].sort((a, b) => a.startTime - b.startTime);
        return { ...t, clips: newClips };
      });

      const totalDuration = computeTotalDuration(tracks);
      return {
        ...s,
        tracks,
        totalDuration,
        selectedClipId: newClipId,
        selectedClipIds: [newClipId],
        selectedGap: null,
        selectedTransitionId: null,
        saveStatus: 'unsaved',
      };
    }

    case 'TOGGLE_PLAY':
      return { ...state, isPlaying: !state.isPlaying };

    case 'SET_CURRENT_TIME':
      return {
        ...state,
        currentTime: Math.max(0, Math.min(action.time, state.totalDuration)),
      };

    case 'SET_ASPECT_RATIO':
      return { ...state, aspectRatio: action.ratio };

    case 'SET_PREVIEW_QUALITY':
      return { ...state, previewQuality: action.quality };

    case 'TOGGLE_SAFE_AREAS':
      return { ...state, showSafeAreas: !state.showSafeAreas };

    case 'TOGGLE_SNAP':
      return { ...state, snapEnabled: !state.snapEnabled };

    case 'SELECT_CLIP':
      return {
        ...state,
        selectedClipId: action.clipId,
        selectedClipIds: action.clipId ? [action.clipId] : [],
        selectedTrackId: action.trackId ?? null,
        selectedGap: null, // クリップ選択時はギャップ選択を解除
        selectedTransitionId: null, // トランジション選択を解除
      };

    case 'SELECT_CLIPS': {
      const primary = action.primaryClipId ?? (action.clipIds.length > 0 ? action.clipIds[0] : null);
      return {
        ...state,
        selectedClipIds: action.clipIds,
        selectedClipId: primary,
        selectedGap: null,
        selectedTransitionId: null,
      };
    }

    case 'TOGGLE_SELECT_CLIP': {
      const exists = state.selectedClipIds.includes(action.clipId);
      const newIds = exists
        ? state.selectedClipIds.filter(id => id !== action.clipId)
        : [...state.selectedClipIds, action.clipId];
      const primary = newIds.length > 0 ? (newIds.includes(action.clipId) ? action.clipId : newIds[newIds.length - 1]) : null;
      return {
        ...state,
        selectedClipIds: newIds,
        selectedClipId: primary,
        selectedGap: null,
        selectedTransitionId: null,
      };
    }

    case 'DESELECT_ALL':
      return {
        ...state,
        selectedClipIds: [],
        selectedClipId: null,
        selectedGap: null,
        selectedTransitionId: null,
        selectedKeyframeId: null,
      };

    case 'SELECT_GAP':
      return {
        ...state,
        selectedGap: action.gap,
        selectedClipId: null, // ギャップ選択時はクリップ選択を解除
        selectedClipIds: [],
        selectedTrackId: action.gap ? action.gap.trackId : null,
        selectedTransitionId: null,
        selectedKeyframeId: null,
      };

    case 'SELECT_TRANSITION':
      return {
        ...state,
        selectedTransitionId: action.id,
        selectedClipId: null,
        selectedClipIds: [],
        selectedGap: null,
        selectedKeyframeId: null,
      };

    case 'SELECT_KEYFRAME':
      return {
        ...state,
        selectedKeyframeId: action.keyframeId,
      };

    case 'ADD_OR_UPDATE_KEYFRAME': {
      const targetTrack = state.tracks.find(t => t.clips.some(c => c.id === action.clipId));
      if (!targetTrack || targetTrack.locked) return state;

      const targetClip = targetTrack.clips.find(c => c.id === action.clipId);
      if (!targetClip) return state;

      const clampedTime = Math.max(0, Math.min(targetClip.duration, Math.round(action.time * 100) / 100));
      const s = pushHistory(state);

      // 同一クリップ・同一プロパティ・近接時刻(0.05秒以内)のキーフレームが存在するかチェック
      const existingIdx = s.keyframes.findIndex(
        kf => kf.clipId === action.clipId && kf.property === action.property && Math.abs(kf.time - clampedTime) < 0.05
      );

      let keyframes: Keyframe[];
      let selectedKeyframeId: string;

      if (existingIdx >= 0) {
        const existing = s.keyframes[existingIdx];
        const updated: Keyframe = {
          ...existing,
          value: Math.round(action.value * 100) / 100,
          easing: action.easing ?? existing.easing,
          time: clampedTime,
        };
        keyframes = [...s.keyframes];
        keyframes[existingIdx] = updated;
        selectedKeyframeId = existing.id;
      } else {
        const newId = `kf-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const newKf: Keyframe = {
          id: newId,
          clipId: action.clipId,
          property: action.property,
          time: clampedTime,
          value: Math.round(action.value * 100) / 100,
          easing: action.easing ?? 'linear',
        };
        keyframes = [...s.keyframes, newKf];
        selectedKeyframeId = newId;
      }

      return {
        ...s,
        keyframes,
        selectedKeyframeId,
        saveStatus: 'unsaved',
      };
    }

    case 'DELETE_KEYFRAME': {
      const targetKf = state.keyframes.find(kf => kf.id === action.keyframeId);
      if (!targetKf) return state;
      const targetTrack = state.tracks.find(t => t.clips.some(c => c.id === targetKf.clipId));
      if (targetTrack?.locked) return state;

      const s = pushHistory(state);
      return {
        ...s,
        keyframes: s.keyframes.filter(kf => kf.id !== action.keyframeId),
        selectedKeyframeId: s.selectedKeyframeId === action.keyframeId ? null : s.selectedKeyframeId,
        saveStatus: 'unsaved',
      };
    }

    case 'UPDATE_KEYFRAME_VALUE': {
      return {
        ...state,
        keyframes: state.keyframes.map(kf =>
          kf.id === action.keyframeId ? { ...kf, value: Math.round(action.value * 100) / 100 } : kf
        ),
      };
    }

    case 'COMMIT_KEYFRAME_VALUE': {
      const targetKf = state.keyframes.find(kf => kf.id === action.keyframeId);
      if (!targetKf) return state;
      const targetTrack = state.tracks.find(t => t.clips.some(c => c.id === targetKf.clipId));
      if (targetTrack?.locked) return state;

      const s = pushHistory(state);
      return {
        ...s,
        keyframes: s.keyframes.map(kf =>
          kf.id === action.keyframeId ? { ...kf, value: Math.round(action.value * 100) / 100 } : kf
        ),
        saveStatus: 'unsaved',
      };
    }

    case 'UPDATE_KEYFRAME_TIME': {
      const targetKf = state.keyframes.find(kf => kf.id === action.keyframeId);
      if (!targetKf) return state;
      const targetClip = state.tracks.flatMap(t => t.clips).find(c => c.id === targetKf.clipId);
      const maxTime = targetClip ? targetClip.duration : 60;
      const clampedTime = Math.max(0, Math.min(maxTime, Math.round(action.time * 100) / 100));

      return {
        ...state,
        keyframes: state.keyframes.map(kf =>
          kf.id === action.keyframeId ? { ...kf, time: clampedTime } : kf
        ),
      };
    }

    case 'COMMIT_KEYFRAME_TIME': {
      const targetKf = state.keyframes.find(kf => kf.id === action.keyframeId);
      if (!targetKf) return state;
      const targetTrack = state.tracks.find(t => t.clips.some(c => c.id === targetKf.clipId));
      if (targetTrack?.locked) return state;

      const targetClip = state.tracks.flatMap(t => t.clips).find(c => c.id === targetKf.clipId);
      const maxTime = targetClip ? targetClip.duration : 60;
      const clampedTime = Math.max(0, Math.min(maxTime, Math.round(action.time * 100) / 100));

      const s = pushHistory(state);
      return {
        ...s,
        keyframes: s.keyframes.map(kf =>
          kf.id === action.keyframeId ? { ...kf, time: clampedTime } : kf
        ),
        saveStatus: 'unsaved',
      };
    }

    case 'SET_KEYFRAME_EASING': {
      const targetKf = state.keyframes.find(kf => kf.id === action.keyframeId);
      if (!targetKf) return state;
      const targetTrack = state.tracks.find(t => t.clips.some(c => c.id === targetKf.clipId));
      if (targetTrack?.locked) return state;

      const s = pushHistory(state);
      return {
        ...s,
        keyframes: s.keyframes.map(kf =>
          kf.id === action.keyframeId ? { ...kf, easing: action.easing } : kf
        ),
        saveStatus: 'unsaved',
      };
    }

    case 'ADD_TRANSITION': {
      const targetTrack = state.tracks.find(t => t.id === action.trackId);
      if (!targetTrack || targetTrack.locked) return state;

      // 重複チェック: 同じ境界に既にトランジションが存在するか確認
      const duplicate = state.transitions.some(
        t => t.trackId === action.trackId &&
          ((t.fromClipId === action.fromClipId && t.toClipId === action.toClipId) ||
           (t.fromClipId === action.toClipId && t.toClipId === action.fromClipId))
      );
      if (duplicate) return state;

      const fromClip = targetTrack.clips.find(c => c.id === action.fromClipId);
      const toClip = targetTrack.clips.find(c => c.id === action.toClipId);
      if (!fromClip || !toClip) return state;

      const boundary = fromClip.startTime + fromClip.duration;
      // クリップ利用可能時間に基づく最大長制限
      const maxDuration = Math.min(fromClip.duration, toClip.duration) * 2;
      const initialDuration = Math.max(0.2, Math.min(maxDuration, action.duration ?? 1.0));
      const startTime = Math.max(0, Math.round((boundary - initialDuration / 2) * 100) / 100);

      const s = pushHistory(state);
      const newId = `trans-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const newTransition: Transition = {
        id: newId,
        type: action.transitionType,
        trackId: action.trackId,
        fromClipId: action.fromClipId,
        toClipId: action.toClipId,
        startTime,
        duration: Math.round(initialDuration * 10) / 10,
        enabled: true,
      };

      return {
        ...s,
        transitions: [...s.transitions, newTransition],
        selectedTransitionId: newId,
        selectedClipId: null,
        selectedClipIds: [],
        selectedGap: null,
        saveStatus: 'unsaved',
      };
    }

    case 'DELETE_TRANSITION': {
      const targetTrans = state.transitions.find(t => t.id === action.id);
      if (!targetTrans) return state;
      const targetTrack = state.tracks.find(t => t.id === targetTrans.trackId);
      if (targetTrack?.locked) return state;

      const s = pushHistory(state);
      return {
        ...s,
        transitions: s.transitions.filter(t => t.id !== action.id),
        selectedTransitionId: s.selectedTransitionId === action.id ? null : s.selectedTransitionId,
        saveStatus: 'unsaved',
      };
    }

    case 'UPDATE_TRANSITION': {
      const targetTrans = state.transitions.find(t => t.id === action.id);
      if (!targetTrans) return state;
      const targetTrack = state.tracks.find(t => t.id === targetTrans.trackId);
      if (targetTrack?.locked) return state;

      const fromClip = targetTrack?.clips.find(c => c.id === targetTrans.fromClipId);
      const toClip = targetTrack?.clips.find(c => c.id === targetTrans.toClipId);

      const transitions = state.transitions.map(t => {
        if (t.id !== action.id) return t;
        let newDuration = action.changes.duration !== undefined ? action.changes.duration : t.duration;
        let newStart = t.startTime;

        if (fromClip && toClip && action.changes.duration !== undefined) {
          const maxDur = Math.min(fromClip.duration, toClip.duration) * 2;
          newDuration = Math.max(0.2, Math.min(maxDur, action.changes.duration));
          const boundary = fromClip.startTime + fromClip.duration;
          newStart = Math.max(0, Math.round((boundary - newDuration / 2) * 100) / 100);
        }

        return {
          ...t,
          ...action.changes,
          duration: Math.round(newDuration * 10) / 10,
          startTime: newStart,
        };
      });

      return { ...state, transitions };
    }

    case 'COMMIT_TRANSITION': {
      const targetTrans = state.transitions.find(t => t.id === action.id);
      if (!targetTrans) return state;
      const targetTrack = state.tracks.find(t => t.id === targetTrans.trackId);
      if (targetTrack?.locked) return state;

      const fromClip = targetTrack?.clips.find(c => c.id === targetTrans.fromClipId);
      const toClip = targetTrack?.clips.find(c => c.id === targetTrans.toClipId);

      const s = pushHistory(state);
      const transitions = s.transitions.map(t => {
        if (t.id !== action.id) return t;
        let newDuration = action.changes.duration !== undefined ? action.changes.duration : t.duration;
        let newStart = t.startTime;

        if (fromClip && toClip && action.changes.duration !== undefined) {
          const maxDur = Math.min(fromClip.duration, toClip.duration) * 2;
          newDuration = Math.max(0.2, Math.min(maxDur, action.changes.duration));
          const boundary = fromClip.startTime + fromClip.duration;
          newStart = Math.max(0, Math.round((boundary - newDuration / 2) * 100) / 100);
        }

        return {
          ...t,
          ...action.changes,
          duration: Math.round(newDuration * 10) / 10,
          startTime: newStart,
        };
      });

      return { ...s, transitions, saveStatus: 'unsaved' };
    }

    case 'DELETE_CLIP': {
      // 通常削除 (Lift): 対象クリップを削除し、空白（ギャップ）を残す
      const targetTrack = state.tracks.find(t => t.clips.some(c => c.id === action.clipId));
      if (!targetTrack || targetTrack.locked) return state;

      const s = pushHistory(state);
      const tracks = s.tracks.map(t => {
        if (t.id !== targetTrack.id) return t;
        return {
          ...t,
          clips: t.clips.filter(c => c.id !== action.clipId),
        };
      });

      const transitions = reconcileTransitions(s.transitions, tracks);
      const totalDuration = computeTotalDuration(tracks);
      const keyframes = s.keyframes.filter(kf => kf.clipId !== action.clipId);
      return {
        ...s,
        tracks,
        transitions,
        keyframes,
        totalDuration,
        selectedClipId: null,
        selectedClipIds: [],
        selectedGap: null,
        selectedTransitionId: transitions.some(t => t.id === s.selectedTransitionId) ? s.selectedTransitionId : null,
        selectedKeyframeId: keyframes.some(kf => kf.id === s.selectedKeyframeId) ? s.selectedKeyframeId : null,
        saveStatus: 'unsaved',
      };
    }

    case 'DELETE_CLIPS': {
      // 複数クリップ通常削除 (Group Lift)
      if (action.clipIds.length === 0) return state;
      // 1つでもロック中のトラックに属するクリップがあれば削除中止
      const anyLocked = state.tracks.some(t =>
        t.locked && t.clips.some(c => action.clipIds.includes(c.id))
      );
      if (anyLocked) return state;

      const s = pushHistory(state);
      const idSet = new Set(action.clipIds);
      const tracks = s.tracks.map(t => ({
        ...t,
        clips: t.clips.filter(c => !idSet.has(c.id)),
      }));

      const transitions = reconcileTransitions(s.transitions, tracks);
      const totalDuration = computeTotalDuration(tracks);
      const keyframes = s.keyframes.filter(kf => !idSet.has(kf.clipId));
      return {
        ...s,
        tracks,
        transitions,
        keyframes,
        totalDuration,
        selectedClipId: null,
        selectedClipIds: [],
        selectedGap: null,
        selectedTransitionId: transitions.some(t => t.id === s.selectedTransitionId) ? s.selectedTransitionId : null,
        selectedKeyframeId: keyframes.some(kf => kf.id === s.selectedKeyframeId) ? s.selectedKeyframeId : null,
        saveStatus: 'unsaved',
      };
    }

    case 'RIPPLE_DELETE_CLIP': {
      // リップル削除: 対象クリップを削除し、同じトラック上の後続クリップを削除長分前方に詰める
      const targetTrack = state.tracks.find(t => t.clips.some(c => c.id === action.clipId));
      if (!targetTrack || targetTrack.locked) return state;

      const targetClip = targetTrack.clips.find(c => c.id === action.clipId);
      if (!targetClip) return state;

      const s = pushHistory(state);
      const shiftAmount = targetClip.duration;
      const targetEndTime = targetClip.startTime + targetClip.duration;

      const tracks = s.tracks.map(t => {
        if (t.id !== targetTrack.id) return t;
        const newClips = t.clips
          .filter(c => c.id !== action.clipId)
          .map(c => {
            // 対象より後方にあるクリップのみ前方に移動
            if (c.startTime >= targetEndTime - 0.001) {
              return {
                ...c,
                startTime: Math.max(0, Math.round((c.startTime - shiftAmount) * 10) / 10),
              };
            }
            return c;
          });
        return { ...t, clips: newClips };
      });

      const transitions = reconcileTransitions(s.transitions, tracks);
      const totalDuration = computeTotalDuration(tracks);
      const keyframes = s.keyframes.filter(kf => kf.clipId !== action.clipId);
      return {
        ...s,
        tracks,
        transitions,
        keyframes,
        totalDuration,
        selectedClipId: null,
        selectedClipIds: [],
        selectedGap: null,
        selectedTransitionId: transitions.some(t => t.id === s.selectedTransitionId) ? s.selectedTransitionId : null,
        selectedKeyframeId: keyframes.some(kf => kf.id === s.selectedKeyframeId) ? s.selectedKeyframeId : null,
        saveStatus: 'unsaved',
      };
    }

    case 'DELETE_GAP': {
      // ギャップ削除: 選択された空白を削除し、後続クリップを前方に詰める
      const targetTrack = state.tracks.find(t => t.id === action.trackId);
      if (!targetTrack || targetTrack.locked) return state;

      const s = pushHistory(state);
      const gapEndTime = action.startTime + action.duration;
      const shiftAmount = action.duration;

      const tracks = s.tracks.map(t => {
        if (t.id !== action.trackId) return t;
        const newClips = t.clips.map(c => {
          if (c.startTime >= gapEndTime - 0.001) {
            return {
              ...c,
              startTime: Math.max(0, Math.round((c.startTime - shiftAmount) * 10) / 10),
            };
          }
          return c;
        });
        return { ...t, clips: newClips };
      });

      const transitions = reconcileTransitions(s.transitions, tracks);
      const totalDuration = computeTotalDuration(tracks);
      return {
        ...s,
        tracks,
        transitions,
        totalDuration,
        selectedGap: null,
        selectedTransitionId: transitions.some(t => t.id === s.selectedTransitionId) ? s.selectedTransitionId : null,
        saveStatus: 'unsaved',
      };
    }

    case 'DUPLICATE_CLIP': {
      // クリップ複製: 選択クリップを複製し、その直後に配置
      const targetTrack = state.tracks.find(t => t.clips.some(c => c.id === action.clipId));
      if (!targetTrack || targetTrack.locked) return state;

      const targetClip = targetTrack.clips.find(c => c.id === action.clipId);
      if (!targetClip) return state;

      const s = pushHistory(state);
      const newClipId = `clip-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const duplicatedClip: Clip = {
        ...structuredClone(targetClip),
        id: newClipId,
        label: `${targetClip.label} (Copy)`,
        startTime: targetClip.startTime + targetClip.duration,
      };

      const tracks = s.tracks.map(t => {
        if (t.id !== targetTrack.id) return t;
        const newClips = [...t.clips, duplicatedClip].sort((a, b) => a.startTime - b.startTime);
        return { ...t, clips: newClips };
      });

      const duplicatedKeyframes: Keyframe[] = s.keyframes
        .filter(kf => kf.clipId === action.clipId)
        .map(kf => ({
          ...structuredClone(kf),
          id: `kf-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          clipId: newClipId,
        }));
      const keyframes = [...s.keyframes, ...duplicatedKeyframes];

      const totalDuration = computeTotalDuration(tracks);
      return {
        ...s,
        tracks,
        keyframes,
        totalDuration,
        selectedClipId: newClipId,
        selectedClipIds: [newClipId],
        selectedGap: null,
        saveStatus: 'unsaved',
      };
    }

    case 'DUPLICATE_CLIPS': {
      // 複数クリップ複製 (Group Duplicate)
      if (action.clipIds.length === 0) return state;
      // 1つでもロック中のトラックに属するクリップがあれば複製中止
      const anyLocked = state.tracks.some(t =>
        t.locked && t.clips.some(c => action.clipIds.includes(c.id))
      );
      if (anyLocked) return state;

      // 対象クリップ群を収集
      const targetClips: Clip[] = [];
      for (const t of state.tracks) {
        for (const c of t.clips) {
          if (action.clipIds.includes(c.id)) {
            targetClips.push(c);
          }
        }
      }
      if (targetClips.length === 0) return state;

      const s = pushHistory(state);
      const minStart = Math.min(...targetClips.map(c => c.startTime));
      const maxEnd = Math.max(...targetClips.map(c => c.startTime + c.duration));
      const offset = maxEnd - minStart;

      const newClips: Clip[] = [];
      const newClipsByTrack = new Map<string, Clip[]>();
      const oldToNew = new Map<string, string>();

      targetClips.forEach((orig, idx) => {
        const newId = `clip-${Date.now()}-${Math.floor(Math.random() * 10000)}-${idx}`;
        oldToNew.set(orig.id, newId);
        const copy: Clip = {
          ...structuredClone(orig),
          id: newId,
          label: `${orig.label} (Copy)`,
          startTime: Math.round((orig.startTime + offset) * 100) / 100,
        };
        newClips.push(copy);
        const list = newClipsByTrack.get(copy.trackId) ?? [];
        list.push(copy);
        newClipsByTrack.set(copy.trackId, list);
      });

      const tracks = s.tracks.map(t => {
        const toAdd = newClipsByTrack.get(t.id);
        if (!toAdd || toAdd.length === 0) return t;
        const merged = [...t.clips, ...toAdd].sort((a, b) => a.startTime - b.startTime);
        return { ...t, clips: merged };
      });

      const duplicatedKeyframes: Keyframe[] = s.keyframes
        .filter(kf => oldToNew.has(kf.clipId))
        .map(kf => ({
          ...structuredClone(kf),
          id: `kf-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          clipId: oldToNew.get(kf.clipId)!,
        }));
      const keyframes = [...s.keyframes, ...duplicatedKeyframes];

      const totalDuration = computeTotalDuration(tracks);
      const newIds = newClips.map(c => c.id);
      return {
        ...s,
        tracks,
        keyframes,
        totalDuration,
        selectedClipIds: newIds,
        selectedClipId: newIds[0] ?? null,
        selectedGap: null,
        saveStatus: 'unsaved',
      };
    }

    case 'UPDATE_CLIP_PREVIEW': {
      const tracks = state.tracks.map(track => {
        if (track.locked && track.clips.some(c => c.id === action.clipId)) {
          return track;
        }
        return {
          ...track,
          clips: track.clips.map(clip =>
            clip.id === action.clipId ? { ...clip, ...action.changes } : clip
          ),
        };
      });
      return { ...state, tracks };
    }

    case 'COMMIT_CLIP_CHANGE': {
      const targetTrack = state.tracks.find(t => t.clips.some(c => c.id === action.clipId));
      if (targetTrack?.locked) return state;

      const s = pushHistory(state);
      const tracks = s.tracks.map(track => ({
        ...track,
        clips: track.clips.map(clip =>
          clip.id === action.clipId ? { ...clip, ...action.changes } : clip
        ),
      }));
      return { ...s, tracks, saveStatus: 'unsaved' };
    }

    case 'MOVE_CLIP': {
      const targetTrack = state.tracks.find(t => t.clips.some(c => c.id === action.clipId));
      if (targetTrack?.locked) return state;

      const s = pushHistory(state);
      const tracks = s.tracks.map(track => ({
        ...track,
        clips: track.clips.map(clip =>
          clip.id === action.clipId
            ? { ...clip, startTime: Math.max(0, action.newStartTime) }
            : clip
        ),
      }));
      const transitions = reconcileTransitions(s.transitions, tracks);
      const totalDuration = computeTotalDuration(tracks);
      return { ...s, tracks, transitions, totalDuration, saveStatus: 'unsaved' };
    }

    case 'MOVE_CLIPS': {
      // 複数クリップグループ移動
      if (action.clipIds.length === 0) return state;
      // 1つでもロック中のトラックに属するクリップがあれば移動中止
      const anyLocked = state.tracks.some(t =>
        t.locked && t.clips.some(c => action.clipIds.includes(c.id))
      );
      if (anyLocked) return state;

      // 対象クリップ群を収集
      const targetClips: Clip[] = [];
      for (const t of state.tracks) {
        for (const c of t.clips) {
          if (action.clipIds.includes(c.id)) {
            targetClips.push(c);
          }
        }
      }
      if (targetClips.length === 0) return state;

      // 相対関係を壊さず0秒未満にならないよう clamp
      const minStart = Math.min(...targetClips.map(c => c.startTime));
      const allowedDelta = Math.max(-minStart, action.deltaSec);
      const roundedDelta = Math.round(allowedDelta * 100) / 100;

      const s = pushHistory(state);
      const idSet = new Set(action.clipIds);
      const tracks = s.tracks.map(track => ({
        ...track,
        clips: track.clips.map(clip => {
          if (!idSet.has(clip.id)) return clip;
          return {
            ...clip,
            startTime: Math.max(0, Math.round((clip.startTime + roundedDelta) * 100) / 100),
          };
        }),
      }));
      const transitions = reconcileTransitions(s.transitions, tracks);
      const totalDuration = computeTotalDuration(tracks);
      return { ...s, tracks, transitions, totalDuration, saveStatus: 'unsaved' };
    }

    case 'TRIM_CLIP': {
      const targetTrack = state.tracks.find(t => t.clips.some(c => c.id === action.clipId));
      if (!targetTrack || targetTrack.locked) return state;

      const targetClip = targetTrack.clips.find(c => c.id === action.clipId);
      if (!targetClip) return state;

      const leftDelta = action.newStartTime - targetClip.startTime;
      const newDuration = Math.max(0.3, action.newDuration);
      const newMediaStart = action.newMediaStart !== undefined
        ? Math.max(0, action.newMediaStart)
        : Math.max(0, Math.round(((targetClip.mediaStart || 0) + leftDelta) * 100) / 100);

      const s = pushHistory(state);
      const tracks = s.tracks.map(track => ({
        ...track,
        clips: track.clips.map(clip => {
          if (clip.id !== action.clipId) return clip;
          return {
            ...clip,
            startTime: Math.max(0, action.newStartTime),
            duration: newDuration,
            mediaStart: newMediaStart,
          };
        }),
      }));

      // トリム範囲外になったキーフレームを除外または調整
      const keyframes = s.keyframes.reduce<Keyframe[]>((acc, kf) => {
        if (kf.clipId !== action.clipId) {
          acc.push(kf);
          return acc;
        }
        const adjustedTime = Math.round((kf.time - leftDelta) * 100) / 100;
        if (adjustedTime >= 0 && adjustedTime <= newDuration) {
          acc.push({ ...kf, time: adjustedTime });
        }
        return acc;
      }, []);

      const transitions = reconcileTransitions(s.transitions, tracks);
      const totalDuration = computeTotalDuration(tracks);
      return {
        ...s,
        tracks,
        transitions,
        keyframes,
        totalDuration,
        selectedKeyframeId: keyframes.some(kf => kf.id === s.selectedKeyframeId) ? s.selectedKeyframeId : null,
        saveStatus: 'unsaved',
      };
    }

    case 'SPLIT_CLIP': {
      const targetTrack = state.tracks.find(t => t.clips.some(c => c.id === action.clipId));
      if (!targetTrack || targetTrack.locked) return state;

      const targetClip = targetTrack.clips.find(c => c.id === action.clipId);
      if (!targetClip) return state;

      const splitTime = action.splitTime;
      const minLen = 0.3; // 最小クリップ長 0.3秒に統一
      if (splitTime <= targetClip.startTime + minLen || splitTime >= targetClip.startTime + targetClip.duration - minLen) {
        return state;
      }

      const s = pushHistory(state);

      const durationPart1 = Math.round((splitTime - targetClip.startTime) * 10) / 10;
      const durationPart2 = Math.round((targetClip.duration - durationPart1) * 10) / 10;
      if (durationPart1 < minLen || durationPart2 < minLen) return state;

      const firstPart: Clip = {
        ...targetClip,
        duration: durationPart1,
        fadeOut: Math.min(targetClip.fadeOut, durationPart1 / 2),
      };

      const secondClipId = `clip-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const secondPart: Clip = {
        ...structuredClone(targetClip),
        id: secondClipId,
        label: `${targetClip.label} (Part 2)`,
        startTime: targetClip.startTime + durationPart1,
        duration: durationPart2,
        mediaStart: targetClip.mediaStart + durationPart1,
        fadeIn: Math.min(targetClip.fadeIn, durationPart2 / 2),
      };

      const tracks = s.tracks.map(t => {
        if (t.id !== targetTrack.id) return t;
        const newClips: Clip[] = [];
        for (const c of t.clips) {
          if (c.id === targetClip.id) {
            newClips.push(firstPart, secondPart);
          } else {
            newClips.push(c);
          }
        }
        return { ...t, clips: newClips };
      });

      const transitions = reconcileTransitions(s.transitions, tracks);
      const totalDuration = computeTotalDuration(tracks);
      return {
        ...s,
        tracks,
        transitions,
        totalDuration,
        selectedClipId: secondPart.id,
        selectedClipIds: [secondPart.id],
        selectedGap: null,
        selectedTransitionId: null,
        saveStatus: 'unsaved',
      };
    }

    case 'TOGGLE_TRACK_MUTE': {
      const s = pushHistory(state);
      const tracks = s.tracks.map(track =>
        track.id === action.trackId ? { ...track, muted: !track.muted } : track
      );
      return { ...s, tracks, saveStatus: 'unsaved' };
    }

    case 'TOGGLE_TRACK_LOCK': {
      const s = pushHistory(state);
      const tracks = s.tracks.map(track =>
        track.id === action.trackId ? { ...track, locked: !track.locked } : track
      );
      return { ...s, tracks, saveStatus: 'unsaved' };
    }

    case 'SET_TIMELINE_ZOOM':
      return { ...state, timelineZoom: Math.max(20, Math.min(300, action.zoom)) };

    case 'SET_TIMELINE_SCROLL':
      return { ...state, timelineScrollLeft: Math.max(0, action.scrollLeft) };

    case 'UNDO': {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);
      const currentSnap = takeSnapshot(state);
      const totalDuration = computeTotalDuration(prev.tracks);
      return {
        ...state,
        past: newPast,
        future: [currentSnap, ...state.future],
        tracks: prev.tracks,
        transitions: prev.transitions ? [...prev.transitions] : [],
        keyframes: prev.keyframes ? [...prev.keyframes] : [],
        selectedClipId: prev.selectedClipId,
        selectedClipIds: prev.selectedClipIds ? [...prev.selectedClipIds] : (prev.selectedClipId ? [prev.selectedClipId] : []),
        selectedTransitionId: prev.selectedTransitionId ?? null,
        selectedKeyframeId: prev.selectedKeyframeId ?? null,
        selectedGap: null,
        totalDuration,
        saveStatus: 'unsaved',
      };
    }

    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      const currentSnap = takeSnapshot(state);
      const totalDuration = computeTotalDuration(next.tracks);
      return {
        ...state,
        past: [...state.past, currentSnap],
        future: newFuture,
        tracks: next.tracks,
        transitions: next.transitions ? [...next.transitions] : [],
        keyframes: next.keyframes ? [...next.keyframes] : [],
        selectedClipId: next.selectedClipId,
        selectedClipIds: next.selectedClipIds ? [...next.selectedClipIds] : (next.selectedClipId ? [next.selectedClipId] : []),
        selectedTransitionId: next.selectedTransitionId ?? null,
        selectedKeyframeId: next.selectedKeyframeId ?? null,
        selectedGap: null,
        totalDuration,
        saveStatus: 'unsaved',
      };
    }

    case 'START_AI_EDIT':
      return { ...state, aiStatus: 'analyzing', aiSuggestions: [] };

    case 'SET_AI_SUGGESTIONS':
      return { ...state, aiStatus: 'suggesting', aiSuggestions: action.suggestions };

    case 'ACCEPT_AI_SUGGESTION': {
      const s = pushHistory(state);
      const suggestions = s.aiSuggestions.map(sg =>
        sg.id === action.id ? { ...sg, accepted: true } : sg
      );
      const suggestion = suggestions.find(sg => sg.id === action.id);
      let tracks = s.tracks;
      if (suggestion?.clipId) {
        tracks = tracks.map(track => ({
          ...track,
          clips: track.clips.map(clip => {
            if (clip.id !== suggestion.clipId) return clip;
            if (suggestion.type === 'color_grade') {
              return { ...clip, brightness: 12, contrast: 16, saturation: 20, temperature: 10 };
            }
            if (suggestion.type === 'trim') {
              return { ...clip, duration: Math.max(clip.duration - 2, 0.3) };
            }
            if (suggestion.type === 'music_sync') {
              return { ...clip, fadeIn: 1.0, fadeOut: 1.0 };
            }
            return clip;
          }),
        }));
      }
      const allDone = suggestions.every(sg => sg.accepted !== null);
      return {
        ...s,
        tracks,
        aiSuggestions: suggestions,
        aiStatus: allDone ? 'done' : 'suggesting',
        saveStatus: 'unsaved',
      };
    }

    case 'REJECT_AI_SUGGESTION': {
      const suggestions = state.aiSuggestions.map(sg =>
        sg.id === action.id ? { ...sg, accepted: false } : sg
      );
      const allDone = suggestions.every(sg => sg.accepted !== null);
      return {
        ...state,
        aiSuggestions: suggestions,
        aiStatus: allDone ? 'done' : 'suggesting',
      };
    }

    case 'DISMISS_AI':
      return { ...state, aiStatus: 'idle', aiSuggestions: [] };

    case 'SHOW_EXPORT_MODAL':
      return { ...state, showExportModal: true };

    case 'HIDE_EXPORT_MODAL':
      return { ...state, showExportModal: false };

    case 'SET_EXPORT_SETTINGS':
      return {
        ...state,
        exportSettings: { ...state.exportSettings, ...action.settings },
        saveStatus: 'unsaved',
      };

    case 'SET_SAVE_STATUS':
      return { ...state, saveStatus: action.status };

    case 'RESTORE_PROJECT': {
      // 保存済みプロジェクトで編集状態を置き換える (Task 14)。
      // 選択・再生・Undo履歴などの一時的状態はリセットする。
      const { slice } = action;
      return {
        ...state,
        projectName: slice.projectName,
        mediaItems: slice.mediaItems,
        tracks: slice.tracks,
        transitions: slice.transitions,
        keyframes: slice.keyframes,
        exportSettings: slice.exportSettings,
        totalDuration: slice.totalDuration,
        currentTime: 0,
        isPlaying: false,
        selectedClipId: null,
        selectedClipIds: [],
        selectedTransitionId: null,
        selectedKeyframeId: null,
        selectedTrackId: null,
        selectedGap: null,
        past: [],
        future: [],
        saveStatus: 'saved',
        projectRestored: true,
      };
    }

    case 'PROJECT_RESTORE_DONE':
      // 保存済みプロジェクトが無かった場合: 初期状態のまま復元完了とする
      return { ...state, projectRestored: true };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────

interface EditorContextValue {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return createElement(EditorContext.Provider, { value }, children);
}

export function useEditorStore(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditorStore must be inside EditorProvider');
  return ctx;
}
