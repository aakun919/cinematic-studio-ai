import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectMediaType, isFileSupported } from './mediaManager.ts';
import { editorReducer, initialState } from '../store.ts';
import type { MediaItem, EditorState } from '../types.ts';

describe('Task 09 — メディア形式判定 & サポート検証', () => {
  it('動画形式の判定 (MP4, MOV, WebM, M4V)', () => {
    assert.equal(detectMediaType('holiday_beach.mp4', 'video/mp4'), 'video');
    assert.equal(detectMediaType('drone_aerial.mov', 'video/quicktime'), 'video');
    assert.equal(detectMediaType('timelapse.webm', 'video/webm'), 'video');
    assert.equal(detectMediaType('clip.m4v', 'video/x-m4v'), 'video');
    assert.equal(detectMediaType('UPPERCASE.MP4'), 'video');
  });

  it('画像形式の判定 (JPG, JPEG, PNG, WebP, GIF)', () => {
    assert.equal(detectMediaType('photo1.jpg', 'image/jpeg'), 'photo');
    assert.equal(detectMediaType('photo2.jpeg', 'image/jpeg'), 'photo');
    assert.equal(detectMediaType('logo.png', 'image/png'), 'photo');
    assert.equal(detectMediaType('banner.webp', 'image/webp'), 'photo');
    assert.equal(detectMediaType('animation.gif', 'image/gif'), 'photo');
  });

  it('音声形式の判定 (MP3, WAV, AAC, M4A, OGG)', () => {
    assert.equal(detectMediaType('bgm.mp3', 'audio/mpeg'), 'audio');
    assert.equal(detectMediaType('soundeffect.wav', 'audio/wav'), 'audio');
    assert.equal(detectMediaType('voice.aac', 'audio/aac'), 'audio');
    assert.equal(detectMediaType('podcast.m4a', 'audio/m4a'), 'audio');
    assert.equal(detectMediaType('ambient.ogg', 'audio/ogg'), 'audio');
  });

  it('非対応形式および不明な形式は null を返す', () => {
    assert.equal(detectMediaType('document.pdf', 'application/pdf'), null);
    assert.equal(detectMediaType('archive.zip', 'application/zip'), null);
    assert.equal(detectMediaType('script.exe'), null);
    assert.equal(detectMediaType('data.bin'), null);
    assert.equal(isFileSupported({ name: 'doc.pdf', type: 'application/pdf' } as File), false);
    assert.equal(isFileSupported({ name: 'movie.mp4', type: 'video/mp4' } as File), true);
  });
});

describe('Task 09 — Store: メディア登録・重複防止・削除・タイムライン配置', () => {
  const sampleMedia1: MediaItem = {
    id: 'media-test-1',
    name: 'Sunset.mp4',
    type: 'video',
    duration: 15.0,
    thumbnail: 'data:image/jpeg;base64,mock',
    tags: ['imported'],
    addedAt: 1000,
    fileSize: 1024000,
  };

  const sampleMedia2: MediaItem = {
    id: 'media-test-2',
    name: 'Photo.jpg',
    type: 'photo',
    duration: 5.0,
    thumbnail: 'data:image/jpeg;base64,mock',
    tags: ['imported'],
    addedAt: 2000,
    fileSize: 512000,
  };

  it('ADD_MEDIA_ITEM で実メディアが登録される', () => {
    let state: EditorState = { ...initialState, mediaItems: [] };
    state = editorReducer(state, { type: 'ADD_MEDIA_ITEM', item: sampleMedia1 });
    assert.equal(state.mediaItems.length, 1);
    assert.equal(state.mediaItems[0].id, 'media-test-1');
  });

  it('ADD_MEDIA_ITEM で同一ファイル (ID重複または同名・同サイズ) の二重登録が防止される', () => {
    let state: EditorState = { ...initialState, mediaItems: [sampleMedia1] };
    // 同一IDの再登録
    state = editorReducer(state, { type: 'ADD_MEDIA_ITEM', item: sampleMedia1 });
    assert.equal(state.mediaItems.length, 1);

    // 別IDだが同名・同サイズの重複ファイル
    const duplicateFile: MediaItem = {
      ...sampleMedia1,
      id: 'media-test-duplicate',
    };
    state = editorReducer(state, { type: 'ADD_MEDIA_ITEM', item: duplicateFile });
    assert.equal(state.mediaItems.length, 1, '同名・同サイズファイルは二重登録されない');
  });

  it('REMOVE_MEDIA_ITEM でメディアが正常に削除される', () => {
    let state: EditorState = { ...initialState, mediaItems: [sampleMedia1, sampleMedia2] };
    state = editorReducer(state, { type: 'REMOVE_MEDIA_ITEM', id: 'media-test-1' });
    assert.equal(state.mediaItems.length, 1);
    assert.equal(state.mediaItems[0].id, 'media-test-2');
  });

  it('ADD_CLIP_FROM_MEDIA で適切なトラックと時刻にクリップが自動配置される', () => {
    let state: EditorState = {
      ...initialState,
      mediaItems: [sampleMedia1, sampleMedia2],
      currentTime: 12.0,
    };

    // 再生ヘッド位置に配置
    state = editorReducer(state, {
      type: 'ADD_CLIP_FROM_MEDIA',
      mediaId: 'media-test-1',
    });

    // videoトラックにクリップが追加されていること
    const videoTrack = state.tracks.find(t => t.type === 'video')!;
    const addedClip = videoTrack.clips.find(c => c.mediaId === 'media-test-1');
    assert.ok(addedClip, 'videoトラックにクリップが生成されること');
    assert.equal(addedClip.startTime, 12.0, '現在の再生ヘッド位置に配置される');
    assert.equal(addedClip.duration, 15.0, '動画のdurationが反映される');

    // 指定位置 (startTime=2.5) へのドロップ配置
    state = editorReducer(state, {
      type: 'ADD_CLIP_FROM_MEDIA',
      mediaId: 'media-test-2',
      startTime: 2.5,
    });
    const updatedVideoTrack = state.tracks.find(t => t.type === 'video')!;
    const photoClip = updatedVideoTrack.clips.find(c => c.mediaId === 'media-test-2');
    assert.ok(photoClip);
    assert.equal(photoClip.startTime, 2.5);
    assert.equal(photoClip.duration, 5.0, '画像は標準5秒に設定される');
  });
});
