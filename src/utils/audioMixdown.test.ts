import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fadeEnvelopePoints, planAudioMixdown } from './audioMixdown.ts';
import type { AudioSegment } from './audioEngine.ts';
import type { Clip, MediaItem, Track } from '../types.ts';

function segment(overrides: Partial<AudioSegment> = {}): AudioSegment {
  return {
    clipId: 'c1',
    trackId: 't-audio-1',
    mediaId: 'a1',
    clipStart: 0,
    clipDuration: 5,
    delay: 0,
    startOffset: 0,
    mediaStart: 0,
    duration: 5,
    fadeIn: 0,
    fadeOut: 0,
    ...overrides,
  };
}

describe('Package 4 — fadeEnvelopePoints', () => {
  it('フェードイン/アウト付きは AudioEngine.play と同じ set/ramp 列になる', () => {
    const pts = fadeEnvelopePoints(segment({ fadeIn: 1, fadeOut: 1 }));
    assert.deepEqual(pts, [
      { time: 0, gain: 0, type: 'set' },
      { time: 1, gain: 1, type: 'ramp' },
      { time: 4, gain: 1, type: 'set' },
      { time: 5, gain: 0, type: 'ramp' },
    ]);
  });

  it('フェードなしは開始点のみ', () => {
    assert.deepEqual(fadeEnvelopePoints(segment()), [
      { time: 0, gain: 1, type: 'set' },
    ]);
  });

  it('フェードアウトのみ', () => {
    const pts = fadeEnvelopePoints(segment({ fadeOut: 2 }));
    assert.deepEqual(pts, [
      { time: 0, gain: 1, type: 'set' },
      { time: 3, gain: 1, type: 'set' },
      { time: 5, gain: 0, type: 'ramp' },
    ]);
  });

  it('フェードインのみ', () => {
    const pts = fadeEnvelopePoints(segment({ fadeIn: 2 }));
    assert.deepEqual(pts, [
      { time: 0, gain: 0, type: 'set' },
      { time: 2, gain: 1, type: 'ramp' },
    ]);
  });

  it('途中から始まるセグメント (startOffset > 0) では相対時刻に直る', () => {
    // クリップ長 10、フェードイン 4、開始オフセット 2 → 残り 2 秒で 1 に到達
    const pts = fadeEnvelopePoints(segment({
      clipDuration: 10, duration: 8, startOffset: 2, fadeIn: 4,
    }));
    assert.deepEqual(pts, [
      { time: 0, gain: 0.5, type: 'set' },
      { time: 2, gain: 1, type: 'ramp' },
    ]);
  });
});

function media(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'a1',
    name: 'score.mp3',
    type: 'audio',
    duration: 30,
    thumbnail: '',
    tags: [],
    addedAt: 0,
    isLocalFile: true,
    url: 'blob:mock',
    ...overrides,
  };
}

function clip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'c1',
    mediaId: 'a1',
    trackId: 't-audio-1',
    startTime: 10,
    duration: 5,
    mediaStart: 2,
    label: 'Score',
    x: 0, y: 0, scale: 1, rotation: 0,
    fadeIn: 1, fadeOut: 1,
    brightness: 0, contrast: 0, saturation: 0, temperature: 0,
    ...overrides,
  };
}

function track(overrides: Partial<Track> = {}): Track {
  return {
    id: 't-audio-1',
    type: 'audio',
    label: 'Audio 1',
    muted: false,
    locked: false,
    clips: [clip()],
    ...overrides,
  };
}

describe('Package 4 — planAudioMixdown (planAudioSegments の再利用)', () => {
  it('セグメント計画と開始時刻・エンベロープが組になる', () => {
    const entries = planAudioMixdown([track()], [media()]);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].startAt, 10); // = clip.startTime (delay from 0)
    assert.equal(entries[0].segment.mediaStart, 2);
    assert.deepEqual(entries[0].envelope[0], { time: 0, gain: 0, type: 'set' });
  });

  it('ミュートトラックは計画から外れる', () => {
    assert.equal(planAudioMixdown([track({ muted: true })], [media()]).length, 0);
  });
});
