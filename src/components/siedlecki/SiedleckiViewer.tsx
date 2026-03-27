import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSiedlecki, type CustomPageEntry } from '@/hooks/useSiedlecki';
import { useSongbook } from '@/hooks/useSongbook';
import { SiedleckiSidebar } from './SiedleckiSidebar';
import { SiedleckiPageView } from './SiedleckiPageView';
import { AddSongDialog } from './AddSongDialog';
import { ManageSongsDialog } from './ManageSongsDialog';
import { PilotStrip, type PilotProps } from '@/components/projector/PilotStrip';
import { ChevronLeft, ChevronRight, List, X, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  initialPage?: number;
  onClose?: () => void;
  pilot?: PilotProps;
}

export function SiedleckiViewer({ initialPage, onClose, pilot }: Props) {
  const songbook = useSongbook();

  const customPages = useMemo((): CustomPageEntry[] => {
    const entries: CustomPageEntry[] = [];
    for (const song of songbook.songs) {
      for (const page of song.pages) {
        const url = supabase.storage.from('songbook').getPublicUrl(page.image_path).data.publicUrl;
        entries.push({ title: song.title, imageUrl: url });
      }
    }
    return entries;
  }, [songbook.songs]);

  const sb = useSiedlecki(initialPage, customPages);
  const [barsVisible, setBarsVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Auto-enter fullscreen on mount
  useEffect(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  // Auto-hide bars after 3s
  const showBars = useCallback(() => {
    setBarsVisible(true);
    clearTimeout(hideTimerRef.current);
    // Don't auto-hide if sidebar is open
    if (!sb.sidebarVisible) {
      hideTimerRef.current = setTimeout(() => setBarsVisible(false), 3000);
    }
  }, [sb.sidebarVisible]);

  const handleClose = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onClose?.();
  }, [onClose]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === ']') { e.preventDefault(); sb.next(); }
      if (e.key === 'ArrowLeft' || e.key === '[') { e.preventDefault(); sb.prev(); }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); sb.zoomIn(); }
      if (e.key === '-') { e.preventDefault(); sb.zoomOut(); }
      if (e.key === 'Escape') { e.preventDefault(); handleClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sb.next, sb.prev, sb.zoomIn, sb.zoomOut, handleClose]);

  useEffect(() => () => clearTimeout(hideTimerRef.current), []);

  return (
    <div
      className="fixed inset-0 z-50 bg-background flex flex-row"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, [role="button"], input, [role="dialog"], aside')) return;
        if (barsVisible) {
          setBarsVisible(false);
          sb.setSidebarVisible(false);
          clearTimeout(hideTimerRef.current);
        } else {
          showBars();
        }
      }}
    >
      {/* Pilot strip on the left — only when pilot props provided */}
      {pilot && <PilotStrip {...pilot} compact />}

      {/* Main content area */}
      <div className="flex-1 min-w-0 flex flex-col relative">
        {/* Persistent close button — always visible */}
        <button
          onClick={(e) => { e.stopPropagation(); handleClose(); }}
          className="fixed top-3 right-3 z-[60] p-2.5 rounded-xl bg-card/80 backdrop-blur-md border border-border shadow-lg hover:bg-destructive/20 transition-all"
          title="Zamknij śpiewnik (Esc)"
        >
          <X className="w-5 h-5 text-foreground" />
        </button>

        {/* Top bar — shown on click */}
        <div
          className={`fixed top-0 left-0 right-0 flex items-center gap-1.5 px-2 py-1.5 border-b border-border bg-card/90 backdrop-blur-md transition-all duration-300 z-[55] ${
            barsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
          }`}
        >
          <button onClick={(e) => { e.stopPropagation(); sb.toggleSidebar(); clearTimeout(hideTimerRef.current); }} className="p-2 rounded-lg hover:bg-muted transition-colors" title="Spis treści">
            <List className="w-5 h-5 text-foreground" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); sb.prev(); }} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); sb.next(); }} className="p-2 rounded-lg hover:bg-muted transition-colors bg-primary/10">
            <ChevronRight className="w-5 h-5 text-primary" />
          </button>
          <span className="text-xs text-muted-foreground font-mono ml-1">
            {sb.leftPage}–{sb.rightPage} / {sb.totalPages}
          </span>
          <div className="ml-auto flex items-center gap-1 mr-10">
            <AddSongDialog onAdded={songbook.reload} />
            {songbook.songs.length > 0 && (
              <ManageSongsDialog
                songs={songbook.songs}
                onDelete={songbook.deleteSong}
                onUpdate={songbook.updateSong}
              />
            )}
            <button onClick={(e) => { e.stopPropagation(); sb.zoomOut(); }} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <ZoomOut className="w-4 h-4 text-muted-foreground" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); sb.zoomIn(); }} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <ZoomIn className="w-4 h-4 text-muted-foreground" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); sb.zoomFit(); }} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <Maximize className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 relative">
          <SiedleckiSidebar
            visible={sb.sidebarVisible && barsVisible}
            searchQuery={sb.searchQuery}
            onSearchChange={sb.setSearchQuery}
            entries={sb.filteredToc()}
            activePage={sb.activeTocPage()}
            onGoTo={(p) => { sb.goTo(p); sb.setSidebarVisible(false); hideTimerRef.current = setTimeout(() => setBarsVisible(false), 3000); }}
            onClose={() => { sb.setSidebarVisible(false); hideTimerRef.current = setTimeout(() => setBarsVisible(false), 3000); }}
            topOffset="41px"
          />
          <SiedleckiPageView
            leftSrc={sb.leftSrc}
            rightSrc={sb.rightSrc}
            showRight={sb.showRight}
            zoom={sb.zoom}
            animClass={sb.animClass}
            onNext={sb.next}
            onPrev={sb.prev}
            onAutoZoom={sb.setZoom}
          />
        </div>
      </div>
    </div>
  );
}
