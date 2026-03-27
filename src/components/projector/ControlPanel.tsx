import { Monitor, ExternalLink, Keyboard, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Song } from '@/types/projector';

interface ControlPanelProps {
  currentSong: Song | null;
  currentVerseIndex: number;
  isLive: boolean;
  onOpenWindow: () => void;
}

export function ControlPanel({
  currentSong, currentVerseIndex, isLive, onOpenWindow,
}: ControlPanelProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
          <Info className="w-4 h-4 text-primary" />
          Jak uruchomić rzutnik
        </h3>
      </div>

      <div className="flex-1 p-4 space-y-4 text-sm">
        <div className="space-y-3">
          {[
            { n: 1, title: 'Zaimportuj bazę pieśni', desc: 'Kliknij „Import" w panelu Baza pieśni i wybierz plik .sqlite z OpenLP', color: 'primary' },
            { n: 2, title: 'Ułóż harmonogram', desc: 'Klikaj pieśni z bazy aby dodać je do harmonogramu na mszę', color: 'primary' },
            { n: 3, title: 'Otwórz okno projekcji', desc: 'Kliknij przycisk poniżej — otworzy się nowe okno przeglądarki', color: 'primary' },
            { n: 4, title: 'Przenieś okno na rzutnik', desc: 'Przeciągnij okno projekcji na drugi ekran (rzutnik) i naciśnij F11 lub F dla pełnego ekranu', color: 'primary' },
            { n: 5, title: 'Steruj z dashboardu', desc: 'Używaj przycisków Poprzedni/Następny i Pokaż/Ukryj ekran w górnym panelu', color: 'success' },
          ].map(step => (
            <div key={step.n} className="flex gap-3 items-start">
              <div className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold shrink-0",
                step.color === 'success' ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
              )}>
                {step.n}
              </div>
              <div>
                <p className="font-medium text-foreground">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <Button onClick={onOpenWindow} className="w-full bg-primary text-primary-foreground touch-target">
          <ExternalLink className="w-4 h-4" />
          Otwórz okno projekcji
        </Button>

        <div className="rounded-lg bg-panel border border-border p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <Keyboard className="w-3 h-3" />
            Skróty klawiszowe (w oknie projekcji)
          </p>
          <div className="grid grid-cols-2 gap-1 text-[11px]">
            <span className="text-muted-foreground">F / F11</span>
            <span className="text-foreground">Pełny ekran</span>
          </div>
        </div>

        {currentSong && (
          <div className="rounded-lg bg-panel border border-border p-3">
            <p className="text-xs text-muted-foreground">Aktualnie:</p>
            <p className="text-sm font-medium text-foreground mt-0.5">{currentSong.title}</p>
            <p className="text-xs text-muted-foreground">
              {currentSong.verses[currentVerseIndex]?.label} • 
              Ekran {isLive ? '✅ włączony' : '⬛ wyłączony'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
