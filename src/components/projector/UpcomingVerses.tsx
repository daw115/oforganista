import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Song, PlaylistItem } from '@/types/projector';
import { useState } from 'react';
import { getSongSlides } from '@/lib/projectorLayout';

interface UpcomingVersesProps {
  currentSong: Song | null;
  currentVerseIndex: number;
  currentItemIndex: number;
  playlist: PlaylistItem[];
  songs: Song[];
  onGoToItem: (itemIndex: number, verseIndex?: number) => void;
}

export function UpcomingVerses({
  currentSong, currentVerseIndex, currentItemIndex,
  playlist, songs, onGoToItem,
}: UpcomingVersesProps) {
  const [expanded, setExpanded] = useState(true);

  let nextText = '';
  let nextLabel = '';

  if (currentSong) {
    const slides = getSongSlides(currentSong);
    if (currentVerseIndex + 1 < slides.length) {
      const next = slides[currentVerseIndex + 1];
      nextLabel = `${currentSong.title} — ${next.verse.label}${next.slideIndex > 0 ? ` (${next.slideIndex + 1})` : ''}`;
      nextText = next.slide.text;
    } else if (currentItemIndex + 1 < playlist.length) {
      const nextSong = songs.find(s => s.id === playlist[currentItemIndex + 1].songId);
      if (nextSong) {
        const nextSlides = getSongSlides(nextSong);
        if (nextSlides.length > 0) {
          nextLabel = `${nextSong.title} — ${nextSlides[0].verse.label}`;
          nextText = nextSlides[0].slide.text;
        }
      }
    }
  } else if (currentItemIndex + 1 < playlist.length) {
    const nextSong = songs.find(s => s.id === playlist[currentItemIndex + 1].songId);
    if (nextSong) {
      const nextSlides = getSongSlides(nextSong);
      if (nextSlides.length > 0) {
        nextLabel = `${nextSong.title} — ${nextSlides[0].verse.label}`;
        nextText = nextSlides[0].slide.text;
      }
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col h-full">
      <button
        onClick={() => setExpanded(!expanded)}
        className="px-4 py-3 border-b border-border flex items-center justify-between hover:bg-panel-hover transition-colors"
      >
        <h3 className="font-semibold text-foreground text-sm">
          Następny slajd
        </h3>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="p-4 flex-1 overflow-auto">
          {nextText ? (
            <div
              className="cursor-pointer rounded-lg bg-panel hover:bg-panel-hover p-3 transition-colors"
              onClick={() => {
                if (currentSong) {
                  const slides = getSongSlides(currentSong);
                  if (currentVerseIndex + 1 < slides.length) {
                    onGoToItem(currentItemIndex, currentVerseIndex + 1);
                  } else if (currentItemIndex + 1 < playlist.length) {
                    onGoToItem(currentItemIndex + 1, 0);
                  }
                } else if (currentItemIndex + 1 < playlist.length) {
                  onGoToItem(currentItemIndex + 1, 0);
                }
              }}
            >
              <p className="text-[10px] text-muted-foreground font-medium mb-1 uppercase tracking-wider">{nextLabel}</p>
              <p className="text-sm text-foreground/80 whitespace-pre-line leading-relaxed">
                {nextText}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              Brak kolejnych slajdów
            </p>
          )}
        </div>
      )}
    </div>
  );
}
