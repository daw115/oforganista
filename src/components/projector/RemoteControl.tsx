import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Monitor, MonitorOff,
} from 'lucide-react';
import type { useProjector } from '@/hooks/useProjector';
import type { ActiveRemote } from '@/components/settings/SettingsPanel';
import { getSongSlides } from '@/lib/projectorLayout';

type ProjectorHook = ReturnType<typeof useProjector>;

interface RemoteControlProps {
  activeRemote: ActiveRemote;
  projector: ProjectorHook;
}

export function RemoteControl({ activeRemote, projector }: RemoteControlProps) {
  if (!activeRemote) return null;

  const handlePrev = () => projector.prevSlide();
  const handleNext = () => projector.nextSlide();
  const handlePrevSong = () => {
    const { currentItemIndex } = projector.state;
    if (currentItemIndex > 0) projector.goToItem(currentItemIndex - 1);
  };
  const handleNextSong = () => {
    const { currentItemIndex, playlist } = projector.state;
    if (currentItemIndex < playlist.length - 1) projector.goToItem(currentItemIndex + 1);
  };
  const handleToggleLive = () => projector.toggleLive();

  const isLive = projector.state.isLive;

  const song = projector.directSong || projector.currentSong;
  const title = song?.title || '';
  const vi = projector.directSong ? projector.directVerseIndex : projector.state.currentVerseIndex;
  const total = song ? getSongSlides(song).length : 0;
  const slideInfo = total > 0 ? `${vi + 1}/${total}` : '';

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Header with status */}
      <div className="flex items-center gap-2 px-1">
        <div className={`w-3 h-3 rounded-full shrink-0 ${isLive ? 'bg-success animate-pulse' : 'bg-warning'}`} />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rzutnik</span>
      </div>

      {/* Current song info */}
      {title && (
        <div className="text-xs text-foreground font-medium truncate px-1">
          {title} <span className="text-muted-foreground">{slideInfo}</span>
        </div>
      )}

      {/* 5 large buttons — Next slide first (leftmost) */}
      <div className="grid grid-cols-5 gap-1">
        <button onClick={handleNext} className="flex flex-col items-center justify-center rounded-xl border-2 border-success/40 bg-card py-4 hover:bg-success/10 active:scale-95 transition-all" title="Następny slajd">
          <ChevronRight className="h-9 w-9 text-success" />
          <span className="text-[10px] font-semibold text-success mt-1">Slajd ▶</span>
        </button>
        <button onClick={handleNextSong} className="flex flex-col items-center justify-center rounded-xl border-2 border-muted-foreground/30 bg-card py-4 hover:bg-muted/30 active:scale-95 transition-all" title="Następna pieśń">
          <ChevronsRight className="h-9 w-9 text-muted-foreground" />
          <span className="text-[10px] font-semibold text-muted-foreground mt-1">Pieśń ▶▶</span>
        </button>
        <button onClick={handleToggleLive} className={`flex flex-col items-center justify-center rounded-xl border-2 py-4 active:scale-95 transition-all ${isLive ? 'border-primary/40 bg-primary/10 text-primary' : 'border-muted/40 bg-muted/10 text-muted-foreground'}`} title={isLive ? 'Wyłącz ekran' : 'Włącz ekran'}>
          {isLive ? <Monitor className="h-9 w-9" /> : <MonitorOff className="h-9 w-9" />}
          <span className="text-[10px] font-semibold mt-1">{isLive ? 'Włączony' : 'Wyłączony'}</span>
        </button>
        <button onClick={handlePrevSong} className="flex flex-col items-center justify-center rounded-xl border-2 border-muted-foreground/30 bg-card py-4 hover:bg-muted/30 active:scale-95 transition-all" title="Poprzednia pieśń">
          <ChevronsLeft className="h-9 w-9 text-muted-foreground" />
          <span className="text-[10px] font-semibold text-muted-foreground mt-1">◀◀ Pieśń</span>
        </button>
        <button onClick={handlePrev} className="flex flex-col items-center justify-center rounded-xl border-2 border-destructive/40 bg-card py-4 hover:bg-destructive/10 active:scale-95 transition-all" title="Poprzedni slajd">
          <ChevronLeft className="h-9 w-9 text-destructive" />
          <span className="text-[10px] font-semibold text-destructive mt-1">◀ Slajd</span>
        </button>
      </div>
    </div>
  );
}
