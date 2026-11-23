import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { interpolateProperty, getInterpolatedClipValues, applyEasing } from './interpolation.ts';
import { editorReducer, initialState } from '../store.ts';
import type { Clip, Keyframe, EditorState } from '../types.ts';

function createTestClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'test-clip-1',
    mediaId: 'v1',
    trackId: 'track-video-1',
    startTime: 10,
    duration: 10,
    mediaStart: 0,
    label: 'Test Clip',
    x: 10,
    y: 20,
    scale: 1.2,
    rotation: 15,
    fadeIn: 0.5,
    fadeOut: 0.5,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    temperature: 0,
    ...overrides,
  };
}

describe('Task 08 — 1. キーフレーム補間エンジン (interpolation.ts) 監査', () => {
  const clip = createTestClip();

  it('キーフレームが存在しない場合、クリップの基本値 (x, y, scale, rotation, opacity=1.0) を正しく返す', () => {
    assert.equal(interpolateProperty(clip, 'positionX', 0, []), 10);
    assert.equal(interpolateProperty(clip, 'positionY', 5, []), 20);
    assert.equal(interpolateProperty(clip, 'scale', 5, []), 1.2);
    assert.equal(interpolateProperty(clip, 'rotation', 5, []), 15);
    assert.equal(interpolateProperty(clip, 'opacity', 5, []), 1.0);
  });

  it('キーフレームが1つだけの場合、どの時刻でもそのキーフレームの値を維持する', () => {
    const keyframes: Keyframe[] = [
      { id: 'kf-1', clipId: clip.id, property: 'scale', time: 3, value: 2.5, easing: 'linear' },
    ];
    assert.equal(interpolateProperty(clip, 'scale', 0, keyframes), 2.5);
    assert.equal(interpolateProperty(clip, 'scale', 3, keyframes), 2.5);
    assert.equal(interpolateProperty(clip, 'scale', 10, keyframes), 2.5);
    assert.equal(interpolateProperty(clip, 'scale', -5, keyframes), 2.5);
  });

  it('最初のキーフレーム以前では最初のキーフレーム値を維持する', () => {
    const keyframes: Keyframe[] = [
      { id: 'kf-1', clipId: clip.id, property: 'scale', time: 2, value: 1.0, easing: 'linear' },
      { id: 'kf-2', clipId: clip.id, property: 'scale', time: 6, value: 2.0, easing: 'linear' },
    ];
    assert.equal(interpolateProperty(clip, 'scale', 0, keyframes), 1.0);
    assert.equal(interpolateProperty(clip, 'scale', -10, keyframes), 1.0);
    assert.equal(interpolateProperty(clip, 'scale', 2, keyframes), 1.0);
  });

  it('最後のキーフレーム以降では最後のキーフレーム値を維持する', () => {
    const keyframes: Keyframe[] = [
      { id: 'kf-1', clipId: clip.id, property: 'scale', time: 2, value: 1.0, easing: 'linear' },
      { id: 'kf-2', clipId: clip.id, property: 'scale', time: 6, value: 2.0, easing: 'linear' },
    ];
    assert.equal(interpolateProperty(clip, 'scale', 6, keyframes), 2.0);
    assert.equal(interpolateProperty(clip, 'scale', 8, keyframes), 2.0);
    assert.equal(interpolateProperty(clip, 'scale', 100, keyframes), 2.0);
  });

  it('Linear 補間が正常に線形推移する', () => {
    const keyframes: Keyframe[] = [
      { id: 'kf-1', clipId: clip.id, property: 'positionX', time: 0, value: 0, easing: 'linear' },
      { id: 'kf-2', clipId: clip.id, property: 'positionX', time: 10, value: 100, easing: 'linear' },
    ];
    assert.equal(interpolateProperty(clip, 'positionX', 0, keyframes), 0);
    assert.equal(interpolateProperty(clip, 'positionX', 2.5, keyframes), 25);
    assert.equal(interpolateProperty(clip, 'positionX', 5, keyframes), 50);
    assert.equal(interpolateProperty(clip, 'positionX', 7.5, keyframes), 75);
    assert.equal(interpolateProperty(clip, 'positionX', 10, keyframes), 100);
  });

  it('Ease-In 補間 (t^2) で前半が緩やか、後半が急峻になる', () => {
    const keyframes: Keyframe[] = [
      { id: 'kf-1', clipId: clip.id, property: 'positionX', time: 0, value: 0, easing: 'ease-in' },
      { id: 'kf-2', clipId: clip.id, property: 'positionX', time: 10, value: 100, easing: 'ease-in' },
    ];
    // t=0.5 -> 0.25 -> 25
    assert.equal(interpolateProperty(clip, 'positionX', 5, keyframes), 25);
  });

  it('Ease-Out 補間 (t*(2-t)) で前半が急峻、後半が緩やかになる', () => {
    const keyframes: Keyframe[] = [
      { id: 'kf-1', clipId: clip.id, property: 'positionX', time: 0, value: 0, easing: 'ease-out' },
      { id: 'kf-2', clipId: clip.id, property: 'positionX', time: 10, value: 100, easing: 'ease-out' },
    ];
    // t=0.5 -> 0.5 * 1.5 = 0.75 -> 75
    assert.equal(interpolateProperty(clip, 'positionX', 5, keyframes), 75);
  });

  it('Ease-In-Out 補間で対称的かつ中間点50%で対称推移する', () => {
    const keyframes: Keyframe[] = [
      { id: 'kf-1', clipId: clip.id, property: 'positionX', time: 0, value: 0, easing: 'ease-in-out' },
      { id: 'kf-2', clipId: clip.id, property: 'positionX', time: 10, value: 100, easing: 'ease-in-out' },
    ];
    assert.equal(interpolateProperty(clip, 'positionX', 5, keyframes), 50);
    assert.equal(applyEasing(0, 'ease-in-out'), 0);
    assert.equal(applyEasing(1, 'ease-in-out'), 1);
  });

  it('NaN, Infinity, 負の時刻が入力されても NaN/Infinity にならずクラッシュしない', () => {
    const keyframes: Keyframe[] = [
      { id: 'kf-1', clipId: clip.id, property: 'scale', time: 0, value: 1.0, easing: 'linear' },
      { id: 'kf-2', clipId: clip.id, property: 'scale', time: 10, value: 2.0, easing: 'linear' },
    ];
    const valNan = interpolateProperty(clip, 'scale', NaN, keyframes);
    assert.ok(!Number.isNaN(valNan), 'NaN should be handled safely');

    const valInf = interpolateProperty(clip, 'scale', Infinity, keyframes);
    assert.ok(Number.isFinite(valInf), 'Infinity should be clamped to finite value');
    assert.equal(valInf, 2.0);

    const valNegInf = interpolateProperty(clip, 'scale', -Infinity, keyframes);
    assert.ok(Number.isFinite(valNegInf), '-Infinity should be clamped to finite value');
    assert.equal(valNegInf, 1.0);
  });

  it('getInterpolatedClipValues が全プロパティおよび hasKeyframes フラグを正確に返す', () => {
    const keyframes: Keyframe[] = [
      { id: 'kf-1', clipId: clip.id, property: 'scale', time: 0, value: 1.0, easing: 'linear' },
      { id: 'kf-2', clipId: clip.id, property: 'scale', time: 10, value: 2.0, easing: 'linear' },
    ];
    // clip.startTime = 10, currentTime = 15 -> localTime = 5 -> scale = 1.5
    const values = getInterpolatedClipValues(clip, 15, keyframes);
    assert.equal(values.hasKeyframes, true);
    assert.equal(values.scale, 1.5);
    assert.equal(values.positionX, 10); // base value
    assert.equal(values.positionY, 20); // base value
    assert.equal(values.rotation, 15); // base value
    assert.equal(values.opacity, 1.0); // default
  });
});

