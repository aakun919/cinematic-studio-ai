// Cinematic Studio AI — メインアプリケーション

import './App.css';
import { EditorProvider } from './store.ts';
import { TopBar } from './components/TopBar.tsx';
import { MediaLibrary } from './components/MediaLibrary.tsx';
import { PreviewPanel } from './components/PreviewPanel.tsx';
import { InspectorPanel } from './components/InspectorPanel.tsx';
import { Timeline } from './components/Timeline.tsx';
import { AIPanel } from './components/AIPanel.tsx';
import { ExportModal } from './components/ExportModal.tsx';

function MainEditor() {
  return (
    <div className="app-root">
      {/* 1. Top Bar */}
      <TopBar />

      {/* 2. Media Library (Left) */}
      <MediaLibrary />

      {/* 3. Preview (Center) */}
      <PreviewPanel />

      {/* 4. Inspector (Right) */}
      <InspectorPanel />

      {/* 5. Timeline (Bottom) */}
      <Timeline />

      {/* Overlays / Modals */}
      <AIPanel />
      <ExportModal />
    </div>
  );
}

export default function App() {
  return (
    <EditorProvider>
      <MainEditor />
    </EditorProvider>
  );
}
