// Cinematic Studio AI — メディア永続化ストレージ (IndexedDB)
// 将来の Tauri 2 ではネイティブファイルシステムに差し替え可能なRepository設計

const DB_NAME = 'cinematic_studio_ai_media';
const DB_VERSION = 1;
const STORE_NAME = 'media_blobs';

export interface StoredMediaBlob {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  blob: Blob;
  updatedAt: number;
}

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
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const mediaStorage = {
  async saveBlob(id: string, name: string, mimeType: string, blob: Blob): Promise<void> {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record: StoredMediaBlob = {
          id,
          name,
          mimeType,
          size: blob.size,
          blob,
          updatedAt: Date.now(),
        };
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[MediaStorage] IndexedDB save failed:', err);
      // IndexedDB がクォータ制限等で失敗してもアプリ全体は落とさない
    }
  },

  async getBlob(id: string): Promise<Blob | null> {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => {
          const res = req.result as StoredMediaBlob | undefined;
          resolve(res ? res.blob : null);
        };
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[MediaStorage] IndexedDB get failed:', err);
      return null;
    }
  },

  async deleteBlob(id: string): Promise<void> {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[MediaStorage] IndexedDB delete failed:', err);
    }
  },

  async getAllIds(): Promise<string[]> {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result as string[]);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[MediaStorage] IndexedDB getAllKeys failed:', err);
      return [];
    }
  },
};
