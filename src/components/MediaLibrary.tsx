// MediaLibrary — メディアライブラリパネル (実ファイル読込・ドラッグ＆ドロップ・一覧/グリッド切替・タイムライン配置)

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../store.ts';
import type { MediaItem, MediaType, SortBy } from '../types.ts';
import { processMediaFile, revokeMediaUrl } from '../utils/mediaManager.ts';
import { mediaStorage } from '../utils/mediaStorage.ts';

// ── ユーティリティ ────────────────────────────────────────────

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── SVG Icons ────────────────────────────────────────────────

function IconVideo() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>
  );
}

function IconPhoto() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}

function IconAudio() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  );
}

function IconList() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  );
}

// ── Media Card (Grid View) ───────────────────────────────────

interface MediaCardProps {
  item: MediaItem;
  selected: boolean;
  onSelect: (id: string) => void;
  onAddToTimeline: (id: string) => void;
  onRemove: (id: string) => void;
}

function MediaCard({ item, selected, onSelect, onAddToTimeline, onRemove }: MediaCardProps) {
  const [hovered, setHovered] = useState(false);

  const audioBarHeights = useMemo(() => {
    if (item.type !== 'audio') return [];
    return Array.from({ length: 20 }, (_, i) => {
      const base = Math.sin(i * 0.8) * 0.5 + 0.5;
      return Math.round(15 + base * 55);
    });
  }, [item.type]);

  const isDataUrlOrHttp = item.thumbnail.startsWith('data:') || item.thumbnail.startsWith('blob:') || item.thumbnail.startsWith('http');

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ mediaId: item.id, type: item.type }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      className={`media-card${selected ? ' selected' : ''}`}
      onClick={() => onSelect(item.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={0}
      aria-selected={selected}
      draggable
      onDragStart={handleDragStart}
      onKeyDown={e => e.key === 'Enter' && onSelect(item.id)}
    >
      {/* Thumbnail */}
      <div
        className="media-thumb"
        style={{
          background: isDataUrlOrHttp ? '#0b0b10' : item.thumbnail,
          backgroundImage: isDataUrlOrHttp ? `url("${item.thumbnail}")` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Audio: waveform */}
        {item.type === 'audio' && (
          <div className="audio-waveform" style={{ color: '#22c55e' }}>
            {audioBarHeights.map((h, i) => (
              <div key={i} className="audio-bar" style={{ height: `${h}%` }} />
            ))}
          </div>
        )}

        {/* Type icon */}
        <div className="media-type-icon">
          {item.type === 'video' && <IconVideo />}
          {item.type === 'photo' && <IconPhoto />}
          {item.type === 'audio' && <IconAudio />}
        </div>

        {/* Duration badge */}
        <div className="media-duration-badge">
          {formatDuration(item.duration)}
        </div>

        {/* Hover overlay actions */}
        {hovered && (
          <div className="media-thumb-overlay" style={{ background: 'rgba(0,0,0,0.65)', display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
            <button
              className="media-overlay-btn"
              title="Add to timeline"
              onClick={(e) => {
                e.stopPropagation();
                onAddToTimeline(item.id);
              }}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <IconPlus /> Add
            </button>
            {item.isLocalFile && (
              <button
                className="media-overlay-btn"
                title="Remove media"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item.id);
                }}
                style={{
                  background: 'rgba(239, 68, 68, 0.8)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 6px',
                  cursor: 'pointer',
                }}
              >
                <IconTrash />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="media-card-info">
        <div className="media-card-name" title={item.name}>{item.name}</div>
        <div className="media-card-meta">
          {item.width && item.height ? `${item.width}x${item.height} · ` : ''}
          {item.fileSize ? `${formatFileSize(item.fileSize)} · ` : ''}
          {formatDuration(item.duration)}
        </div>
      </div>
    </div>
  );
}

// ── Media List Row (List View) ────────────────────────────────

interface MediaListRowProps {
  item: MediaItem;
  selected: boolean;
  onSelect: (id: string) => void;
  onAddToTimeline: (id: string) => void;
  onRemove: (id: string) => void;
}

function MediaListRow({ item, selected, onSelect, onAddToTimeline, onRemove }: MediaListRowProps) {
  const isDataUrlOrHttp = item.thumbnail.startsWith('data:') || item.thumbnail.startsWith('blob:') || item.thumbnail.startsWith('http');

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ mediaId: item.id, type: item.type }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      className={`media-list-row${selected ? ' selected' : ''}`}
      onClick={() => onSelect(item.id)}
      draggable
      onDragStart={handleDragStart}
    >
      <div
        className="media-list-thumb"
        style={{
          background: isDataUrlOrHttp ? '#0b0b10' : item.thumbnail,
          backgroundImage: isDataUrlOrHttp ? `url("${item.thumbnail}")` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <div className="media-list-details">
        <div className="media-list-name" title={item.name}>{item.name}</div>
        <div className="media-list-meta">
          <span className="media-meta-badge">{item.type.toUpperCase()}</span>
          <span>{formatDuration(item.duration)}</span>
          {item.width && item.height && <span>{item.width}×{item.height}</span>}
          {item.fileSize && <span>{formatFileSize(item.fileSize)}</span>}
        </div>
      </div>
      <div className="media-list-actions">
        <button
          className="media-row-action-btn"
          title="Add to timeline"
          onClick={(e) => {
            e.stopPropagation();
            onAddToTimeline(item.id);
          }}
        >
          <IconPlus />
        </button>
        {item.isLocalFile && (
          <button
            className="media-row-action-btn delete"
            title="Remove media"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(item.id);
            }}
          >
            <IconTrash />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Media Library ─────────────────────────────────────────────

const TABS: { key: MediaType; label: string; icon: React.ReactNode }[] = [
  { key: 'video', label: 'Video', icon: <IconVideo /> },
  { key: 'photo', label: 'Photo', icon: <IconPhoto /> },
  { key: 'audio', label: 'Audio', icon: <IconAudio /> },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'date', label: 'Date Added' },
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'duration', label: 'Duration' },
];

export function MediaLibrary() {
  const { state, dispatch } = useEditorStore();
  const { mediaItems, activeMediaTab, mediaSearch, mediaSortBy } = state;

  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [importStatus, setImportStatus] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 初回マウント時に IndexedDB 内の実メディアBlobから ObjectURL を再生成して復元
  useEffect(() => {
    let active = true;
    const restoreBlobs = async () => {
      for (const item of mediaItems) {
        if (item.isLocalFile && !item.url) {
          const blob = await mediaStorage.getBlob(item.id);
          if (blob && active) {
            const url = URL.createObjectURL(blob);
            dispatch({ type: 'UPDATE_MEDIA_URL', id: item.id, url });
          }
        }
      }
    };
    restoreBlobs();
    return () => {
      active = false;
    };
  }, [mediaItems, dispatch]);

  const filteredItems = useMemo(() => {
    let list = mediaItems.filter(item => item.type === activeMediaTab);

    if (mediaSearch.trim()) {
      const q = mediaSearch.toLowerCase();
      list = list.filter(item =>
        item.name.toLowerCase().includes(q) || item.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    return [...list].sort((a, b) => {
      if (mediaSortBy === 'name') return a.name.localeCompare(b.name);
      if (mediaSortBy === 'duration') return b.duration - a.duration;
      return b.addedAt - a.addedAt;
    });
  }, [mediaItems, activeMediaTab, mediaSearch, mediaSortBy]);

  const handleSelect = (id: string) => {
    setSelectedMediaId(id);
  };

  const handleAddToTimeline = (mediaId: string) => {
    dispatch({ type: 'ADD_CLIP_FROM_MEDIA', mediaId });
  };

  const handleRemoveMedia = (mediaId: string) => {
    revokeMediaUrl(mediaId);
    mediaStorage.deleteBlob(mediaId);
    dispatch({ type: 'REMOVE_MEDIA_ITEM', id: mediaId });
    if (selectedMediaId === mediaId) {
      setSelectedMediaId(null);
    }
  };

  // ファイル読込処理の共通ハンドラ
  const handleImportFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    setImportStatus({ message: `Importing ${files.length} file(s)...`, type: 'info' });

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const result = await processMediaFile(file);
      if (result.success && result.item) {
        dispatch({ type: 'ADD_MEDIA_ITEM', item: result.item });
        successCount++;
      } else {
        failCount++;
        if (result.error) errors.push(result.error);
      }
    }

    if (failCount === 0) {
      setImportStatus({ message: `Successfully imported ${successCount} file(s)`, type: 'success' });
    } else if (successCount > 0) {
      setImportStatus({
        message: `Imported ${successCount} file(s). ${failCount} failed: ${errors[0] || 'Unsupported format'}`,
        type: 'error',
      });
    } else {
      setImportStatus({
        message: `Failed to import: ${errors[0] || 'Unsupported format'}`,
        type: 'error',
      });
    }

    setTimeout(() => {
      setImportStatus(null);
    }, 4500);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleImportFiles(e.target.files);
      e.target.value = '';
    }
  };

  // ドラッグ＆ドロップ受け付け
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImportFiles(e.dataTransfer.files);
    }
  };

  return (
    <aside
      className={`media-library${isDraggingOver ? ' drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 隠しファイル入力 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp,image/gif,audio/mp3,audio/wav,audio/aac,audio/m4a,audio/ogg"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      {/* Tabs & View Switch */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 8 }}>
        <div className="media-tabs" role="tablist">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`media-tab${activeMediaTab === tab.key ? ' active' : ''}`}
              onClick={() => dispatch({ type: 'SET_ACTIVE_MEDIA_TAB', tab: tab.key })}
              role="tab"
              aria-selected={activeMediaTab === tab.key}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="media-view-toggle">
          <button
            className={`media-view-btn${viewMode === 'grid' ? ' active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid View"
          >
            <IconGrid />
          </button>
          <button
            className={`media-view-btn${viewMode === 'list' ? ' active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List View"
          >
            <IconList />
          </button>
        </div>
      </div>

      {/* Search & Sort */}
      <div className="media-search-row">
        <div className="media-search-input-wrap">
          <IconSearch />
          <input
            className="media-search-input"
            type="text"
            placeholder="Search clips…"
            value={mediaSearch}
            onChange={e => dispatch({ type: 'SET_MEDIA_SEARCH', search: e.target.value })}
            aria-label="Search media"
          />
          {mediaSearch && (
            <button
              className="media-search-clear"
              onClick={() => dispatch({ type: 'SET_MEDIA_SEARCH', search: '' })}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <select
          className="media-sort-select"
          value={mediaSortBy}
          onChange={e => dispatch({ type: 'SET_MEDIA_SORT', sortBy: e.target.value as SortBy })}
          aria-label="Sort media"
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Import Status Toast */}
      {importStatus && (
        <div className={`media-import-status ${importStatus.type}`}>
          {importStatus.message}
        </div>
      )}

      {/* Drag & Drop Visual Hint */}
      {isDraggingOver && (
        <div className="media-dropzone-overlay">
          <div className="media-dropzone-box">
            <IconPlus />
            <span>Drop Media Files to Import</span>
          </div>
        </div>
      )}

      {/* Content Area (Grid or List) */}
      {viewMode === 'grid' ? (
        <div className="media-grid" role="listbox" aria-label="Media items">
          {filteredItems.length === 0 ? (
            <div style={{
              gridColumn: '1/-1',
              textAlign: 'center',
              padding: '36px 16px',
              color: 'var(--text-muted)',
              fontSize: '12px',
              lineHeight: 1.8,
            }}>
              {mediaSearch ? `No clips found for "${mediaSearch}"` : 'No media in this category'}
            </div>
          ) : (
            filteredItems.map(item => (
              <MediaCard
                key={item.id}
                item={item}
                selected={selectedMediaId === item.id}
                onSelect={handleSelect}
                onAddToTimeline={handleAddToTimeline}
                onRemove={handleRemoveMedia}
              />
            ))
          )}
        </div>
      ) : (
        <div className="media-list" role="listbox" aria-label="Media list items">
          {filteredItems.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '36px 16px',
              color: 'var(--text-muted)',
              fontSize: '12px',
            }}>
              {mediaSearch ? `No clips found for "${mediaSearch}"` : 'No media in this category'}
            </div>
          ) : (
            filteredItems.map(item => (
              <MediaListRow
                key={item.id}
                item={item}
                selected={selectedMediaId === item.id}
                onSelect={handleSelect}
                onAddToTimeline={handleAddToTimeline}
                onRemove={handleRemoveMedia}
              />
            ))
          )}
        </div>
      )}

      {/* Import Media Button */}
      <button
        className="media-add-btn"
        onClick={() => fileInputRef.current?.click()}
        aria-label="Import Media"
      >
        <IconPlus />
        <span>Import Media</span>
      </button>
    </aside>
  );
}
