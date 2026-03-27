import { useState, useRef, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import {
  BookOpen, FileText, Music, BookOpenCheck, Loader2, GripVertical, X,
  ChevronUp, ChevronDown, Trash2, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Monitor, MonitorOff, Pencil,
} from 'lucide-react';
import type { PlaylistItem, Song } from '@/types/projector';
import { getSongSlides } from '@/lib/projectorLayout';
import { findSlPageForSong, findLiturgiaPdfForSong, slViewerUrl } from '@/lib/songMatcher';
import { loadLiturgy } from '@/lib/liturgyCache';
import type { ReadingsData } from '@/lib/liturgyParsers';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

const SWIPE_THRESHOLD = 80;

function SwipeableRow({ children, onSwipeDelete, className }: {
  children: React.ReactNode;
  onSwipeDelete: () => void;
  className?: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const swiping = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = 0;
    swiping.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const diff = e.touches[0].clientX - startX.current;
    // Only allow swipe left (negative)
    if (diff > 10) return;
    if (Math.abs(diff) > 10) swiping.current = true;
    const clamped = Math.max(diff, -120);
    currentX.current = clamped;
    if (rowRef.current) {
      rowRef.current.style.transform = `translateX(${clamped}px)`;
      rowRef.current.style.transition = 'none';
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!rowRef.current) return;
    if (currentX.current < -SWIPE_THRESHOLD) {
      // Animate out and delete
      rowRef.current.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out';
      rowRef.current.style.transform = 'translateX(-100%)';
      rowRef.current.style.opacity = '0';
      setTimeout(onSwipeDelete, 200);
    } else {
      // Snap back
      rowRef.current.style.transition = 'transform 200ms ease-out';
      rowRef.current.style.transform = 'translateX(0)';
    }
    currentX.current = 0;
    swiping.current = false;
  }, [onSwipeDelete]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (swiping.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Delete background */}
      <div className="absolute inset-0 flex items-center justify-end px-4 bg-destructive/15 rounded-lg">
        <Trash2 className="w-4 h-4 text-destructive" />
      </div>
      <div
        ref={rowRef}
        className={className}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClickCapture={handleClick}
        style={{ position: 'relative', zIndex: 1, background: 'inherit' }}
      >
        {children}
      </div>
    </div>
  );
}

function ReadingsContent({ html, loading }: { html: string; loading: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || loading) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const title = target.closest('.readings-section-title') as HTMLElement | null;
      if (!title) return;

      title.classList.toggle('collapsed');
      // Toggle visibility of all siblings until next section title
      let sibling = title.nextElementSibling as HTMLElement | null;
      while (sibling && !sibling.classList.contains('readings-section-title')) {
        const isCollapsed = title.classList.contains('collapsed');
        sibling.style.display = isCollapsed ? 'none' : '';
        sibling = sibling.nextElementSibling as HTMLElement | null;
      }
    };

    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [html, loading]);

  if (loading) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }




  return (
    <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
      <div
        className="liturgy-content prose prose-sm max-w-none dark:prose-invert text-foreground leading-relaxed"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
      />
    </div>
  );
}

interface SongbookPanelProps {
  playlist: PlaylistItem[];
  songs: Song[];
  currentItemIndex: number;
  currentVerseIndex: number;
  onOpenSongbook: (url: string) => void;
  onGoToItem: (itemIndex: number, verseIndex?: number) => void;
  onRemove: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onClear?: () => void;
  onEditSong?: (song: Song) => void;
  onNextSlide?: () => void;
  onPrevSlide?: () => void;
  onNextSong?: () => void;
  onPrevSong?: () => void;
  onToggleLive?: () => void;
  isLive?: boolean;
  currentSongTitle?: string;
  slideInfo?: string;
}

