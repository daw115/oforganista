import { useEffect, useCallback, useRef, useState } from 'react';
import { useSiedlecki } from '@/hooks/useSiedlecki';
import { SiedleckiSidebar } from '@/components/siedlecki/SiedleckiSidebar';
import { PilotStrip, type PilotProps } from './PilotStrip';
import {
  ChevronLeft, ChevronRight,
  X, List, ZoomIn, ZoomOut, Maximize,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const SL_VIEWER_PREFIX = 'https://build-your-songbook.lovable.app/';

interface Props {
  url: string;
  onClose: () => void;
  pilot: PilotProps;
}

export function ProjectorSongbookOverlay({ url, onClose, pilot }: Props) {
  const isSiedlecki = url.startsWith(SL_VIEWER_PREFIX);
  const initialPage = isSiedlecki ? parseInt(new URL(url).searchParams.get('page') || '1', 10) : undefined;
  const sb = useSiedlecki(initialPage);
  const [barsVisible, setBarsVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Enter fullscreen
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

  const handleClose = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onClose();
  }, [onClose]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); handleClose(); }
      if (!isSiedlecki) return;
      const tag = (document.activeElement?.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === ']') { e.preventDefault(); sb.next(); }
      if (e.key === 'ArrowLeft' || e.key === '[') { e.preventDefault(); sb.prev(); }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); sb.zoomIn(); }
      if (e.key === '-') { e.preventDefault(); sb.zoomOut(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isSiedlecki, sb.next, sb.prev, sb.zoomIn, sb.zoomOut, handleClose]);

  const showBars = useCallback(() => {
    setBarsVisible(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setBarsVisible(false), 3000);
  }, []);

  useEffect(() => () => clearTimeout(hideTimerRef.current), []);

  const toggleBars = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, [role="button"], input')) return;
    if (barsVisible) {
      setBarsVisible(false);
      clearTimeout(hideTimerRef.current);
    } else {
      showBars();
    }
  }, [barsVisible, showBars]);

  if (!isSiedlecki) {
    // PDF / external URL — fullscreen iframe with pilot
    return (
      <div className="fixed inset-0 z-50 flex flex-row bg-background">
        <PilotStrip {...pilot} />
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-end px-4 py-2 border-b border-border bg-card shrink-0">
            <button onClick={handleClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs font-medium transition-colors">
              <X className="w-3.5 h-3.5" /> Zamknij
            </button>
          </div>
          <div className="flex-1 relative overflow-hidden">
            <iframe src={url} className="absolute inset-0 w-full h-full border-0" />
          </div>
        </div>
      </div>
    );
  }

  // Siedlecki native viewer with pilot

  return (
    <div className="fixed inset-0 z-50 flex flex-row bg-background" onClick={toggleBars}>
      {/* Pilot — fills space from left edge to pages */}
      <PilotStrip {...pilot} />

      {/* Pages — fitted to screen height, shrink-to-fit width */}
      <div className="h-full shrink-0 flex items-center gap-[0.5vh] py-[0.5vh] pr-[0.5vh]">
        <div className={`h-[99vh] ${sb.animClass.left}`}>
          <img
            src={sb.leftSrc}
            alt="Strona lewa"
            className="h-full w-auto rounded-lg shadow-[0_8px_30px_rgba(0,0,0,0.4)] bg-white"
            loading="eager"
          />
        </div>
        {sb.showRight && (
          <div className={`h-[99vh] max-[768px]:hidden ${sb.animClass.right}`}>
            <img
              src={sb.rightSrc}
              alt="Strona prawa"
              className="h-full w-auto rounded-lg shadow-[0_8px_30px_rgba(0,0,0,0.4)] bg-white"
              loading="eager"
            />
          </div>
        )}
      </div>

      {/* Close button — always visible */}
      <button
        onClick={(e) => { e.stopPropagation(); handleClose(); }}
        className="fixed top-3 right-3 z-[60] p-2.5 rounded-xl bg-card/80 backdrop-blur-md border border-border shadow-lg hover:bg-destructive/20 transition-all"
        title="Zamknij śpiewnik (Esc)"
      >
        <X className="w-5 h-5 text-foreground" />
      </button>

      {/* Top bar — auto-hide */}
      <div
        className={cn(
          "fixed top-0 left-0 right-0 flex items-center gap-1.5 px-2 py-1.5 border-b border-border bg-card/90 backdrop-blur-md transition-all duration-300 z-[55]",
          barsVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none"
        )}
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
        <div className="ml-auto flex items-center gap-1 mr-12">
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

      {/* Sidebar */}
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
    </div>
  );
}
