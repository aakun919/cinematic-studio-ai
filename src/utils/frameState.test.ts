import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeFrameState, timelineDuration, clipColorFilter } from './frameState.ts';
import type { Clip, Keyframe, Track, Transition } from '../types.ts';

function clip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'c1',
    mediaId: 'v1',
    trackId: 't-video',
    startTime: 0,
    duration: 10,
    mediaStart: 0,
    label: 'Clip 1',
    x: 0, y: 0, scale: 1, rotation: 0,
    fadeIn: 0, fadeOut: 0,
    brightness: 0, contrast: 0, saturation: 0, temperature: 0,
    ...overrides,
  };
}

function videoTrack(clips: Clip[]): Track {
  return { id: 't-video', type: 'video', label: 'Video', muted: false, locked: false, clips };
}

function textTrack(clips: Clip[]): Track {
  return { id: 't-text', type: 'text', label: 'Text', muted: false, locked: false, clips };
}

function transition(overrides: Partial<Transition> = {}): Transition {
  return {
    id: 'tr1',
    type: 'cross-dissolve',
    trackId: 't-video',
    fromClipId: 'c1',
    toClipId: 'c2',
    startTime: 9,
    duration: 2,
    enabled: true,
    ...overrides,
  };
}

describe('Package 4 — computeFrameState (単一クリップ)', () => {
  it('クリップ中央では opacity 1、mediaTime は mediaStart + ローカル時刻', () => {
    const tracks = [videoTrack([clip({ mediaStart: 3 })])];
    const s = computeFrameState(tracks, [], [], 4);
    assert.equal(s.primary?.clip.id, 'c1');
    assert.equal(s.primary?.opacity, 1);
    assert.equal(s.primary?.localTime, 4);
    assert.equal(s.primary?.mediaTime, 7);
    assert.equal(s.next, null);
    assert.equal(s.dipToBlack, 0);
  });

  it('フェードイン中点で opacity が 0.5 になる', () => {
    const tracks = [videoTrack([clip({ fadeIn: 2 })])];
    const s = computeFrameState(tracks, [], [], 1);
    assert.equal(s.primary?.opacity, 0.5);
  });

  it('フェードアウト中点で opacity が 0.5 になる', () => {
    const tracks = [videoTrack([clip({ fadeOut: 2 })])];
    const s = computeFrameState(tracks, [], [], 9);
    assert.equal(s.primary?.opacity, 0.5);
  });

  it('ギャップ (クリップの外) では primary が null (黒)', () => {
    const tracks = [videoTrack([clip({ startTime: 5, duration: 5 })])];
    assert.equal(computeFrameState(tracks, [], [], 2).primary, null);
    assert.equal(computeFrameState(tracks, [], [], 20).primary, null);
  });

  it('色補正はプレビューと同じ式 (brightness 50 → 1.5、temperature 50 → hue 20deg)', () => {
    const f = clipColorFilter(clip({ brightness: 50, contrast: -20, saturation: 10, temperature: 50 }));
    assert.equal(f.brightness, 1.5);
    assert.equal(f.contrast, 0.8);
    assert.equal(f.saturate, 1.1);
    assert.equal(f.hueRotateDeg, 20);
  });
});

describe('Package 4 — computeFrameState (キーフレーム補間)', () => {
  const kfs: Keyframe[] = [
    { id: 'k1', clipId: 'c1', property: 'opacity', time: 0, value: 0, easing: 'linear' },
    { id: 'k2', clipId: 'c1', property: 'opacity', time: 4, value: 1, easing: 'linear' },
    { id: 'k3', clipId: 'c1', property: 'scale', time: 0, value: 1, easing: 'linear' },
    { id: 'k4', clipId: 'c1', property: 'scale', time: 4, value: 2, easing: 'linear' },
  ];

  it('opacity キーフレームの中点で opacity 0.5、scale は 1.5', () => {
    const tracks = [videoTrack([clip()])];
    const s = computeFrameState(tracks, [], kfs, 2);
    assert.equal(s.primary?.opacity, 0.5);
    assert.equal(s.primary?.values.scale, 1.5);
  });

  it('キーフレーム opacity とフェードは min 合成される', () => {
    const tracks = [videoTrack([clip({ fadeIn: 4 })])];
    // t=2: キーフレーム opacity 0.5、フェード係数 0.5 → min = 0.5
    // t=1: キーフレーム opacity 0.25、フェード係数 0.25 → 0.25
    assert.equal(computeFrameState(tracks, [], kfs, 1).primary?.opacity, 0.25);
    assert.equal(computeFrameState(tracks, [], kfs, 2).primary?.opacity, 0.5);
  });
});

