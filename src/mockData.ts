// Cinematic Studio AI — モックデータ

import type { MediaItem, Track, Clip, Transition, Keyframe } from './types.ts';

// --- サムネイル用 CSS グラデーション ---

const VIDEO_THUMBS = [
  'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  'linear-gradient(135deg, #1a0533 0%, #2d1b5e 40%, #0d1b4b 100%)',
  'linear-gradient(135deg, #16213e 0%, #0f3460 50%, #533483 100%)',
  'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 60%, #16213e 100%)',
  'linear-gradient(135deg, #0d1117 0%, #1a2a1a 50%, #0a1a0a 100%)',
];

const PHOTO_THUMBS = [
  'linear-gradient(135deg, #c0392b 0%, #8e44ad 100%)',
  'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
  'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
  'linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)',
  'linear-gradient(135deg, #373b44 0%, #4286f4 100%)',
];

const AUDIO_THUMBS = [
  'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
  'linear-gradient(135deg, #232526 0%, #414345 100%)',
  'linear-gradient(135deg, #1f4037 0%, #3a6b58 100%)',
  'linear-gradient(135deg, #200122 0%, #6f0000 100%)',
];

// --- メディアアイテム ---

export const mockMediaItems: MediaItem[] = [
  // Videos
  {
    id: 'v1', name: 'Golden Hour Beach', type: 'video',
    duration: 45, thumbnail: VIDEO_THUMBS[0],
    tags: ['beach', 'sunset'], addedAt: Date.now() - 86400000 * 5,
  },
  {
    id: 'v2', name: 'City Night Timelapse', type: 'video',
    duration: 120, thumbnail: VIDEO_THUMBS[1],
    tags: ['city', 'night'], addedAt: Date.now() - 86400000 * 3,
  },
  {
    id: 'v3', name: 'Mountain Aerial', type: 'video',
    duration: 60, thumbnail: VIDEO_THUMBS[2],
    tags: ['mountain', 'drone'], addedAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'v4', name: 'Rainy Window', type: 'video',
    duration: 30, thumbnail: VIDEO_THUMBS[3],
    tags: ['rain', 'moody'], addedAt: Date.now() - 86400000,
  },
  {
    id: 'v5', name: 'Forest Morning', type: 'video',
    duration: 55, thumbnail: VIDEO_THUMBS[4],
    tags: ['forest', 'nature'], addedAt: Date.now() - 86400000 * 7,
  },
  // Photos
  {
    id: 'p1', name: 'Portrait — Studio', type: 'photo',
    duration: 5, thumbnail: PHOTO_THUMBS[0],
    tags: ['portrait', 'studio'], addedAt: Date.now() - 86400000 * 7,
  },
  {
    id: 'p2', name: 'Landscape Sunrise', type: 'photo',
    duration: 5, thumbnail: PHOTO_THUMBS[1],
    tags: ['landscape', 'morning'], addedAt: Date.now() - 86400000 * 4,
  },
  {
    id: 'p3', name: 'Urban Street', type: 'photo',
    duration: 5, thumbnail: PHOTO_THUMBS[2],
    tags: ['urban', 'street'], addedAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'p4', name: 'Bokeh Lights', type: 'photo',
    duration: 5, thumbnail: PHOTO_THUMBS[3],
    tags: ['bokeh', 'lights'], addedAt: Date.now() - 86400000,
  },
  {
    id: 'p5', name: 'Abstract Geometry', type: 'photo',
    duration: 5, thumbnail: PHOTO_THUMBS[4],
    tags: ['abstract'], addedAt: Date.now() - 86400000 * 3,
  },
  // Audio
  {
    id: 'a1', name: 'Ambient — Calm Dusk', type: 'audio',
    duration: 180, thumbnail: AUDIO_THUMBS[0],
    tags: ['ambient', 'calm'], addedAt: Date.now() - 86400000 * 6,
  },
  {
    id: 'a2', name: 'Cinematic Score Intro', type: 'audio',
    duration: 90, thumbnail: AUDIO_THUMBS[1],
    tags: ['cinematic', 'score'], addedAt: Date.now() - 86400000 * 3,
  },
  {
    id: 'a3', name: 'Percussion Texture', type: 'audio',
    duration: 60, thumbnail: AUDIO_THUMBS[2],
    tags: ['percussion', 'texture'], addedAt: Date.now() - 86400000,
  },
  {
    id: 'a4', name: 'Strings — Slow Build', type: 'audio',
    duration: 120, thumbnail: AUDIO_THUMBS[3],
    tags: ['strings', 'orchestral'], addedAt: Date.now() - 86400000 * 2,
  },
];

// --- クリップファクトリ ---

function makeClip(
  overrides: Pick<Clip, 'id' | 'mediaId' | 'trackId' | 'startTime' | 'duration' | 'label'> &
    Partial<Omit<Clip, 'id' | 'mediaId' | 'trackId' | 'startTime' | 'duration' | 'label'>>
): Clip {
  return {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    mediaStart: 0,
    fadeIn: 0.5,
    fadeOut: 0.5,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    temperature: 0,
    ...overrides,
  };
}

// --- タイムライントラック ---

export const mockTracks: Track[] = [
  {
    id: 'track-video-1',
    type: 'video',
    label: 'Video 1',
    muted: false,
    locked: false,
    clips: [
      makeClip({ id: 'clip-v1', mediaId: 'v1', trackId: 'track-video-1', startTime: 0, duration: 12, label: 'Golden Hour Beach' }),
      makeClip({ id: 'clip-v2', mediaId: 'v2', trackId: 'track-video-1', startTime: 12, duration: 18, label: 'City Night Timelapse' }),
      makeClip({ id: 'clip-v3', mediaId: 'v3', trackId: 'track-video-1', startTime: 30, duration: 10, label: 'Mountain Aerial' }),
    ],
  },
  {
    id: 'track-text-1',
    type: 'text',
    label: 'Titles',
    muted: false,
    locked: false,
    clips: [
      makeClip({
        id: 'clip-t1', mediaId: '', trackId: 'track-text-1',
        startTime: 2, duration: 6, label: 'Opening Title',
        text: 'A Journey Begins', fontSize: 48, fontFamily: 'system-ui', textAlign: 'center',
      }),
      makeClip({
        id: 'clip-t2', mediaId: '', trackId: 'track-text-1',
        startTime: 35, duration: 5, label: 'End Card',
        text: 'The End', fontSize: 36, fontFamily: 'system-ui', textAlign: 'center',
      }),
    ],
  },
  {
    id: 'track-audio-1',
    type: 'audio',
    label: 'Music',
    muted: false,
    locked: false,
    clips: [
      makeClip({ id: 'clip-a1', mediaId: 'a2', trackId: 'track-audio-1', startTime: 0, duration: 42, label: 'Cinematic Score Intro' }),
    ],
  },
];

export const mockTransitions: Transition[] = [
  {
    id: 'trans-1',
    type: 'cross-dissolve',
    trackId: 'track-video-1',
    fromClipId: 'clip-v1',
    toClipId: 'clip-v2',
    startTime: 11.5,
    duration: 1.0,
    enabled: true,
  },
];

export const mockKeyframes: Keyframe[] = [
  {
    id: 'kf-1',
    clipId: 'clip-v1',
    property: 'scale',
    time: 0,
    value: 1.0,
    easing: 'ease-in-out',
  },
  {
    id: 'kf-2',
    clipId: 'clip-v1',
    property: 'scale',
    time: 6.0,
    value: 1.35,
    easing: 'ease-in-out',
  },
  {
    id: 'kf-3',
    clipId: 'clip-v1',
    property: 'positionX',
    time: 0,
    value: 0,
    easing: 'linear',
  },
  {
    id: 'kf-4',
    clipId: 'clip-v1',
    property: 'positionX',
    time: 8.0,
    value: 12,
    easing: 'ease-out',
  },
];