export function SongbookPanel({
  playlist, songs, currentItemIndex, currentVerseIndex,
  onOpenSongbook, onGoToItem, onRemove, onMove, onClear, onEditSong,
  onNextSlide, onPrevSlide, onNextSong, onPrevSong, onToggleLive,
  isLive, currentSongTitle, slideInfo,
}: SongbookPanelProps) {
  const isMobile = useIsMobile();
  const [readingsDialog, setReadingsDialog] = useState<{ open: boolean; html: string; title: string; loading: boolean }>({
    open: false, html: '', title: '', loading: false,
  });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragCounter = useRef(0);
  const activeItemRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to keep current item near top so next items are visible
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [currentItemIndex, currentVerseIndex]);

  const openReadings = async (item: PlaylistItem) => {
    setReadingsDialog({ open: true, html: '', title: item.title, loading: true });
    try {
      const date = item.litDate ? new Date(item.litDate + 'T12:00:00') : new Date();
      const result = await loadLiturgy(date, 'readings');
      const rd = result.data as ReadingsData;
      const fullHtml = rd?.options?.[0]?.contentHtml || '';
      setReadingsDialog({ open: true, html: fullHtml || '<p>Brak danych czytań</p>', title: item.title, loading: false });
    } catch {
      setReadingsDialog({ open: true, html: '<p>Błąd pobierania czytań</p>', title: item.title, loading: false });
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    dragCounter.current++;
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setDragOverIndex(null);
      dragCounter.current = 0;
    }
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    dragCounter.current = 0;
    if (dragIndex !== null && dragIndex !== toIndex) {
      onMove(dragIndex, toIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
    dragCounter.current = 0;
  };

  if (playlist.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card h-full flex items-center justify-center">
        <div className="text-center">
          <Music className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Dodaj pieśni do listy</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Odnośniki do śpiewnika pojawią się tutaj</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col h-full">
        {/* Header with clear button */}
        <div className="px-3 py-2 border-b border-border flex items-center justify-between shrink-0">
          <h3 className="font-semibold text-foreground flex items-center gap-2 text-xs">
            <BookOpen className="w-3.5 h-3.5 text-primary" />
            Plan ({playlist.length})
          </h3>
          {onClear && playlist.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              title="Wyczyść listę"
              className="h-6 px-2 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Wyczyść
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-auto px-2 py-1 space-y-0.5">
          {playlist.map((item, index) => {
            const song = songs.find(s => s.id === item.songId);
            const title = song?.title || item.title;
            const slPage = findSlPageForSong(title);
            const pdfUrl = findLiturgiaPdfForSong(title);
            const isCurrent = index === currentItemIndex;
            const isDragging = dragIndex === index;
            const isDragOver = dragOverIndex === index && dragIndex !== index;

            const rowContent = (
              <div
                ref={isCurrent ? activeItemRef : undefined}
                {...(!isMobile ? {
                  draggable: true,
                  onDragStart: (e: React.DragEvent) => handleDragStart(e, index),
                  onDragOver: handleDragOver,
                  onDragEnter: (e: React.DragEvent) => handleDragEnter(e, index),
                  onDragLeave: handleDragLeave,
                  onDrop: (e: React.DragEvent) => handleDrop(e, index),
                  onDragEnd: handleDragEnd,
                } : {})}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-all cursor-pointer bg-card",
                  item.isPsalm && isCurrent && "bg-amber-500/10 border border-amber-500/20",
                  item.isPsalm && !isCurrent && "hover:bg-amber-500/5 border border-transparent",
                  !item.isPsalm && isCurrent && "bg-primary/10 border border-primary/20",
                  !item.isPsalm && !isCurrent && "hover:bg-muted/30 border border-transparent",
                  isDragging && "opacity-40",
                  isDragOver && "border-primary border-dashed bg-primary/5",
                )}
                onClick={() => onGoToItem(index)}
              >
                {/* Drag handle — desktop only */}
                {!isMobile && (
                  <div className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground/50 hover:text-muted-foreground touch-none">
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>
                )}

                <span className={cn(
                  "text-[10px] font-mono shrink-0 w-4 text-center",
                  isCurrent ? (item.isPsalm ? "text-amber-600 dark:text-amber-400 font-bold" : "text-primary font-bold") : "text-muted-foreground"
                )}>
                  {index + 1}
                </span>

                <div className="flex-1 min-w-0">
                  <span className={cn(
                    "text-xs truncate block",
                    item.isPsalm ? "text-amber-600 dark:text-amber-400 font-bold" : (isCurrent ? "text-foreground font-medium" : "text-foreground")
                  )}>
                    {title}
                  </span>
                  {isCurrent && song && (
                    <span className="text-[10px] text-muted-foreground mt-0.5 block">
                      Slajd {currentVerseIndex + 1}/{getSongSlides(song).length}
                    </span>
                  )}
                </div>

                {/* Songbook links */}
                <div className="flex items-center gap-1 shrink-0">
                  {item.isPsalm && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openReadings(item); }}
                      className="p-1 rounded text-muted-foreground hover:text-accent-foreground hover:bg-accent transition-colors"
                      title="Pokaż czytania"
                    >
                      <BookOpenCheck className="w-4 h-4" />
                    </button>
                  )}
                  {item.isPsalm && item.litDate && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const date = new Date(item.litDate + 'T12:00:00');
                        const url = `https://niezbednik.niedziela.pl/liturgia/${item.litDate}`;
                        onOpenSongbook(url);
                      }}
                      className="p-1 rounded text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                      title="Otwórz liturgię w ramce"
                    >
                      <BookOpen className="w-4 h-4" />
                    </button>
                  )}
                  {slPage && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onOpenSongbook(slViewerUrl(slPage)); }}
                      className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      title={`Śpiewnik Liturgiczny — str. ${slPage}`}
                    >
                      <BookOpen className="w-4 h-4" />
                    </button>
                  )}
                  {pdfUrl && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onOpenSongbook(`https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(pdfUrl)}`); }}
                      className="p-1 rounded text-muted-foreground hover:text-accent-foreground hover:bg-accent transition-colors"
                      title="Nuty PDF"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                  )}
                  {onEditSong && song && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditSong(song); }}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Edytuj pieśń"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Move buttons — desktop only */}
                {!isMobile && (
                  <div className="flex flex-col gap-0 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); if (index > 0) onMove(index, index - 1); }}
                      className="text-muted-foreground hover:text-foreground p-0"
                      disabled={index === 0}
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (index < playlist.length - 1) onMove(index, index + 1); }}
                      className="text-muted-foreground hover:text-foreground p-0"
                      disabled={index === playlist.length - 1}
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Remove — desktop only */}
                {!isMobile && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
                    className="text-muted-foreground hover:text-destructive p-0.5 shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );

            return isMobile ? (
              <SwipeableRow key={item.id} onSwipeDelete={() => onRemove(item.id)}>
                {rowContent}
              </SwipeableRow>
            ) : (
              <div key={item.id}>{rowContent}</div>
            );
          })}
        </div>
      </div>

      <Dialog open={readingsDialog.open} onOpenChange={(open) => setReadingsDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-3xl w-[95vw] h-[85vh] flex flex-row p-0 gap-0">
          {/* Pilot — left strip */}
          {onNextSlide && (
            <div className="w-16 shrink-0 border-r border-border bg-muted/30 flex flex-col items-center justify-center gap-2 py-3">
              {currentSongTitle && (
                <div className="text-[9px] text-muted-foreground text-center px-1 truncate w-full mb-1" title={currentSongTitle}>
                  {slideInfo}
                </div>
              )}
              <button onClick={onPrevSong} className="flex flex-col items-center justify-center rounded-lg border border-muted-foreground/30 bg-card p-2 hover:bg-muted/30 active:scale-95 transition-all" title="Poprzednia pieśń">
                <ChevronsLeft className="h-5 w-5 text-muted-foreground" />
              </button>
              <button onClick={onPrevSlide} className="flex flex-col items-center justify-center rounded-lg border border-destructive/40 bg-card p-2 hover:bg-destructive/10 active:scale-95 transition-all" title="Poprzedni slajd">
                <ChevronLeft className="h-5 w-5 text-destructive" />
              </button>
              <button onClick={onToggleLive} className={cn(
                "flex flex-col items-center justify-center rounded-lg border p-2 active:scale-95 transition-all",
                isLive ? "border-primary/40 bg-primary/10 text-primary" : "border-muted/40 bg-muted/10 text-muted-foreground"
              )} title={isLive ? 'Wyłącz ekran' : 'Włącz ekran'}>
                {isLive ? <Monitor className="h-5 w-5" /> : <MonitorOff className="h-5 w-5" />}
              </button>
              <button onClick={onNextSlide} className="flex flex-col items-center justify-center rounded-lg border border-success/40 bg-card p-2 hover:bg-success/10 active:scale-95 transition-all" title="Następny slajd">
                <ChevronRight className="h-5 w-5 text-success" />
              </button>
              <button onClick={onNextSong} className="flex flex-col items-center justify-center rounded-lg border border-muted-foreground/30 bg-card p-2 hover:bg-muted/30 active:scale-95 transition-all" title="Następna pieśń">
                <ChevronsRight className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 flex flex-col min-w-0">
            <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
              <DialogTitle className="text-sm flex items-center gap-2">
                <BookOpenCheck className="w-4 h-4 text-primary" />
                {readingsDialog.title}
              </DialogTitle>
            </DialogHeader>
            <ReadingsContent html={readingsDialog.html} loading={readingsDialog.loading} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
