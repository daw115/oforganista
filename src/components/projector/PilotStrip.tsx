import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Monitor, MonitorOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PilotProps {
  onPrevSlide: () => void;
  onNextSlide: () => void;
  onPrevSong: () => void;
  onNextSong: () => void;
  onToggleLive: () => void;
  isLive: boolean;
  slideInfo?: string;
  compact?: boolean;
}

export function PilotStrip({ onPrevSlide, onNextSlide, onPrevSong, onNextSong, onToggleLive, isLive, slideInfo, compact }: PilotProps) {
  const btnBase = "flex items-center justify-center rounded-2xl border active:scale-95 transition-all";
  const btnSize = compact ? "w-[min(80%,5vh)] aspect-square" : "w-[min(80%,8vh)] aspect-square";
  const iconSize = compact ? "h-[2.5vh] w-[2.5vh]" : "h-[3.5vh] w-[3.5vh]";
  return (
    <div className={cn(
      "border-r border-border bg-muted/30 flex flex-col items-center justify-center py-[2vh]",
      compact ? "w-[60px] shrink-0 gap-[2vh] px-[6px]" : "flex-1 min-w-[80px] gap-[3vh] px-[1.5vw]"
    )}>
      {slideInfo && (
        <div className={cn("text-muted-foreground text-center px-1 truncate w-full", compact ? "text-[1vh]" : "text-[1.4vh]")}>
          {slideInfo}
        </div>
      )}
      <button onClick={onPrevSong} className={cn(btnBase, btnSize, "border-muted-foreground/30 bg-card hover:bg-muted/30")} title="Poprzednia pieśń">
        <ChevronsLeft className={cn(iconSize, "text-muted-foreground")} />
      </button>
      <button onClick={onPrevSlide} className={cn(btnBase, btnSize, "border-destructive/40 bg-card hover:bg-destructive/10")} title="Poprzedni slajd">
        <ChevronLeft className={cn(iconSize, "text-destructive")} />
      </button>
      <button onClick={onToggleLive} className={cn(
        btnBase, btnSize,
        isLive ? "border-primary/40 bg-primary/10 text-primary" : "border-muted/40 bg-muted/10 text-muted-foreground"
      )} title={isLive ? 'Wyłącz ekran' : 'Włącz ekran'}>
        {isLive ? <Monitor className={iconSize} /> : <MonitorOff className={iconSize} />}
      </button>
      <button onClick={onNextSlide} className={cn(btnBase, btnSize, "border-success/40 bg-card hover:bg-success/10")} title="Następny slajd">
        <ChevronRight className={cn(iconSize, "text-success")} />
      </button>
      <button onClick={onNextSong} className={cn(btnBase, btnSize, "border-muted-foreground/30 bg-card hover:bg-muted/30")} title="Następna pieśń">
        <ChevronsRight className={cn(iconSize, "text-muted-foreground")} />
      </button>
    </div>
  );
}