describe('Task 08 — 2. トリムとキーフレームの整合性 (TRIM_CLIP)', () => {
  it('右トリム（クリップ短縮）：範囲内のキーフレーム時刻は維持され、範囲外のキーフレームは除外される', () => {
    const clip = createTestClip({ id: 'c-trim-1', startTime: 0, duration: 10 });
    let state: EditorState = {
      ...initialState,
      tracks: [
        {
          id: 't-1',
          type: 'video',
          label: 'Video Track',
          muted: false,
          locked: false,
          clips: [clip],
        },
      ],
      keyframes: [
        { id: 'kf-1', clipId: 'c-trim-1', property: 'scale', time: 2, value: 1.2, easing: 'linear' },
        { id: 'kf-2', clipId: 'c-trim-1', property: 'scale', time: 5, value: 1.5, easing: 'linear' },
        { id: 'kf-3', clipId: 'c-trim-1', property: 'scale', time: 8, value: 2.0, easing: 'linear' },
      ],
    };

    // duration を 10 -> 6 に短縮 (右トリム)
    state = editorReducer(state, {
      type: 'TRIM_CLIP',
      clipId: 'c-trim-1',
      newStartTime: 0,
      newDuration: 6,
    });

    const trimmedClip = state.tracks[0].clips.find(c => c.id === 'c-trim-1')!;
    assert.equal(trimmedClip.duration, 6);
    assert.equal(trimmedClip.startTime, 0);

    const remainingKfs = state.keyframes.filter(k => k.clipId === 'c-trim-1');
    assert.equal(remainingKfs.length, 2);
    assert.deepEqual(remainingKfs.map(k => k.id), ['kf-1', 'kf-2']);
    assert.equal(remainingKfs[0].time, 2);
    assert.equal(remainingKfs[1].time, 5);
  });

  it('左トリム（開始時刻を進めて先頭を削る）：キーフレームの相対時刻がシフトされ、削られた範囲のキーフレームは除外される', () => {
    const clip = createTestClip({ id: 'c-trim-2', startTime: 10, duration: 10 });
    let state: EditorState = {
      ...initialState,
      tracks: [
        {
          id: 't-1',
          type: 'video',
          label: 'Video Track',
          muted: false,
          locked: false,
          clips: [clip],
        },
      ],
      keyframes: [
        { id: 'kf-1', clipId: 'c-trim-2', property: 'scale', time: 1, value: 1.1, easing: 'linear' },
        { id: 'kf-2', clipId: 'c-trim-2', property: 'scale', time: 4, value: 1.4, easing: 'linear' },
        { id: 'kf-3', clipId: 'c-trim-2', property: 'scale', time: 8, value: 1.8, easing: 'linear' },
      ],
    };

    // startTime を 10 -> 13 に進め、duration を 10 -> 7 に短縮 (左から 3秒削る)
    state = editorReducer(state, {
      type: 'TRIM_CLIP',
      clipId: 'c-trim-2',
      newStartTime: 13,
      newDuration: 7,
      newMediaStart: 3,
    });

    const trimmedClip = state.tracks[0].clips.find(c => c.id === 'c-trim-2')!;
    assert.equal(trimmedClip.startTime, 13);
    assert.equal(trimmedClip.duration, 7);
    assert.equal(trimmedClip.mediaStart, 3);

    const remainingKfs = state.keyframes.filter(k => k.clipId === 'c-trim-2');
    // kf-1 (time=1) -> 1 - 3 = -2 (負なので除外)
    // kf-2 (time=4) -> 4 - 3 = 1 (維持)
    // kf-3 (time=8) -> 8 - 3 = 5 (維持、7以内)
    assert.equal(remainingKfs.length, 2);
    assert.equal(remainingKfs[0].id, 'kf-2');
    assert.equal(remainingKfs[0].time, 1);
    assert.equal(remainingKfs[1].id, 'kf-3');
    assert.equal(remainingKfs[1].time, 5);
  });
});

