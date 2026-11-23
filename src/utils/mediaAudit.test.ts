import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { editorReducer, initialState } from '../store.ts';
import type { MediaItem } from '../types.ts';

describe('Task 10 — 実メディア再生・永続化・編集整合性の品質監査', () => {

  const sampleVideoMedia: MediaItem = {
    id: 'media-test-video-1',
    name: 'sample-city-tour.mp4',
    type: 'video',
    duration: 15.0,
    width: 1920,
    height: 1080,
    fileSize: 25_000_000,
    url: 'blob:http://localhost:5173/mock-uuid-video-1',
    thumbnail: 'data:image/jpeg;base64,mockthumb',
    addedAt: Date.now(),
  };

  const sampleAudioMedia: MediaItem = {
    id: 'media-test-audio-1',
    name: 'ambient-bgm.mp3',
    type: 'audio',
    duration: 30.0,
    fileSize: 5_000_000,
    url: 'blob:http://localhost:5173/mock-uuid-audio-1',
    addedAt: Date.now(),
  };

  // 1. クリップのトリムと mediaStart の整合性検証
  describe('1. クリップ時間と実メディア時間 (mediaStart) の対応・トリム整合性', () => {
    it('ADD_CLIP_FROM_MEDIA で配置されたクリップは mediaStart: 0 で初期化される', () => {
      let state = editorReducer(initialState, {
        type: 'ADD_MEDIA_ITEM',
        item: sampleVideoMedia,
      });

      state = editorReducer(state, {
        type: 'ADD_CLIP_FROM_MEDIA',
        mediaId: sampleVideoMedia.id,
        trackId: 'track-video-1',
        startTime: 2.0,
      });

      const videoTrack = state.tracks.find(t => t.id === 'track-video-1')!;
      const placedClip = videoTrack.clips.find(c => c.mediaId === sampleVideoMedia.id)!;

      assert.ok(placedClip, 'クリップがトラックに配置されていること');
      assert.equal(placedClip.startTime, 2.0);
      assert.equal(placedClip.duration, 15.0);
      assert.equal(placedClip.mediaStart, 0, '初期配置時はメディアの先頭 (0s) から再生されること');
    });

    it('左トリム (開始時刻を +2s 送る) 時、mediaStart が +2s 前進して映像開始位置が一致する', () => {
      let state = editorReducer(initialState, {
        type: 'ADD_MEDIA_ITEM',
        item: sampleVideoMedia,
      });

      state = editorReducer(state, {
        type: 'ADD_CLIP_FROM_MEDIA',
        mediaId: sampleVideoMedia.id,
        trackId: 'track-video-1',
        startTime: 0.0,
      });

      const videoTrack = state.tracks.find(t => t.id === 'track-video-1')!;
      const clip = videoTrack.clips.find(c => c.mediaId === sampleVideoMedia.id)!;

      // 左トリム実行: startTime を 0 -> 2.5s に移動、duration を 15.0 -> 12.5s に短縮
      state = editorReducer(state, {
        type: 'TRIM_CLIP',
        clipId: clip.id,
        newStartTime: 2.5,
        newDuration: 12.5,
      });

      const trimmedClip = state.tracks.find(t => t.id === 'track-video-1')!.clips.find(c => c.id === clip.id)!;
      assert.equal(trimmedClip.startTime, 2.5);
      assert.equal(trimmedClip.duration, 12.5);
      assert.equal(trimmedClip.mediaStart, 2.5, '左トリム分だけ mediaStart が前進していること');
    });

    it('右トリム (終了時刻を縮める) 時、mediaStart は変化しない', () => {
      let state = editorReducer(initialState, {
        type: 'ADD_MEDIA_ITEM',
        item: sampleVideoMedia,
      });

      state = editorReducer(state, {
        type: 'ADD_CLIP_FROM_MEDIA',
        mediaId: sampleVideoMedia.id,
        trackId: 'track-video-1',
        startTime: 1.0,
      });

      const videoTrack = state.tracks.find(t => t.id === 'track-video-1')!;
      const clip = videoTrack.clips.find(c => c.mediaId === sampleVideoMedia.id)!;

      // 右トリム実行: startTime は 1.0 のまま、duration を 15.0 -> 8.0s に短縮
      state = editorReducer(state, {
        type: 'TRIM_CLIP',
        clipId: clip.id,
        newStartTime: 1.0,
        newDuration: 8.0,
      });

      const trimmedClip = state.tracks.find(t => t.id === 'track-video-1')!.clips.find(c => c.id === clip.id)!;
      assert.equal(trimmedClip.startTime, 1.0);
      assert.equal(trimmedClip.duration, 8.0);
      assert.equal(trimmedClip.mediaStart, 0, '右トリムでは mediaStart は 0 のまま維持されること');
    });

    it('連続トリム: 左トリム後に再度左トリムした場合も mediaStart が累積計算される', () => {
      let state = editorReducer(initialState, {
        type: 'ADD_MEDIA_ITEM',
        item: sampleVideoMedia,
      });

      state = editorReducer(state, {
        type: 'ADD_CLIP_FROM_MEDIA',
        mediaId: sampleVideoMedia.id,
        trackId: 'track-video-1',
        startTime: 0.0,
      });

      const clip = state.tracks.find(t => t.id === 'track-video-1')!.clips.find(c => c.mediaId === sampleVideoMedia.id)!;

      // 1回目の左トリム (+1.5s)
      state = editorReducer(state, {
        type: 'TRIM_CLIP',
        clipId: clip.id,
        newStartTime: 1.5,
        newDuration: 13.5,
      });

      // 2回目の左トリム (1.5s -> 3.0s, delta = +1.5s)
      state = editorReducer(state, {
        type: 'TRIM_CLIP',
        clipId: clip.id,
        newStartTime: 3.0,
        newDuration: 12.0,
      });

      const updated = state.tracks.find(t => t.id === 'track-video-1')!.clips.find(c => c.id === clip.id)!;
      assert.equal(updated.mediaStart, 3.0, '累積して mediaStart が 3.0s になっていること');
    });
  });

  // 2. クリップ分割 (SPLIT_CLIP) 時のメディア時間連続性
  describe('2. クリップ分割時のメディア時間連続性 (Split Continuity)', () => {
    it('分割された前半クリップと後半クリップで mediaStart と duration がシームレスに連続する', () => {
      let state = editorReducer(initialState, {
        type: 'ADD_MEDIA_ITEM',
        item: sampleVideoMedia,
      });

      state = editorReducer(state, {
        type: 'ADD_CLIP_FROM_MEDIA',
        mediaId: sampleVideoMedia.id,
        trackId: 'track-video-1',
        startTime: 1.0,
      });

      const clip = state.tracks.find(t => t.id === 'track-video-1')!.clips.find(c => c.mediaId === sampleVideoMedia.id)!;
      // まず左トリムで mediaStart を 2.0 に設定 (startTime: 3.0, duration: 13.0)
      state = editorReducer(state, {
        type: 'TRIM_CLIP',
        clipId: clip.id,
        newStartTime: 3.0,
        newDuration: 13.0,
      });

      // タイムライン時刻 7.0s で分割 (クリップ内相対時刻: 7.0 - 3.0 = 4.0s)
      state = editorReducer(state, {
        type: 'SPLIT_CLIP',
        clipId: clip.id,
        splitTime: 7.0,
      });

      const videoTrack = state.tracks.find(t => t.id === 'track-video-1')!;
      const part1 = videoTrack.clips.find(c => c.id === clip.id)!;
      const part2 = videoTrack.clips.find(c => c.id !== clip.id && c.mediaId === sampleVideoMedia.id)!;

      assert.ok(part1, 'Part 1 が存在すること');
      assert.ok(part2, 'Part 2 が存在すること');

      // Part 1
      assert.equal(part1.startTime, 3.0);
      assert.equal(part1.duration, 4.0);
      assert.equal(part1.mediaStart, 2.0, 'Part 1 の mediaStart は分割前の 2.0s を維持');

      // Part 2
      assert.equal(part2.startTime, 7.0);
      assert.equal(part2.duration, 9.0); // 13.0 - 4.0 = 9.0
      assert.equal(part2.mediaStart, 6.0, 'Part 2 の mediaStart は 2.0 + 4.0 = 6.0s でシームレスに連続すること');

      // タイムライン上で再生ヘッドが 7.0s 直前 (6.99s) と 7.0s 直後 (7.01s) を通過したときの映像ソース時刻
      const localTimeBeforeSplit = (6.99 - part1.startTime) + part1.mediaStart;
      const localTimeAfterSplit = (7.01 - part2.startTime) + part2.mediaStart;

      assert.ok(Math.abs(localTimeAfterSplit - localTimeBeforeSplit - 0.02) < 0.001, '分割境界で映像が0コマのズレもなくシームレスに接続されること');
    });
  });

  // 3. 同一メディアの複数回配置と独立性
  describe('3. 同一メディアの複数回配置・複製時の独立性', () => {
    it('同一メディアから生成された複数クリップは互いに干渉せず独立してトリム・移動できる', () => {
      let state = editorReducer(initialState, {
        type: 'ADD_MEDIA_ITEM',
        item: sampleVideoMedia,
      });

      // 1個目配置
      state = editorReducer(state, {
        type: 'ADD_CLIP_FROM_MEDIA',
        mediaId: sampleVideoMedia.id,
        trackId: 'track-video-1',
        startTime: 0.0,
      });
      const initialClips = state.tracks.find(t => t.id === 'track-video-1')!.clips;
      const clip1 = initialClips.find(c => c.mediaId === sampleVideoMedia.id)!;

      // 2個目配置
      state = editorReducer(state, {
        type: 'ADD_CLIP_FROM_MEDIA',
        mediaId: sampleVideoMedia.id,
        trackId: 'track-video-1',
        startTime: 50.0,
      });
      const clip2 = state.tracks.find(t => t.id === 'track-video-1')!.clips.find(c => c.id !== clip1.id && c.mediaId === sampleVideoMedia.id)!;

      // clip1 のみトリム
      state = editorReducer(state, {
        type: 'TRIM_CLIP',
        clipId: clip1.id,
        newStartTime: 3.0,
        newDuration: 5.0,
      });

      const track = state.tracks.find(t => t.id === 'track-video-1')!;
      const updatedClip1 = track.clips.find(c => c.id === clip1.id)!;
      const updatedClip2 = track.clips.find(c => c.id === clip2.id)!;

      assert.equal(updatedClip1.mediaStart, 3.0);
      assert.equal(updatedClip2.mediaStart, 0, 'clip2 の mediaStart は影響を受けないこと');
      assert.equal(updatedClip2.startTime, 50.0, 'clip2 の startTime は影響を受けないこと');
    });
  });

  // 4. メディア削除とクリップ参照の整合性
  describe('4. メディア削除とクリップ参照の整合性 (Offline Media Resilience)', () => {
    it('メディアライブラリからメディアが削除されてもタイムラインのクリップ構造とプロパティは破壊されない', () => {
      let state = editorReducer(initialState, {
        type: 'ADD_MEDIA_ITEM',
        item: sampleVideoMedia,
      });

      state = editorReducer(state, {
        type: 'ADD_CLIP_FROM_MEDIA',
        mediaId: sampleVideoMedia.id,
        trackId: 'track-video-1',
        startTime: 5.0,
      });

      const clip = state.tracks.find(t => t.id === 'track-video-1')!.clips.find(c => c.mediaId === sampleVideoMedia.id)!;
      assert.ok(clip);

      // メディアライブラリから削除
      state = editorReducer(state, {
        type: 'REMOVE_MEDIA_ITEM',
        id: sampleVideoMedia.id,
      });

      assert.ok(!state.mediaItems.some(m => m.id === sampleVideoMedia.id), 'ライブラリから対象メディアが削除されていること');

      // タイムラインのクリップが残っており、情報が保持されていることを確認
      const survivingClip = state.tracks.find(t => t.id === 'track-video-1')!.clips.find(c => c.id === clip.id)!;
      assert.ok(survivingClip, 'タイムライン上のクリップは破損せず保持されること');
      assert.equal(survivingClip.mediaId, sampleVideoMedia.id);
      assert.equal(survivingClip.startTime, 5.0);
      assert.equal(survivingClip.duration, 15.0);
    });
  });

  // 5. 音声トラックへのメディア配置・トリム
  describe('5. 音声メディア (Audio) のタイムライン配置・トリム整合性', () => {
    it('音声メディアをオーディオトラックに配置して左トリムした際、mediaStart が正しく更新される', () => {
      let state = editorReducer(initialState, {
        type: 'ADD_MEDIA_ITEM',
        item: sampleAudioMedia,
      });

      state = editorReducer(state, {
        type: 'ADD_CLIP_FROM_MEDIA',
        mediaId: sampleAudioMedia.id,
        trackId: 'track-audio-1',
        startTime: 0.0,
      });

      const audioTrack = state.tracks.find(t => t.id === 'track-audio-1')!;
      const audioClip = audioTrack.clips.find(c => c.mediaId === sampleAudioMedia.id)!;

      assert.ok(audioClip, 'オーディオトラックにクリップが配置されること');
      assert.equal(audioClip.duration, 30.0);
      assert.equal(audioClip.mediaStart, 0);

      // 音声の先頭 5秒をトリム
      state = editorReducer(state, {
        type: 'TRIM_CLIP',
        clipId: audioClip.id,
        newStartTime: 5.0,
        newDuration: 25.0,
      });

      const trimmedAudio = state.tracks.find(t => t.id === 'track-audio-1')!.clips.find(c => c.id === audioClip.id)!;
      assert.equal(trimmedAudio.startTime, 5.0);
      assert.equal(trimmedAudio.mediaStart, 5.0, '音声の先頭 5秒がスキップされて再生されること');
    });
  });

  // 6. トランジション・キーフレーム・Undo/Redo との統合整合性
  describe('6. 実メディアクリップに対する Undo/Redo の完全整合性', () => {
    it('ADD_CLIP_FROM_MEDIA -> TRIM_CLIP -> Undo -> Undo で初期状態に完全復帰する', () => {
      let state = editorReducer(initialState, {
        type: 'ADD_MEDIA_ITEM',
        item: sampleVideoMedia,
      });

      const initialStateTrackClipCount = state.tracks[0].clips.length;

      // 配置
      state = editorReducer(state, {
        type: 'ADD_CLIP_FROM_MEDIA',
        mediaId: sampleVideoMedia.id,
        trackId: 'track-video-1',
        startTime: 50.0,
      });
      assert.equal(state.tracks[0].clips.length, initialStateTrackClipCount + 1);

      const placed = state.tracks[0].clips.find(c => c.mediaId === sampleVideoMedia.id)!;

      // トリム (50.0s -> 54.0s, delta=+4.0s)
      state = editorReducer(state, {
        type: 'TRIM_CLIP',
        clipId: placed.id,
        newStartTime: 54.0,
        newDuration: 10.0,
      });
      const trimmed = state.tracks[0].clips.find(c => c.id === placed.id)!;
      assert.equal(trimmed.mediaStart, 4.0);

      // 1回 Undo -> トリム前に復元
      state = editorReducer(state, { type: 'UNDO' });
      const undoneTrim = state.tracks[0].clips.find(c => c.id === placed.id)!;
      assert.equal(undoneTrim.mediaStart, 0);
      assert.equal(undoneTrim.startTime, 50.0);

      // 2回 Undo -> クリップ追加前に復元
      state = editorReducer(state, { type: 'UNDO' });
      assert.equal(state.tracks[0].clips.length, initialStateTrackClipCount);

      // 1回 Redo -> クリップ追加が復帰
      state = editorReducer(state, { type: 'REDO' });
      assert.equal(state.tracks[0].clips.length, initialStateTrackClipCount + 1);

      // 2回 Redo -> トリム状態が復帰
      state = editorReducer(state, { type: 'REDO' });
      const redoneTrim = state.tracks[0].clips.find(c => c.id === placed.id)!;
      assert.equal(redoneTrim.mediaStart, 4.0);
      assert.equal(redoneTrim.startTime, 54.0);
    });
  });
});
