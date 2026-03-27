import { useState, useCallback, useEffect, useRef } from 'react';
import { Sparkles, CheckCircle2, Circle, Loader2, RefreshCw, ExternalLink, ListPlus, BookOpen, BookOpenCheck, FileText, Minus, AlertTriangle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Monitor, MonitorOff } from 'lucide-react';
import DOMPurify from 'dompurify';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { loadLiturgy } from '@/lib/liturgyCache';

import { Button } from '@/components/ui/button';
import { findMatch, findPsalmMatch } from '@/lib/musicamSacramParser';
import { songsUrl } from '@/lib/liturgyUrls';
import { findSlPageForSong, findLiturgiaPdfForSong, slViewerUrl } from '@/lib/songMatcher';
import { getCachedLiturgy, refreshLiturgyCache } from '@/lib/liturgyCache';
import { toYMD } from '@/lib/dateUtils';
import type { SongsData, ReadingsData, SongSection } from '@/lib/liturgyParsers';
import type { Song } from '@/types/projector';
import { cn } from '@/lib/utils';

/** Extract psalm refrain from cached readings HTML */
function extractPsalmRefrain(readings: ReadingsData | null): string | null {
  if (!readings?.options?.length) return null;
  const html = readings.options[0]?.contentHtml || '';
  if (!html) return null;
  const div = document.createElement('div');
  div.innerHTML = html;
  const text = div.textContent || '';
  const match = text.match(/Refren:\s*(.+)/i);
  if (match) return match[1].trim();
  return null;
}

/** Known acclamation refrains */
const ACCLAMATION_OPTIONS = [
  'Chwała Tobie, Słowo Boże.',
  'Chwała Tobie, Królu wieków.',
  'Alleluja, alleluja, alleluja.',
];