describe('Task 08 — 3. クリップ複製・グループ複製とキーフレーム', () => {
  it('単一クリップ複製 (DUPLICATE_CLIP) でキーフレームが新規ユニークIDで複製される', () => {
    const clip = createTestClip({ id: 'c-dup-1', startTime: 0, duration: 8 });
    let state: EditorState = {
      ...initialState,
      tracks: [
        {
          id: 't-1',
          type: 'video',
          label: 'Video Track',
          muted: false,
          locked: false,
          clips: [clip],
        },
      ],
      keyframes: [
        { id: 'kf-orig-1', clipId: 'c-dup-1', property: 'scale', time: 1, value: 1.2, easing: 'linear' },
        { id: 'kf-orig-2', clipId: 'c-dup-1', property: 'positionX', time: 4, value: 50, easing: 'ease-out' },
      ],
    };

    state = editorReducer(state, { type: 'DUPLICATE_CLIP', clipId: 'c-dup-1' });

    assert.equal(state.tracks[0].clips.length, 2);
    const newClip = state.tracks[0].clips.find(c => c.id !== 'c-dup-1')!;
    assert.ok(newClip);
    assert.equal(newClip.startTime, 8); // 元クリップの直後

    const dupKfs = state.keyframes.filter(k => k.clipId === newClip.id);
    assert.equal(dupKfs.length, 2);
    assert.notEqual(dupKfs[0].id, 'kf-orig-1');
    assert.notEqual(dupKfs[1].id, 'kf-orig-2');
    assert.notEqual(dupKfs[0].id, dupKfs[1].id);

    // プロパティ・値・イージング・相対時刻の完全一致
    assert.equal(dupKfs[0].property, 'scale');
    assert.equal(dupKfs[0].value, 1.2);
    assert.equal(dupKfs[0].time, 1);
    assert.equal(dupKfs[1].property, 'positionX');
    assert.equal(dupKfs[1].value, 50);
    assert.equal(dupKfs[1].time, 4);

    // 元のキーフレームも保持されていること
    const origKfs = state.keyframes.filter(k => k.clipId === 'c-dup-1');
    assert.equal(origKfs.length, 2);
  });

  it('複数クリップ複製 (DUPLICATE_CLIPS) でグループ全体のキーフレームが一括複製される', () => {
    const c1 = createTestClip({ id: 'c-grp-1', trackId: 't-1', startTime: 0, duration: 5 });
    const c2 = createTestClip({ id: 'c-grp-2', trackId: 't-1', startTime: 5, duration: 5 });
    let state: EditorState = {
      ...initialState,
      tracks: [
        {
          id: 't-1',
          type: 'video',
          label: 'Video Track',
          muted: false,
          locked: false,
          clips: [c1, c2],
        },
      ],
      keyframes: [
        { id: 'kf-g1', clipId: 'c-grp-1', property: 'scale', time: 2, value: 1.5, easing: 'linear' },
        { id: 'kf-g2', clipId: 'c-grp-2', property: 'rotation', time: 3, value: 45, easing: 'ease-in' },
      ],
    };

    state = editorReducer(state, { type: 'DUPLICATE_CLIPS', clipIds: ['c-grp-1', 'c-grp-2'] });

    assert.equal(state.tracks[0].clips.length, 4);
    // 新規クリップ2つ
    const createdClips = state.tracks[0].clips.filter(c => c.id !== 'c-grp-1' && c.id !== 'c-grp-2');
    assert.equal(createdClips.length, 2);

    const duplicatedKfs = state.keyframes.filter(k => k.clipId !== 'c-grp-1' && k.clipId !== 'c-grp-2');
    assert.equal(duplicatedKfs.length, 2);
    const kfIds = new Set(state.keyframes.map(k => k.id));
    assert.equal(kfIds.size, 4, '全キーフレームのIDが一意であること');
  });
});

