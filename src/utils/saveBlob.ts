// Cinematic Studio AI — Blob の保存ヘルパー (Package 4)
//
// File System Access API (showSaveFilePicker) が使える環境では
// 保存先を選ばせ、使えない環境 (Safari 等) ではダウンロードに落とす。

type SaveResult = 'saved' | 'downloaded' | 'cancelled';

interface SaveFilePickerWindow {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

export async function saveBlobAs(blob: Blob, filename: string): Promise<SaveResult> {
  const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker;
  if (typeof picker === 'function') {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: 'MP4 Video', accept: { 'video/mp4': ['.mp4'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return 'saved';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled';
      // ピッカーが失敗したらダウンロードにフォールバックする
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
