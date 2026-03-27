import { useEffect, useRef, useState, useCallback } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { Button } from '@/components/ui/button';
import { Play, Square, Volume2 } from 'lucide-react';
import { createPlayerFromUrl, type MusicPlayer } from '@/lib/musicXmlPlayer';

interface Props {
  musicxmlUrl: string;
  /** Compact mode for inline previews */
  compact?: boolean;
}

export function SheetMusicViewer({ musicxmlUrl, compact = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const playerRef = useRef<MusicPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);
  const [noteCount, setNoteCount] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const osmd = new OpenSheetMusicDisplay(containerRef.current, {
      autoResize: true,
      drawTitle: !compact,
      drawComposer: !compact,
      drawLyricist: false,
      drawPartNames: false,
      drawPartAbbreviations: false,
      drawCredits: false,
    });

    osmdRef.current = osmd;
    setLoading(true);
    setError(null);

    osmd
      .load(musicxmlUrl)
      .then(() => {
        osmd.render();
        setLoading(false);
      })
      .catch((err) => {
        console.error('OSMD load error:', err);
        setError('Nie udało się wczytać nut');
        setLoading(false);
      });

    // Prepare player
    createPlayerFromUrl(musicxmlUrl)
      .then(({ player, noteCount: nc }) => {
        playerRef.current = player;
        setNoteCount(nc);
        setPlayerReady(nc > 0);

        player.onEnd(() => {
          setPlaying(false);
          setProgress(0);
        });

        player.onProgress((time, total) => {
          setProgress(total > 0 ? time / total : 0);
        });
      })
      .catch(() => {
        setPlayerReady(false);
      });

    return () => {
      osmdRef.current = null;
      playerRef.current?.stop();
      playerRef.current = null;
    };
  }, [musicxmlUrl, compact]);

  const handlePlayStop = useCallback(() => {
    if (!playerRef.current) return;
    if (playing) {
      playerRef.current.stop();
      setPlaying(false);
      setProgress(0);

      // Re-create player for next play
      createPlayerFromUrl(musicxmlUrl).then(({ player, noteCount: nc }) => {
        playerRef.current = player;
        player.onEnd(() => { setPlaying(false); setProgress(0); });
        player.onProgress((t, total) => setProgress(total > 0 ? t / total : 0));
      });
    } else {
      playerRef.current.play();
      setPlaying(true);
    }
  }, [playing, musicxmlUrl]);

  return (
    <div className="relative">
      {loading && (
        <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
          <span className="animate-pulse">🎵 Wczytywanie nut…</span>
        </div>
      )}
      {error && (
        <div className="text-sm text-destructive text-center py-4">{error}</div>
      )}
      <div
        ref={containerRef}
        className={compact ? 'max-h-48 overflow-y-auto' : ''}
      />

      {/* Player controls */}
      {!loading && !error && playerReady && (
        <div className="flex items-center gap-2 mt-2 px-1">
          <Button
            size="sm"
            variant={playing ? 'destructive' : 'outline'}
            onClick={handlePlayStop}
            className="gap-1 h-7 text-xs"
          >
            {playing ? (
              <><Square className="w-3 h-3" /> Stop</>
            ) : (
              <><Play className="w-3 h-3" /> Odtwórz</>
            )}
          </Button>

          {/* Progress bar */}
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-100"
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Volume2 className="w-3 h-3" /> {noteCount} nut
          </span>
        </div>
      )}
    </div>
  );
}
