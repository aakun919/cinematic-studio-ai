// Cinematic Studio AI — プロジェクト永続化ストレージ (IndexedDB) (Task 14)
//
// メディア Blob 用の mediaStorage とは別の DB を使う
// (既存 DB のバージョンマイグレーションを避けるため)。
// 保存するのは ProjectFile 1件のみ (キー 'current')。
// 失敗してもアプリ全体は落とさない (mediaStorage と同じ方針)。

import { parseProjectFile } from './projectFile.ts';
import type { ProjectFile } from './projectFile.ts';

const DB_NAME = 'cinematic_studio_ai_project';
const DB_VERSION = 1;
const STORE_NAME = 'project';
const PROJECT_KEY = 'current';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const projectStorage = {
  /** ProjectFile を保存する。成功したら true */
  async saveProject(file: ProjectFile): Promise<boolean> {
    try {
      const db = await openDB();
      return await new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).put(file, PROJECT_KEY);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[ProjectStorage] IndexedDB save failed:', err);
      return false;
    }
  },

  /** 保存済み ProjectFile を読み込む。無い・壊れている場合は null */
  async loadProject(): Promise<ProjectFile | null> {
    try {
      const db = await openDB();
      const raw = await new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(PROJECT_KEY);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return parseProjectFile(raw);
    } catch (err) {
      console.warn('[ProjectStorage] IndexedDB load failed:', err);
      return null;
    }
  },

  /** 保存済みプロジェクトを削除する */
  async clearProject(): Promise<void> {
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).delete(PROJECT_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[ProjectStorage] IndexedDB clear failed:', err);
    }
  },
};
