import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Monitor, MonitorOff, ExternalLink, Globe, Copy, Check, Plus, LogIn, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Song } from '@/types/projector';
import { getProjectorSettings, getResolvedTextColor } from '@/lib/projectorSettings';
import { getSongSlides, CHURCH_PRESET } from '@/lib/projectorLayout';

const PROJ_W = CHURCH_PRESET.resolution.width;
const PROJ_H = CHURCH_PRESET.resolution.height;
const PROJ_RATIO = PROJ_W / PROJ_H;

interface LivePreviewProps {
  currentSong: Song | null;
  currentVerseIndex: number;
  isLive: boolean;
  currentText: string;
  onPrev: () => void;
  onNext: () => void;
  onToggleLive: () => void;
  onOpenWindow: () => void;
  playlistLength: number;
  syncRoomId?: string;
  syncCloudConnected?: boolean;
  onSyncRoomChange?: (room: string) => void;
  onSyncNewRoom?: () => void;
}

import { ProjectorMiniature } from './ProjectorMiniature';

export function LivePreview({
  currentSong, currentVerseIndex, isLive, currentText,
  onPrev, onNext, onToggleLive, onOpenWindow, playlistLength,
  syncRoomId, syncCloudConnected, onSyncRoomChange, onSyncNewRoom,
}: LivePreviewProps) {
  const [copied, setCopied] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [roomInput, setRoomInput] = useState('');
  const roomInputRef = useRef<HTMLInputElement>(null);
  const [projSettings, setProjSettings] = useState(() => getProjectorSettings());
  const allSlides = currentSong ? getSongSlides(currentSong) : [];
  const totalVerses = allSlides.length;

  useEffect(() => {
    const handler = () => setProjSettings(getProjectorSettings());
    window.addEventListener('projector-settings-changed', handler);
    return () => window.removeEventListener('projector-settings-changed', handler);
  }, []);

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Status bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold shrink-0",
            isLive
              ? "bg-success/15 text-success"
              : "bg-muted text-muted-foreground"
          )}>
            <div className={cn(
              "w-2 h-2 rounded-full",
              isLive ? "bg-success animate-pulse" : "bg-muted-foreground"
            )} />
            {isLive ? 'NA ŻYWO' : 'WSTRZYMANO'}
          </div>
          {currentSong && (
            <span className="text-sm text-foreground font-medium truncate min-w-0">
              {currentSong.title}
              <span className="text-muted-foreground ml-1 text-xs">
                {currentVerseIndex + 1}/{totalVerses}
              </span>
            </span>
          )}
        </div>
        <button
          onClick={onOpenWindow}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
          title="Otwórz okno projekcji"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Projekcja
        </button>
      </div>

      {/* Room sync panel */}
      {syncRoomId !== undefined && (
        <div className="flex flex-col gap-2 px-3 py-2.5 rounded-lg bg-muted/50 border border-border text-xs">
          <div className="flex items-center gap-2">
            <Globe className={cn("w-3.5 h-3.5 shrink-0", syncCloudConnected ? "text-success" : "text-muted-foreground")} />
            <span className="text-muted-foreground">Pokój:</span>
            {syncRoomId ? (
              <>
                <span className="font-mono font-bold text-foreground bg-background border border-border px-2 py-0.5 rounded tracking-widest">
                  {syncRoomId}
                </span>
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/projector-screen?room=${syncRoomId}`;
                    navigator.clipboard.writeText(url).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  title="Kopiuj link do ekranu projekcji"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
                <button
                  onClick={onSyncNewRoom}
                  className="p-1 rounded hover:bg-muted transition-colors ml-auto"
                  title="Wygeneruj nowy kod"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </>
            ) : (
              <span className="text-muted-foreground italic">brak pokoju</span>
            )}
          </div>

          {/* Join / Create buttons */}
          {isJoiningRoom ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (roomInput.length === 4 && onSyncRoomChange) {
                  onSyncRoomChange(roomInput);
                  setIsJoiningRoom(false);
                  setRoomInput('');
                }
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={roomInputRef}
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-20 font-mono font-bold text-foreground bg-background border border-primary px-2 py-1 rounded text-center text-sm tracking-widest"
                placeholder="0000"
                maxLength={4}
                inputMode="numeric"
                autoFocus
              />
              <button type="submit" disabled={roomInput.length !== 4} className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs font-medium disabled:opacity-30">
                Dołącz
              </button>
              <button type="button" onClick={() => { setIsJoiningRoom(false); setRoomInput(''); }} className="text-muted-foreground hover:text-foreground text-xs">
                Anuluj
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setIsJoiningRoom(true);
                  setTimeout(() => roomInputRef.current?.focus(), 50);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs font-medium hover:bg-muted transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                Dołącz do pokoju
              </button>
              <button
                onClick={onSyncNewRoom}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs font-medium hover:bg-muted transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Nowy pokój
              </button>
            </div>
          )}
        </div>
      )}

      {/* Preview screen — pixel-perfect miniature of actual projection */}
      <div className={cn(
        "rounded-xl overflow-hidden flex-1 min-h-0 relative",
        isLive ? "ring-2 ring-success/40" : "ring-1 ring-border"
      )}>
        <ProjectorMiniature
          text={currentText}
          isLive={isLive}
          projSettings={projSettings}
          playlistLength={playlistLength}
          currentSong={currentSong}
          currentVerseIndex={currentVerseIndex}
          totalVerses={totalVerses}
        />
      </div>

      {/* Touch-friendly controls */}
      <div className="grid grid-cols-4 gap-3">
        <button
          onClick={onPrev}
          disabled={playlistLength === 0}
          className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-3 text-foreground transition-colors hover:bg-panel-hover disabled:opacity-30 touch-target"
        >
          <ChevronLeft className="h-7 w-7" />
          <span className="text-xs font-medium">Poprzedni</span>
        </button>
        <button
          onClick={onNext}
          disabled={playlistLength === 0}
          className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-3 text-foreground transition-colors hover:bg-panel-hover disabled:opacity-30 touch-target"
        >
          <ChevronRight className="h-7 w-7" />
          <span className="text-xs font-medium">Następny</span>
        </button>
        <button
          onClick={onToggleLive}
          className={cn(
            "flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-colors touch-target",
            isLive
              ? "border-warning bg-warning/10 text-warning"
              : "border-border bg-card text-foreground hover:bg-panel-hover"
          )}
        >
          {isLive ? <Monitor className="h-7 w-7" /> : <MonitorOff className="h-7 w-7" />}
          <span className="text-xs font-medium">{isLive ? 'Pokaż' : 'Wygaś'}</span>
        </button>
        <button
          onClick={onOpenWindow}
          className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-3 text-foreground transition-colors hover:bg-panel-hover touch-target"
        >
          <ExternalLink className="h-7 w-7" />
          <span className="text-xs font-medium">Okno</span>
        </button>
      </div>
    </div>
  );
}
