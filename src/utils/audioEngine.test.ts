import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planAudioSegments, fadeGainAt } from './audioEngine.ts';
import type { Clip, MediaItem, Track } from '../types.ts';

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

describe('第3パッケージ — planAudioSegments', () => {
  it('未来のクリップは delay 付きで計画される', () => {
    const segs = planAudioSegments([track()], [media()], 0);
    assert.equal(segs.length, 1);
    assert.equal(segs[0].delay, 10);
    assert.equal(segs[0].startOffset, 0);
    assert.equal(segs[0].mediaStart, 2);
    assert.equal(segs[0].duration, 5);
  });

  it('再生位置がクリップの途中なら offset と mediaStart が進む', () => {
    const segs = planAudioSegments([track()], [media()], 12);
    assert.equal(segs.length, 1);
    assert.equal(segs[0].delay, 0);
    assert.equal(segs[0].startOffset, 2);
    assert.equal(segs[0].mediaStart, 4);
    assert.equal(segs[0].duration, 3);
  });

  it('終了済みクリップは含まれない', () => {
    assert.equal(planAudioSegments([track()], [media()], 15).length, 0);
    assert.equal(planAudioSegments([track()], [media()], 100).length, 0);
  });

  it('ミュートされたトラックは除外される', () => {
    assert.equal(planAudioSegments([track({ muted: true })], [media()], 0).length, 0);
  });

  it('オーディオトラック以外・音声以外のメディアは除外される', () => {
    const videoTrack = track({ id: 't-v', type: 'video', clips: [clip({ trackId: 't-v' })] });
    assert.equal(planAudioSegments([videoTrack], [media()], 0).length, 0);

    const wrongMedia = track({ clips: [clip({ mediaId: 'v1' })] });
    assert.equal(planAudioSegments([wrongMedia], [media({ id: 'v1', type: 'video' })], 0).length, 0);

    const missingMedia = track({ clips: [clip({ mediaId: 'gone' })] });
    assert.equal(planAudioSegments([missingMedia], [media()], 0).length, 0);
  });

  it('複数トラック・複数クリップは delay 順に並ぶ', () => {
    const t1 = track({ clips: [clip({ id: 'c-late', startTime: 30 })] });
    const t2 = track({
      id: 't-audio-2',
      clips: [
        clip({ id: 'c-early', trackId: 't-audio-2', startTime: 5 }),
        clip({ id: 'c-mid', trackId: 't-audio-2', startTime: 20 }),
      ],
    });
    const segs = planAudioSegments([t1, t2], [media()], 0);
    assert.deepEqual(segs.map(s => s.clipId), ['c-early', 'c-mid', 'c-late']);
  });
});

describe('第3パッケージ — fadeGainAt', () => {
  const c = { fadeIn: 2, fadeOut: 2, duration: 10 };
  it('フェードイン区間は線形に上がる', () => {
    assert.equal(fadeGainAt(c, 0), 0);
    assert.equal(fadeGainAt(c, 1), 0.5);
    assert.equal(fadeGainAt(c, 2), 1);
  });
  it('中間は 1、フェードアウト区間は線形に下がる', () => {
    assert.equal(fadeGainAt(c, 5), 1);
    assert.equal(fadeGainAt(c, 9), 0.5);
    assert.equal(fadeGainAt(c, 10), 0);
  });
  it('フェードが重なる短いクリップでは小さい方が効く', () => {
    const short = { fadeIn: 2, fadeOut: 2, duration: 3 };
    assert.equal(fadeGainAt(short, 1.5), 0.75);
  });
  it('フェードなしは常時 1', () => {
    assert.equal(fadeGainAt({ fadeIn: 0, fadeOut: 0, duration: 10 }, 0), 1);
    assert.equal(fadeGainAt({ fadeIn: 0, fadeOut: 0, duration: 10 }, 10), 1);
  });
});