describe('Package 4 — computeFrameState (トランジション)', () => {
  const from = clip({ id: 'c1', startTime: 0, duration: 11 });
  const to = clip({ id: 'c2', startTime: 10, duration: 10, label: 'Clip 2' });
  const tracks = [videoTrack([from, to])];

  it('クロスディゾルブ中点 (p=0.5) で前後クリップとも opacity 0.5', () => {
    const s = computeFrameState(tracks, [transition()], [], 10);
    assert.equal(s.transitionProgress, 0.5);
    assert.equal(s.primary?.clip.id, 'c1');
    assert.equal(s.primary?.opacity, 0.5);
    assert.equal(s.next?.clip.id, 'c2');
    assert.equal(s.next?.opacity, 0.5);
  });

  it('クロスディゾルブ開始直後は前クリップがほぼ不透明', () => {
    const s = computeFrameState(tracks, [transition()], [], 9);
    assert.equal(s.transitionProgress, 0);
    assert.equal(s.primary?.opacity, 1);
    assert.equal(s.next?.opacity, 0);
  });

  it('ディップ・トゥ・ブラックは中点で真っ黒、前半は from / 後半は to', () => {
    const dip = transition({ type: 'dip-to-black' });
    const q1 = computeFrameState(tracks, [dip], [], 9.5); // p = 0.25
    assert.equal(q1.dipToBlack, 0.5);
    assert.equal(q1.primary?.clip.id, 'c1');

    const mid = computeFrameState(tracks, [dip], [], 10); // p = 0.5
    assert.equal(mid.dipToBlack, 1);
    assert.equal(mid.primary?.clip.id, 'c2');

    const q3 = computeFrameState(tracks, [dip], [], 10.5); // p = 0.75
    assert.equal(q3.dipToBlack, 0.5);
    assert.equal(q3.primary?.clip.id, 'c2');
  });

  it('無効化されたトランジションは無視される', () => {
    const s = computeFrameState(tracks, [transition({ enabled: false })], [], 10);
    assert.equal(s.transition, null);
    assert.equal(s.next, null);
    // プレビュー同様、再生ヘッド下の最初のクリップ (配列順) が選ばれる
    assert.equal(s.primary?.clip.id, 'c1');
    assert.equal(s.primary?.opacity, 1);
  });
});

describe('Package 4 — computeFrameState (テキスト)', () => {
  it('テキストクリップがレイヤー化され、フェードは適用されない', () => {
    const text = clip({
      id: 'tc1', trackId: 't-text', mediaId: '',
      startTime: 2, duration: 6, fadeIn: 4,
      text: 'Title', fontSize: 48,
    });
    const tracks = [videoTrack([clip()]), textTrack([text])];
    const s = computeFrameState(tracks, [], [], 3);
    assert.equal(s.text?.clip.id, 'tc1');
    // ローカル 1 秒 (フェードイン 4 秒の途中) でもテキスト opacity は 1 のまま
    assert.equal(s.text?.opacity, 1);
  });

  it('テキストのキーフレーム opacity は反映される', () => {
    const text = clip({
      id: 'tc1', trackId: 't-text', mediaId: '',
      startTime: 0, duration: 8, text: 'Title',
    });
    const kfs: Keyframe[] = [
      { id: 'k1', clipId: 'tc1', property: 'opacity', time: 0, value: 0, easing: 'linear' },
      { id: 'k2', clipId: 'tc1', property: 'opacity', time: 4, value: 1, easing: 'linear' },
    ];
    const tracks = [textTrack([text])];
    assert.equal(computeFrameState(tracks, [], kfs, 2).text?.opacity, 0.5);
  });
});

describe('Package 4 — timelineDuration', () => {
  it('全トラックのクリップ終端の最大値 (下限なし)', () => {
    const tracks = [
      videoTrack([clip({ startTime: 0, duration: 12 })]),
      textTrack([clip({ id: 'tc', trackId: 't-text', mediaId: '', startTime: 20, duration: 5 })]),
    ];
    assert.equal(timelineDuration(tracks), 25);
    assert.equal(timelineDuration([]), 0);
    assert.equal(timelineDuration([videoTrack([])]), 0);
  });
});