describe('Task 08 — 4. Undo / Redo の監査', () => {
  it('キーフレーム追加 -> Undo -> Redo で完全復元される', () => {
    const clip = createTestClip({ id: 'c-undo-1', startTime: 0, duration: 10 });
    let state: EditorState = {
      ...initialState,
      tracks: [{ id: 't-1', type: 'video', label: 'V', muted: false, locked: false, clips: [clip] }],
      keyframes: [],
    };

    // キーフレーム追加
    state = editorReducer(state, {
      type: 'ADD_OR_UPDATE_KEYFRAME',
      clipId: 'c-undo-1',
      property: 'scale',
      time: 5,
      value: 1.8,
      easing: 'ease-out',
    });
    assert.equal(state.keyframes.length, 1);
    const addedKfId = state.keyframes[0].id;
    assert.equal(state.selectedKeyframeId, addedKfId);

    // UNDO
    state = editorReducer(state, { type: 'UNDO' });
    assert.equal(state.keyframes.length, 0);
    assert.equal(state.selectedKeyframeId, null);

    // REDO
    state = editorReducer(state, { type: 'REDO' });
    assert.equal(state.keyframes.length, 1);
    assert.equal(state.keyframes[0].value, 1.8);
    assert.equal(state.selectedKeyframeId, addedKfId);
  });

  it('キーフレーム削除 -> Undo -> Redo で完全復元される', () => {
    const clip = createTestClip({ id: 'c-undo-2', startTime: 0, duration: 10 });
    const initialKf: Keyframe = { id: 'kf-del-1', clipId: 'c-undo-2', property: 'rotation', time: 3, value: 90, easing: 'linear' };
    let state: EditorState = {
      ...initialState,
      tracks: [{ id: 't-1', type: 'video', label: 'V', muted: false, locked: false, clips: [clip] }],
      keyframes: [initialKf],
      selectedKeyframeId: 'kf-del-1',
    };

    // 削除
    state = editorReducer(state, { type: 'DELETE_KEYFRAME', keyframeId: 'kf-del-1' });
    assert.equal(state.keyframes.length, 0);
    assert.equal(state.selectedKeyframeId, null);

    // UNDO
    state = editorReducer(state, { type: 'UNDO' });
    assert.equal(state.keyframes.length, 1);
    assert.equal(state.keyframes[0].id, 'kf-del-1');
    assert.equal(state.selectedKeyframeId, 'kf-del-1');

    // REDO
    state = editorReducer(state, { type: 'REDO' });
    assert.equal(state.keyframes.length, 0);
  });

  it('クリップ削除 (DELETE_CLIP) とキーフレームのクリーンアップ、および Undo/Redo での復元', () => {
    const clip = createTestClip({ id: 'c-del-target', startTime: 0, duration: 10 });
    const kf: Keyframe = { id: 'kf-target', clipId: 'c-del-target', property: 'opacity', time: 2, value: 0.5, easing: 'linear' };
    let state: EditorState = {
      ...initialState,
      tracks: [{ id: 't-1', type: 'video', label: 'V', muted: false, locked: false, clips: [clip] }],
      keyframes: [kf],
    };

    // クリップ削除
    state = editorReducer(state, { type: 'DELETE_CLIP', clipId: 'c-del-target' });
    assert.equal(state.tracks[0].clips.length, 0);
    assert.equal(state.keyframes.length, 0);

    // UNDO
    state = editorReducer(state, { type: 'UNDO' });
    assert.equal(state.tracks[0].clips.length, 1);
    assert.equal(state.keyframes.length, 1);
    assert.equal(state.keyframes[0].id, 'kf-target');

    // REDO
    state = editorReducer(state, { type: 'REDO' });
    assert.equal(state.tracks[0].clips.length, 0);
    assert.equal(state.keyframes.length, 0);
  });
});