/** Normalize for accent/punctuation-insensitive matching */
function normalizeAccl(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0142/g, 'l')
    .replace(/[.,;:!?'"()]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract acclamation refrain from readings HTML by matching against 3 known options */
function extractAcclamation(readings: ReadingsData | null): string | null {
  if (!readings?.options?.length) return null;
  const html = readings.options[0]?.contentHtml || '';
  if (!html) return null;
  const div = document.createElement('div');
  div.innerHTML = html;
  const text = normalizeAccl(div.textContent || '');
  for (const opt of ACCLAMATION_OPTIONS) {
    if (text.includes(normalizeAccl(opt))) return opt;
  }
  return null;
}

export interface SuggestedSongsTarget {
  key: string;
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
  onAdd: (song: Song | null, title: string) => Promise<void> | void;
  onRemoveBySongId?: (songId: string) => void;
  isInList?: (songId: string) => boolean;
}

interface SuggestedSongsProps {
  songs: Song[];
  date: Date;
  targets: SuggestedSongsTarget[];
  onOpenSongbook?: (url: string) => void;
  onAddCustomTextToPlaylist?: (text: string, title?: string) => void;
  onNextSlide?: () => void;
  onPrevSlide?: () => void;
  onNextSong?: () => void;
  onPrevSong?: () => void;
  onToggleLive?: () => void;
  isLive?: boolean;
  slideInfo?: string;
}

interface MatchedSuggestion {
  title: string;
  note?: string;
  matchedSong: Song | null;
}

interface MatchedSection {
  name: string;
  suggestions: MatchedSuggestion[];
  isPsalm?: boolean;
  psalmRefrain?: string;
  isAcclamation?: boolean;
  acclamationText?: string;
  isGloria?: boolean;
}

export function SuggestedSongs({ songs, date, targets, onOpenSongbook, onAddCustomTextToPlaylist, onNextSlide, onPrevSlide, onNextSong, onPrevSong, onToggleLive, isLive, slideInfo }: SuggestedSongsProps) {
  const [sections, setSections] = useState<MatchedSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cacheDate, setCacheDate] = useState<string | null>(null);
  const [dateStale, setDateStale] = useState(false);
  const [addingState, setAddingState] = useState<Record<string, boolean>>({});
  const [readingsDialog, setReadingsDialog] = useState<{ open: boolean; html: string; title: string; loading: boolean }>({
    open: false, html: '', title: '', loading: false,
  });
  const containerRef = useRef<HTMLDivElement>(null);

  const openReadings = useCallback(async () => {
    setReadingsDialog({ open: true, html: '', title: 'Czytania', loading: true });
    try {
      const result = await loadLiturgy(date, 'readings');
      const rd = result.data as ReadingsData;
      const fullHtml = rd?.options?.[0]?.contentHtml || '';
      setReadingsDialog({ open: true, html: fullHtml || '<p>Brak danych czytań</p>', title: 'Czytania', loading: false });
    } catch {
      setReadingsDialog({ open: true, html: '<p>Błąd pobierania czytań</p>', title: 'Czytania', loading: false });
    }
  }, [date]);

  const enabledTargets = targets.filter(t => t.enabled);
  const primaryTarget = enabledTargets[0];
  const todayStr = toYMD(date);

  const songIndex = songs.map(s => ({ id: s.id, title: s.title }));

  const handleAdd = useCallback(async (song: Song | null, title: string) => {
    if (!primaryTarget) return;
    const stateKey = `${primaryTarget.key}:${title}`;
    setAddingState(prev => ({ ...prev, [stateKey]: true }));
    try {
      await primaryTarget.onAdd(song, title);
    } catch {
      // silently fail
    } finally {
      setAddingState(prev => ({ ...prev, [stateKey]: false }));
    }
  }, [primaryTarget]);

  const [hasGloria, setHasGloria] = useState(false);

  const buildSections = useCallback((songsData: SongsData | null, readingsData: ReadingsData | null, gloriaDetected: boolean) => {
    if (!songsData?.sets?.length) {
      setSections([]);
      return;
    }

    const psalmRefrain = extractPsalmRefrain(readingsData);
    const acclamation = extractAcclamation(readingsData);
    const matched: MatchedSection[] = [];

    // Use first set (main liturgy option)
    const mainSet = songsData.sets[0];
    for (const sec of mainSet.sections) {
      matched.push({
        name: sec.name,
        suggestions: sec.items.map(item => {
          const match = findMatch(item.title, songIndex, songs);
          return {
            title: item.title,
            note: item.note || undefined,
            matchedSong: match ? songs.find(s => s.id === match.id) || null : null,
          };
        }),
      });

      // Insert Gloria + psalm + acclamation after Wejście
      if (sec.name.includes('Wejście')) {
        if (gloriaDetected) {
          matched.push({
            name: 'Chwała na wysokości Bogu',
            isGloria: true,
            suggestions: [],
          });
        }
        matched.push({
          name: 'Psalm responsoryjny',
          isPsalm: true,
          psalmRefrain: psalmRefrain || '',
          suggestions: [],
        });
        matched.push({
          name: 'Aklamacja',
          isAcclamation: true,
          acclamationText: acclamation || '',
          suggestions: [],
        });
      }
    }

    setSections(matched);
  }, [songs, songIndex]);

  const loadFromCache = useCallback(async () => {
    setLoading(true);
    setError('');
    setDateStale(false);
    try {
      const [songsCache, readingsCache, calendarCache] = await Promise.all([
        getCachedLiturgy(date, 'songs'),
        getCachedLiturgy(date, 'readings'),
        getCachedLiturgy(date, 'calendar'),
      ]);

      if (!songsCache.data) {
        setError('Dane liturgii są pobierane w tle. Poczekaj chwilę...');
        setLoading(false);
        return;
      }

      // Detect GLORIA from calendar
      let gloriaDetected = false;
      if (calendarCache?.data) {
        const cal = calendarCache.data as any;
        const div = document.createElement('div');
        div.innerHTML = cal.contentHtml || '';
        const text = div.textContent || '';
        gloriaDetected = /\bGLORIA\b/i.test(text);
      }
      setHasGloria(gloriaDetected);

      setCacheDate(todayStr);
      buildSections(songsCache.data as SongsData, readingsCache.data as ReadingsData | null, gloriaDetected);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd odczytu cache');
    } finally {
      setLoading(false);
    }
  }, [date, todayStr, buildSections]);

  const refreshCache = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [freshSongs, freshReadings] = await Promise.all([
        refreshLiturgyCache(date, 'songs'),
        refreshLiturgyCache(date, 'readings'),
      ]);
      setCacheDate(todayStr);
      setDateStale(false);
      buildSections(freshSongs as SongsData, freshReadings as ReadingsData | null, hasGloria);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania');
    } finally {
      setLoading(false);
    }
  }, [date, todayStr, buildSections]);

  // Auto-load from cache on mount
  useEffect(() => {
    if (songs.length > 0) {
      loadFromCache();
    } else {
      setLoading(false);
    }
  }, [todayStr]); // reload when date changes

  // Auto-retry when cache not ready yet (prefetch still running)
  useEffect(() => {
    if (!error.includes('Poczekaj')) return;
    const timer = setInterval(() => {
      loadFromCache();
    }, 3000);
    return () => clearInterval(timer);
  }, [error, loadFromCache]);

  // Re-match when songs change (but don't re-fetch)
  useEffect(() => {
    if (sections.length > 0 && songs.length > 0) {
      // Re-run matching with updated song list
      setSections(prev => prev.map(sec => ({
        ...sec,
        suggestions: sec.suggestions.map(sg => {
          const match = findMatch(sg.title, songIndex, songs);
          return {
            ...sg,
            matchedSong: match ? songs.find(s => s.id === match.id) || null : null,
          };
        }),
      })));
    }
  }, [songs.length]);

  // Auto-add Gloria + psalm when sections load
  const autoAddedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!primaryTarget || sections.length === 0 || songs.length === 0) return;
    const dateKey = todayStr;
    if (autoAddedRef.current === dateKey) return;

    let didAdd = false;

    // Auto-add Gloria — song #518 from database
    const gloriaSection = sections.find(s => s.isGloria);
    if (gloriaSection) {
      const gloriaSong = songs.find(s => s.id === '56') || null;
      if (gloriaSong && !primaryTarget.isInList?.(gloriaSong.id)) {
        handleAdd(gloriaSong, gloriaSong.title);
      }
    }

    // Auto-add psalm
    const psalmSection = sections.find(s => s.isPsalm && s.psalmRefrain);
    if (psalmSection?.psalmRefrain) {
      const psalmTitle = psalmSection.psalmRefrain;
      const psalmMatchResult = findPsalmMatch(psalmTitle, songIndex, songs);
      const psalmSong = psalmMatchResult ? songs.find(s => s.id === psalmMatchResult.id) || null : null;
      if (psalmSong && !primaryTarget.isInList?.(psalmSong.id)) {
        handleAdd(psalmSong, psalmTitle);
        didAdd = true;
      }
    }

    autoAddedRef.current = dateKey;
  }, [sections, songs.length, todayStr, primaryTarget]);

  const allMatchedSongs = sections.flatMap(sec =>
    sec.suggestions.filter(sg => sg.matchedSong).map(sg => sg.matchedSong!)
  );
  const matchedCount = allMatchedSongs.length;
  const allAddedCount = primaryTarget ? allMatchedSongs.filter(s => primaryTarget.isInList?.(s.id)).length : 0;
  const allAdded = matchedCount > 0 && allAddedCount === matchedCount;

  const toggleAllToTarget = () => {
    if (!primaryTarget) return;
    if (allAdded && primaryTarget.onRemoveBySongId) {
      // Remove all matched songs from list
      allMatchedSongs.forEach(s => primaryTarget.onRemoveBySongId!(s.id));
    } else {
      // Add missing songs
      sections.forEach(sec => {
        sec.suggestions.forEach(sg => {
          if (sg.matchedSong && !primaryTarget.isInList?.(sg.matchedSong.id)) {
            handleAdd(sg.matchedSong, sg.title);
          }
        });
      });
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center gap-3 h-full justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Ładuję propozycje z cache...</p>
      </div>
    );
  }

  if (songs.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center gap-4 h-full justify-center">
        <Sparkles className="w-10 h-10 text-primary opacity-40" />
        <p className="text-xs text-destructive">Najpierw załaduj bazę pieśni</p>
      </div>
    );
  }

  const isWaiting = error.includes('Poczekaj');

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center gap-3 h-full justify-center">
        {isWaiting ? (
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        ) : (
          <AlertTriangle className="w-8 h-8 text-amber-500 opacity-60" />
        )}
        <p className="text-sm text-muted-foreground text-center px-4">{error}</p>
        {!isWaiting && (
          <div className="flex gap-2">
            <Button onClick={loadFromCache} variant="outline" size="sm" className="gap-2">
              <RefreshCw className="w-3 h-3" />
              Ponów
            </Button>
            <Button onClick={refreshCache} size="sm" className="gap-2">
              <Sparkles className="w-3 h-3" />
              Pobierz z sieci
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center gap-3 h-full justify-center">
        <Sparkles className="w-10 h-10 text-primary opacity-40" />
        <p className="text-sm text-muted-foreground">Brak propozycji pieśni na dziś</p>
        <Button onClick={refreshCache} size="sm" className="gap-2">
          <Sparkles className="w-3 h-3" />
          Pobierz z sieci
        </Button>
      </div>
    );
  }

  return (
    <>
    <div className="rounded-xl border border-border bg-card flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
        <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
          <Sparkles className="w-4 h-4 text-primary" />
          Propozycje na dziś
        </h3>
        <div className="flex gap-1">
          {primaryTarget && matchedCount > 0 && (
            <Button size="sm" variant={allAdded ? "default" : "outline"} onClick={toggleAllToTarget} className="text-xs gap-1.5 h-7">
              {allAdded ? <CheckCircle2 className="w-3 h-3" /> : <ListPlus className="w-3 h-3" />}
              {allAdded ? `Odznacz (${matchedCount})` : `Wszystkie (${matchedCount})`}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={loadFromCache} className="text-xs h-7 w-7 p-0" title="Odśwież z cache">
            <RefreshCw className="w-3 h-3" />
          </Button>
          <a
            href={songsUrl(date)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Otwórz MusicamSacram.pl"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Instruction */}
      <div className="px-4 py-1.5 border-b border-border/30 shrink-0">
        <p className="text-[10px] text-muted-foreground">
          Kliknij na wiersz, aby dodać pieśń do rzutnika
        </p>
      </div>

      {/* Song list */}
      <div className="flex-1 overflow-auto px-2 py-2">
        {sections.map((sec, si) => (
          <div key={si} className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
              {sec.name.replace('Śpiew na ', '')}
            </p>

            {/* Gloria row */}
            {sec.isGloria && (() => {
              const gloriaSong = songs.find(s => s.id === '56') || null;
              const gloriaId = gloriaSong ? gloriaSong.id : `gloria-${todayStr}`;
              const isGloriaAdded = primaryTarget?.isInList?.(gloriaId);
              const gloriaTitle = gloriaSong?.title || 'Chwała na wysokości Bogu';
              const isGloriaAdding = addingState[`${primaryTarget?.key}:${gloriaTitle}`];
              const canAddGloria = !!gloriaSong && !isGloriaAdded && !isGloriaAdding;

              return (
                <div
                  onClick={() => { if (canAddGloria) handleAdd(gloriaSong, gloriaTitle); }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors",
                    !gloriaSong && "opacity-40",
                    isGloriaAdded && "bg-primary/5",
                    canAddGloria && "hover:bg-primary/10 cursor-pointer",
                  )}
                >
                  {isGloriaAdding ? (
                    <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                  ) : isGloriaAdded ? (
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-primary/40 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      "text-xs font-bold truncate",
                      gloriaSong ? "text-foreground" : "text-muted-foreground"
                    )}>{gloriaTitle}</p>
                    {!gloriaSong && <p className="text-[10px] text-muted-foreground/60">brak w bazie</p>}
                  </div>
                </div>
              );
            })()}

            {/* Psalm row — styled like a song row */}
            {sec.isPsalm && sec.psalmRefrain && (() => {
              const psalmTitle = sec.psalmRefrain;
              const psalmMatchResult = findPsalmMatch(psalmTitle, songIndex, songs);
              const psalmSong = psalmMatchResult ? songs.find(s => s.id === psalmMatchResult.id) || null : null;
              const psalmId = psalmSong ? psalmSong.id : `psalm-${todayStr}`;
              const isPsalmAdded = primaryTarget?.isInList?.(psalmId);
              const isPsalmAdding = addingState[`${primaryTarget?.key}:${psalmTitle}`];
              const canAddPsalm = !!psalmSong && !isPsalmAdded && !isPsalmAdding;

              return (
                <div
                  onClick={() => { if (canAddPsalm) handleAdd(psalmSong, psalmTitle); }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors",
                    !psalmSong && "opacity-40",
                    isPsalmAdded && "bg-amber-500/5",
                    canAddPsalm && "hover:bg-amber-500/10 cursor-pointer",
                  )}
                >
                  {isPsalmAdding ? (
                    <Loader2 className="w-4 h-4 text-amber-500 animate-spin shrink-0" />
                  ) : isPsalmAdded ? (
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-amber-500/40 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      "text-xs font-bold truncate",
                      psalmSong ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                    )}>{sec.psalmRefrain}</p>
                    {!psalmSong && <p className="text-[10px] text-muted-foreground/60">brak w bazie</p>}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); openReadings(); }}
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="Pokaż czytania"
                  >
                    <BookOpenCheck className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })()}
            {sec.isPsalm && !sec.psalmRefrain && (
              <div className="mx-2 mb-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                <p className="text-xs text-amber-600/60 dark:text-amber-400/60 italic">Brak danych psalmu — przejdź do Liturgii</p>
              </div>
            )}

            {/* Acclamation row */}
            {sec.isAcclamation && sec.acclamationText && (() => {
              const acclTitle = sec.acclamationText;
              const acclMatch = findPsalmMatch(acclTitle, songIndex);
              const acclSong = acclMatch ? songs.find(s => s.id === acclMatch.id) || null : null;
              const acclId = acclSong ? acclSong.id : `acclamation-${todayStr}`;
              const isAcclAddedById = primaryTarget?.isInList?.(acclId);
              const isAcclAddedByTitle = !acclSong && primaryTarget?.isInList?.(`title:Aklamacja`);
              const isAcclAdded = isAcclAddedById || isAcclAddedByTitle;
              const isAcclAdding = addingState[`${primaryTarget?.key}:${acclTitle}`];
              const canAddAccl = !isAcclAdded && !isAcclAdding;

              return (
                <div
                  onClick={() => {
                    if (acclSong && canAddAccl) {
                      handleAdd(acclSong, acclTitle);
                    } else if (!acclSong && !isAcclAdded && onAddCustomTextToPlaylist) {
                      onAddCustomTextToPlaylist(acclTitle, 'Aklamacja');
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors",
                    isAcclAdded && "bg-amber-500/5",
                    (canAddAccl || (!acclSong && !isAcclAdded && onAddCustomTextToPlaylist)) && "hover:bg-amber-500/10 cursor-pointer",
                  )}
                >
                  {isAcclAdding ? (
                    <Loader2 className="w-4 h-4 text-amber-500 animate-spin shrink-0" />
                  ) : isAcclAdded ? (
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-amber-500/40 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      "text-xs font-bold truncate",
                      acclSong ? "text-amber-600 dark:text-amber-400" : "text-amber-600/70 dark:text-amber-400/70"
                    )}>{sec.acclamationText}</p>
                    {!acclSong && !isAcclAdded && <p className="text-[10px] text-muted-foreground/60">{onAddCustomTextToPlaylist ? 'dodaj do planu' : 'brak w bazie'}</p>}
                    {!acclSong && isAcclAdded && <p className="text-[10px] text-success/60">dodano do planu</p>}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); openReadings(); }}
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="Pokaż czytania"
                  >
                    <BookOpenCheck className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })()}
            {sec.isAcclamation && !sec.acclamationText && (
              <div className="mx-2 mb-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                <p className="text-xs text-amber-600/60 dark:text-amber-400/60 italic">Brak danych aklamacji — przejdź do Liturgii</p>
              </div>
            )}

            {sec.suggestions.map((sg, sgi) => {
              const hasMatch = !!sg.matchedSong;
              const isAdded = hasMatch && primaryTarget?.isInList?.(sg.matchedSong!.id);
              const isAdding = addingState[`${primaryTarget?.key}:${sg.title}`];
              const canAdd = hasMatch && !isAdded && !isAdding;

              // Siedlecki / PDF lookup
              const slPage = findSlPageForSong(sg.title);
              const pdfUrl = !slPage ? findLiturgiaPdfForSong(sg.title) : null;

              return (
                <div
                  key={sgi}
                  onClick={() => { if (canAdd) handleAdd(sg.matchedSong!, sg.title); }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors",
                    !hasMatch && "opacity-40",
                    isAdded && "bg-primary/5",
                    canAdd && "hover:bg-muted/30 cursor-pointer",
                  )}
                >
                  {/* Match indicator */}
                  {isAdding ? (
                    <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                  ) : isAdded ? (
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  ) : hasMatch ? (
                    <Circle className="w-4 h-4 text-primary/40 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                  )}

                  {/* Song title */}
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      "text-sm truncate",
                      hasMatch ? "text-foreground font-medium" : "text-muted-foreground"
                    )}>
                      {sg.title}
                    </p>
                    {sg.note && (
                      <p className="text-[10px] text-muted-foreground truncate italic">{sg.note}</p>
                    )}
                    {!hasMatch && (
                      <p className="text-[10px] text-muted-foreground/60">brak w bazie</p>
                    )}
                  </div>

                  {/* Siedlecki / PDF / dash icon */}
                  <div className="shrink-0">
                    {slPage ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onOpenSongbook) onOpenSongbook(slViewerUrl(slPage));
                        }}
                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title={`Siedlecki str. ${slPage}`}
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                      </button>
                    ) : pdfUrl ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onOpenSongbook) onOpenSongbook(`https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(pdfUrl)}`);
                        }}
                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Nuty PDF"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="p-1.5 text-muted-foreground/30 inline-flex">
                        <Minus className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>

    <Dialog open={readingsDialog.open} onOpenChange={(open) => setReadingsDialog(prev => ({ ...prev, open }))}>
      <DialogContent className="max-w-3xl w-[95vw] h-[85vh] flex flex-row p-0 gap-0">
        {/* Pilot — left strip */}
        {onNextSlide && (
          <div className="w-16 shrink-0 border-r border-border bg-muted/30 flex flex-col items-center justify-center gap-2 py-3">
            {slideInfo && (
              <div className="text-[9px] text-muted-foreground text-center px-1 truncate w-full mb-1">
                {slideInfo}
              </div>
            )}
            <button onClick={onPrevSong} className="flex items-center justify-center rounded-lg border border-muted-foreground/30 bg-card p-2 hover:bg-muted/30 active:scale-95 transition-all" title="Poprzednia pieśń">
              <ChevronsLeft className="h-5 w-5 text-muted-foreground" />
            </button>
            <button onClick={onPrevSlide} className="flex items-center justify-center rounded-lg border border-destructive/40 bg-card p-2 hover:bg-destructive/10 active:scale-95 transition-all" title="Poprzedni slajd">
              <ChevronLeft className="h-5 w-5 text-destructive" />
            </button>
            <button onClick={onToggleLive} className={cn(
              "flex items-center justify-center rounded-lg border p-2 active:scale-95 transition-all",
              isLive ? "border-primary/40 bg-primary/10 text-primary" : "border-muted/40 bg-muted/10 text-muted-foreground"
            )} title={isLive ? 'Wyłącz ekran' : 'Włącz ekran'}>
              {isLive ? <Monitor className="h-5 w-5" /> : <MonitorOff className="h-5 w-5" />}
            </button>
            <button onClick={onNextSlide} className="flex items-center justify-center rounded-lg border border-success/40 bg-card p-2 hover:bg-success/10 active:scale-95 transition-all" title="Następny slajd">
              <ChevronRight className="h-5 w-5 text-success" />
            </button>
            <button onClick={onNextSong} className="flex items-center justify-center rounded-lg border border-muted-foreground/30 bg-card p-2 hover:bg-muted/30 active:scale-95 transition-all" title="Następna pieśń">
              <ChevronsRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col">
          <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
            <DialogTitle>{readingsDialog.title}</DialogTitle>
          </DialogHeader>
          {readingsDialog.loading ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
              <div
                className="liturgy-content prose prose-sm max-w-none dark:prose-invert text-foreground leading-relaxed"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(readingsDialog.html) }}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
