import { useRef, useEffect } from 'react';
import { ListMusic, X, ChevronUp, ChevronDown, List, AlignJustify, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PlaylistItem, Song } from '@/types/projector';
import { useState } from 'react';
import { getSongSlides } from '@/lib/projectorLayout';

interface PlaylistPanelProps {
  playlist: PlaylistItem[];
  songs: Song[];
  currentItemIndex: number;
  currentVerseIndex: number;
  onGoToItem: (itemIndex: number, verseIndex?: number) => void;
  onRemove: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onClear?: () => void;
}

export function PlaylistPanel({
  playlist, songs, currentItemIndex, currentVerseIndex,
  onGoToItem, onRemove, onMove, onClear,
}: PlaylistPanelProps) {
  const [detailed, setDetailed] = useState(false);
  const activeItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [currentItemIndex, currentVerseIndex]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
          <ListMusic className="w-4 h-4 text-warning" />
          Lista ({playlist.length})
        </h3>
        <div className="flex items-center gap-1">
          {onClear && playlist.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              title="Wyczyść listę"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Wyczyść
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDetailed(!detailed)}
            title={detailed ? 'Widok uproszczony' : 'Widok szczegółowy'}
            className="h-7 w-7 p-0"
          >
            {detailed ? <List className="w-4 h-4" /> : <AlignJustify className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-2 py-2">
        {playlist.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <ListMusic className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>Brak pieśni</p>
            <p className="text-xs mt-1">Kliknij pieśń z bazy aby dodać</p>
          </div>
        )}

        {playlist.map((item, index) => {
          const song = songs.find(s => s.id === item.songId);
          const isActive = index === currentItemIndex;

          return (
            <div
              key={item.id}
              ref={isActive ? activeItemRef : undefined}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-lg mb-1 transition-colors cursor-pointer touch-target",
                isActive
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "hover:bg-panel-hover border border-transparent"
              )}
              onClick={() => onGoToItem(index)}
            >
              <span className={cn(
                "text-xs font-mono w-5 shrink-0 text-center",
                isActive ? "text-primary" : "text-muted-foreground"
              )}>
                {index + 1}
              </span>

              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-sm font-medium truncate",
                  isActive ? "text-primary" : "text-foreground"
                )}>
                  {item.title}
                </p>
                {detailed && song && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {getSongSlides(song).map((s, si) => (
                      <button
                        key={si}
                        onClick={(e) => { e.stopPropagation(); onGoToItem(index, si); }}
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded transition-colors",
                          isActive && si === currentVerseIndex
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {s.verse.label}{s.slideIndex > 0 ? ` (${s.slideIndex + 1})` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); if (index > 0) onMove(index, index - 1); }}
                  className="text-muted-foreground hover:text-foreground p-0.5"
                  disabled={index === 0}
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); if (index < playlist.length - 1) onMove(index, index + 1); }}
                  className="text-muted-foreground hover:text-foreground p-0.5"
                  disabled={index === playlist.length - 1}
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
                className="text-muted-foreground hover:text-destructive p-1 shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
