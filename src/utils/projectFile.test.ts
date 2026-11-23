import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECT_FILE_KIND,
  PROJECT_FILE_VERSION,
  serializeProject,
  parseProjectFile,
  projectToStateSlice,
  sanitizeMediaItemForSave,
} from './projectFile.ts';
import { editorReducer, initialState } from '../store.ts';
import type { EditorState, MediaItem } from '../types.ts';

function localMedia(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'media-local-1',
    name: 'test-sample.mov',
    type: 'video',
    duration: 5,
    thumbnail: 'data:image/jpeg;base64,mock',
    tags: [],
    addedAt: 1700000000000,
    fileSize: 701316,
    mimeType: 'video/quicktime',
    url: 'blob:http://localhost:5173/session-only-url',
    isLocalFile: true,
    loadStatus: 'ready',
    ...overrides,
  };
}

function editedState(): EditorState {
  const withMedia = editorReducer(initialState, { type: 'ADD_MEDIA_ITEM', item: localMedia() });
  const placed = editorReducer(withMedia, { type: 'ADD_CLIP_FROM_MEDIA', mediaId: 'media-local-1' });
  return placed;
}

describe('Task 14 — ProjectFile シリアライズ', () => {
  it('serializeProject は版情報と保存対象を含む', () => {
    const file = serializeProject(editedState(), 1234567890);
    assert.equal(file.kind, PROJECT_FILE_KIND);
    assert.equal(file.version, PROJECT_FILE_VERSION);
    assert.equal(file.savedAt, 1234567890);
    assert.equal(file.projectName, initialState.projectName);
    assert.ok(file.tracks.some(t => t.clips.some(c => c.mediaId === 'media-local-1')));
    assert.ok(Array.isArray(file.transitions));
    assert.ok(Array.isArray(file.keyframes));
    assert.equal(file.exportSettings.format, initialState.exportSettings.format);
  });

  it('MediaItem の Object URL は保存されない (セッション限り)', () => {
    const sanitized = sanitizeMediaItemForSave(localMedia());
    assert.equal(sanitized.url, undefined);
    assert.equal(sanitized.isLocalFile, true);
    assert.equal(sanitized.loadStatus, 'loading');
    assert.equal(sanitized.name, 'test-sample.mov');
  });

  it('シリアライズ→パース→スライスの往復で編集内容が復元される', () => {
    const state = editedState();
    const file = serializeProject(state);
    const parsed = parseProjectFile(JSON.parse(JSON.stringify(file)));
    assert.ok(parsed);
    const slice = projectToStateSlice(parsed);
    assert.deepEqual(slice.tracks, state.tracks);
    assert.deepEqual(slice.transitions, state.transitions);
    assert.deepEqual(slice.keyframes, state.keyframes);
    const restored = slice.mediaItems.find(m => m.id === 'media-local-1');
    assert.ok(restored);
    assert.equal(restored.url, undefined);
    assert.equal(restored.isLocalFile, true);
    assert.ok(slice.totalDuration >= 60);
  });
});

describe('Task 14 — parseProjectFile の検証', () => {
  it('形式が違うデータは null', () => {
    assert.equal(parseProjectFile(null), null);
    assert.equal(parseProjectFile('string'), null);
    assert.equal(parseProjectFile({ kind: 'other', version: 1 }), null);
  });

  it('バージョンが違うファイルは読み込まない', () => {
    const file = serializeProject(initialState);
    assert.equal(parseProjectFile({ ...file, version: 999 }), null);
  });

  it('必須配列が欠けたら null', () => {
    const file = serializeProject(initialState) as unknown as Record<string, unknown>;
    const { tracks: _tracks, ...noTracks } = file;
    assert.equal(parseProjectFile(noTracks), null);
  });

  it('不正な mediaItems 要素だけが落とされる', () => {
    const file = serializeProject(editedState());
    const mixed = {
      ...file,
      mediaItems: [file.mediaItems[0], { id: 123 }, { name: 'no-id' }, null],
    };
    const parsed = parseProjectFile(mixed);
    assert.ok(parsed);
    assert.equal(parsed.mediaItems.length, 1);
    assert.equal(parsed.mediaItems[0].id, file.mediaItems[0].id);
  });
});

describe('Task 14 — store の復元アクション', () => {
  it('RESTORE_PROJECT で編集状態が置き換わり projectRestored が立つ', () => {
    const state = editedState();
    const slice = projectToStateSlice(serializeProject(state));
    const restored = editorReducer(
      { ...initialState, projectRestored: false },
      { type: 'RESTORE_PROJECT', slice },
    );
    assert.equal(restored.projectRestored, true);
    assert.equal(restored.saveStatus, 'saved');
    assert.deepEqual(restored.tracks, state.tracks);
    assert.ok(restored.mediaItems.some(m => m.id === 'media-local-1'));
    assert.deepEqual(restored.past, []);
    assert.equal(restored.isPlaying, false);
  });

  it('PROJECT_RESTORE_DONE は内容を変えずに復元完了だけを立てる', () => {
    const done = editorReducer(initialState, { type: 'PROJECT_RESTORE_DONE' });
    assert.equal(done.projectRestored, true);
    assert.deepEqual(done.tracks, initialState.tracks);
    assert.deepEqual(done.mediaItems, initialState.mediaItems);
  });

  it('初期状態は projectRestored=false (復元前の自動保存を防ぐ)', () => {
    assert.equal(initialState.projectRestored, false);
  });
});
