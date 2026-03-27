import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import DOMPurify from 'dompurify';
import { ChevronLeft, ChevronRight, ExternalLink, FileText, Loader2, Music, Plus, CheckCircle2, RefreshCw, X, Monitor, BookOpen } from 'lucide-react';
import { Tab, TabInfo } from '@/types/schedule';
import { toYMD, addDays, formatPL } from '@/lib/dateUtils';
import { getTabUrl } from '@/lib/liturgyUrls';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  fetchSongs, SongsData, SongSet,
  fetchReadings, ReadingsData,
  fetchCalendar, CalendarData,
} from '@/lib/liturgyParsers';
import { loadLiturgy, refreshLiturgyCache } from '@/lib/liturgyCache';
import {
  findSlPageForSong, findSlPageForSiedl, findLiturgiaPdfForSong, slViewerUrl,
} from '@/lib/songMatcher';
import { loadLiturgiaPdfs } from '@/lib/liturgiaPdf';
import { findMatch, findPsalmMatch } from '@/lib/musicamSacramParser';
import type { Song } from '@/types/projector';

export interface LiturgyAddTarget {
  key: string;
  label: string;
  icon: React.ReactNode;
  onAdd: (song: Song, meta?: { isPsalm?: boolean; litDate?: string }) => void;
}

interface LiturgyPanelProps {
  addTargets?: LiturgyAddTarget[];
  playlistSongIds?: Set<string>;
}

const TABS: TabInfo[] = [
  { id: 'songs', label: 'Pieśni', emoji: '🎵' },
  { id: 'readings', label: 'Czytania', emoji: '📖' },
  { id: 'calendar', label: 'Kartka', emoji: '✝️' },
];

export function LiturgyPanel({ addTargets = [], playlistSongIds }: LiturgyPanelProps) {
  const [tab, setTab] = useState<Tab>('songs');
  const [litDate, setLitDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const [songs, setSongs] = useState<SongsData | null>(null);
  const [readings, setReadings] = useState<ReadingsData | null>(null);
  const [calendar, setCalendar] = useState<CalendarData | null>(null);
  const [activeSongSet, setActiveSongSet] = useState(0);
  const [activeReadingOption, setActiveReadingOption] = useState(0);
  const [pdfModal, setPdfModal] = useState<{ url: string; title: string; type: 'pdf' | 'songbook' } | null>(null);

  const tabUrl = getTabUrl(tab, litDate);
  const dateKey = toYMD(litDate);

  const applyData = useCallback((tab: Tab, data: any) => {
    if (tab === 'songs') { setSongs(data); setActiveSongSet(0); }
    else if (tab === 'readings') { setReadings(data); setActiveReadingOption(0); }
    else if (tab === 'calendar') { setCalendar(data); }
  }, []);

  useEffect(() => {
    loadLiturgiaPdfs();
  }, []);

  useEffect(() => {
    if (tab === 'songs') {
      loadLiturgy(litDate, 'readings').then(r => setReadings(r.data as ReadingsData)).catch(() => {});
    }
  }, [tab, dateKey]);

  useEffect(() => {
    setError('');
    setRefreshing(false);
    const currentTab = tab;
    let cancelled = false;

    const load = async () => {
      try {
        await loadLiturgiaPdfs();

        // Check if we already have data for this tab (avoids flash of loading)
        const hasExisting = (currentTab === 'songs' && songs) ||
          (currentTab === 'readings' && readings) ||
          (currentTab === 'calendar' && calendar);

        if (!hasExisting) setLoading(true);

        const result = await loadLiturgy(litDate, currentTab, (freshData, updatedAt) => {
          if (!cancelled && currentTab === tab) {
            applyData(currentTab, freshData);
            setCachedAt(updatedAt);
            setRefreshing(false);
          }
        });
        if (cancelled) return;
        applyData(currentTab, result.data);
        setCachedAt(result.updatedAt);
        // Only show refreshing indicator if background revalidation was triggered (stale cache)
        if (result.fromCache) {
          // loadLiturgy only triggers onRevalidated callback when stale,
          // so we check staleness here too
          const age = result.updatedAt ? Date.now() - new Date(result.updatedAt).getTime() : Infinity;
          if (age > 60 * 60 * 1000) {
            setRefreshing(true);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Błąd pobierania danych');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [tab, dateKey, applyData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError('');
    try {
      const freshData = await refreshLiturgyCache(litDate, tab);
      applyData(tab, freshData);
      setCachedAt(new Date().toISOString());
    } catch (e: any) {
      setError(e.message || 'Błąd aktualizacji danych');
    } finally {
      setRefreshing(false);
    }
  }, [litDate, tab, applyData]);

  return (
    <div className="animate-fade-in glass-card overflow-hidden">
      {/* Header */}
      <div className="px-3 md:px-4 py-2 md:py-3 border-b border-border/50 space-y-2">
        {/* Row 1: Title + tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-extrabold text-foreground flex items-center gap-1.5 mr-1">
            📖 Liturgia
          </h2>
          <div className="flex gap-1">
            {TABS.map(t => {
              const isActive = tab === t.id;
              const url = getTabUrl(t.id, litDate);
              return (
                <div key={t.id} className="flex items-center">
                  <button
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-1 px-2 md:px-3 py-1.5 rounded-l-md text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-primary/15 text-primary border border-primary/40 border-r-0'
                        : 'bg-muted/50 text-muted-foreground border border-border/50 border-r-0 hover:bg-muted'
                    }`}
                  >
                    <span>{t.emoji}</span>
                    <span className="hidden xs:inline">{t.label}</span>
                  </button>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center justify-center px-1.5 py-1.5 rounded-r-md transition-colors h-full ${
                      isActive
                        ? 'bg-primary/15 text-primary border border-primary/40 border-l-0 hover:bg-primary/25'
                        : 'bg-muted/50 text-muted-foreground border border-border/50 border-l-0 hover:bg-muted'
                    }`}
                    title="Otwórz źródło"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              );
            })}
          </div>
        </div>
        {/* Row 2: Date controls */}
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setLitDate(addDays(litDate, -1))} className="h-8 w-8 p-0 bg-transparent border-border">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <input
            type="date"
            value={dateKey}
            onChange={e => { if (e.target.value) setLitDate(new Date(e.target.value + 'T12:00:00')); }}
            className="px-2 py-1.5 rounded-md border border-border bg-muted text-foreground text-xs h-8 flex-1 min-w-0"
          />
          <Button variant="outline" size="sm" onClick={() => setLitDate(addDays(litDate, 1))} className="h-8 w-8 p-0 bg-transparent border-border">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={() => setLitDate(new Date())} className="h-8 px-3 text-xs bg-primary text-primary-foreground">
            Dziś
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="h-8 px-2 text-xs gap-1 bg-transparent border-border"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 md:p-4">
        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium">Pobieranie danych...</span>
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-lg text-sm font-medium">
            {error}
          </div>
        )}

        {!loading && !error && (
          <ScrollArea className="h-[calc(100vh-14rem)] md:h-[calc(100vh-12rem)]">
            {tab === 'songs' && songs && <SongsContent data={songs} readings={readings} activeSet={activeSongSet} onSetChange={setActiveSongSet} onPdfPreview={(url, title) => setPdfModal({ url, title, type: 'pdf' })} onSongbookPreview={(url, title) => setPdfModal({ url, title, type: 'songbook' })} addTargets={addTargets} litDate={litDate} isMobile={isMobile} playlistSongIds={playlistSongIds} />}
            {tab === 'readings' && readings && <ReadingsContent data={readings} activeOption={activeReadingOption} onOptionChange={setActiveReadingOption} addTargets={addTargets} litDate={litDate} />}
            {tab === 'calendar' && calendar && <CalendarContent data={calendar} />}
          </ScrollArea>
        )}
      </div>

      {/* PDF / Songbook Modal */}
      {pdfModal && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm" onClick={() => setPdfModal(null)}>
          <div className="flex items-center justify-between px-3 py-2 bg-card border-b border-border shrink-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 min-w-0">
              {pdfModal.type === 'pdf' ? (
                <FileText className="w-4 h-4 text-destructive shrink-0" />
              ) : (
                <BookOpen className="w-4 h-4 text-primary shrink-0" />
              )}
              <span className="text-sm font-semibold text-foreground truncate">{pdfModal.title}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <a
                href={pdfModal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Otwórz
              </a>
              <button onClick={() => setPdfModal(null)} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0" onClick={e => e.stopPropagation()}>
            <iframe
              src={pdfModal.type === 'pdf'
                ? `${pdfModal.url}#view=Fit`
                : pdfModal.url
              }
              className="w-full h-full border-0"
              title={pdfModal.title}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ──── Extract psalm refrain from readings HTML ────
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

// ──── Extract acclamation refrain from readings HTML ────
const ACCLAMATION_OPTIONS = [
  'Chwała Tobie, Słowo Boże.',
  'Chwała Tobie, Królu wieków.',
  'Alleluja, alleluja, alleluja.',
];

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

// ──── Mobile Song Card ────
function MobileSongCard({ song, slPage, siedlPage, pdfUrl, matchedSong, addTargets, addedIds, onAdd, onPdfPreview, onSongbookPreview, litDate, isPsalm, hasProjectorSongs }: {
  song: { title: string; url?: string; note?: string; sl?: string; siedl?: string; dn?: string };
  slPage: number | null;
  siedlPage: number | null;
  pdfUrl: string | null;
  matchedSong: Song | null;
  addTargets: LiturgyAddTarget[];
  addedIds: Record<string, Set<string>>;
  onAdd: (targetKey: string, song: Song, meta?: any) => void;
  onPdfPreview: (url: string, title: string) => void;
  onSongbookPreview: (url: string, title: string) => void;
  litDate: Date;
  isPsalm?: boolean;
  hasProjectorSongs?: boolean;
}) {
  const isAdded = matchedSong ? addTargets.some(t => addedIds[t.key]?.has(matchedSong.id)) : false;
  const canAdd = !!matchedSong && !isAdded && addTargets.length > 0;

  return (
    <div
      onClick={() => {
        if (canAdd) onAdd(addTargets[0].key, matchedSong!, isPsalm ? { isPsalm: true, litDate: toYMD(litDate) } : undefined);
      }}
      className={cn(
        "rounded-lg border p-3 space-y-2 transition-colors",
        isPsalm ? 'border-amber/30 bg-amber/5' : 'border-border/50',
        !matchedSong && hasProjectorSongs ? 'opacity-40' : '',
        isAdded ? 'bg-primary/5' : '',
        canAdd ? 'cursor-pointer active:bg-muted/30' : '',
      )}
    >
      {/* Title */}
      <div className="flex items-center gap-2">
        {isAdded && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
        <div>
          {song.url ? (
            <a href={song.url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className={`text-sm font-semibold ${isPsalm ? 'text-amber' : 'text-primary'} hover:underline`}>
              {song.title}
            </a>
          ) : (
            <span className={`text-sm font-semibold ${isPsalm ? 'text-amber' : 'text-foreground'}`}>{song.title}</span>
          )}
          {song.note && <div className="text-xs text-muted-foreground italic mt-0.5">{song.note}</div>}
          {!matchedSong && hasProjectorSongs && (
            <div className="text-[10px] text-muted-foreground/60">brak w bazie rzutnika</div>
          )}
        </div>
      </div>

      {/* Action chips row */}
      <div className="flex flex-wrap gap-1.5">
        {pdfUrl && (
          <button
            onClick={(e) => { e.stopPropagation(); onPdfPreview(pdfUrl, song.title); }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-destructive/10 text-destructive text-[11px] font-bold"
          >
            <FileText className="w-3 h-3" /> PDF
          </button>
        )}
        {siedlPage && (
          <button
            onClick={(e) => { e.stopPropagation(); onSongbookPreview(slViewerUrl(siedlPage), `${song.title} — Siedl. ${song.siedl}`); }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-[11px] font-bold"
          >
            Siedl. {song.siedl}
          </button>
        )}
        {slPage && (
          <button
            onClick={(e) => { e.stopPropagation(); onSongbookPreview(slViewerUrl(slPage), `${song.title} — SL`); }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-accent/50 text-accent-foreground text-[11px] font-bold"
          >
            SL {song.sl || slPage}
          </button>
        )}
        {song.dn && <span className="inline-flex items-center px-2 py-1 rounded-md bg-muted/50 text-muted-foreground text-[11px] font-medium">DN {song.dn}</span>}
      </div>
    </div>
  );
}

// ──── Songs Tab ────
function SongsContent({ data, readings, activeSet, onSetChange, onPdfPreview, onSongbookPreview, addTargets = [], litDate, isMobile, playlistSongIds }: { data: SongsData; readings: ReadingsData | null; activeSet: number; onSetChange: (i: number) => void; onPdfPreview: (url: string, title: string) => void; onSongbookPreview: (url: string, title: string) => void; addTargets?: LiturgyAddTarget[]; litDate: Date; isMobile?: boolean; playlistSongIds?: Set<string> }) {
  const [projectorSongs, setProjectorSongs] = useState<Song[]>([]);
  useEffect(() => {
    import('@/lib/songsDb').then(({ loadSongsFromDb }) =>
      loadSongsFromDb().then(s => setProjectorSongs(s))
    );
  }, []);

  const songIndex = useMemo(() => projectorSongs.map(s => ({ id: s.id, title: s.title })), [projectorSongs]);
  const [localAddedIds, setLocalAddedIds] = useState<Record<string, Set<string>>>({});

  // Merge playlistSongIds (from projector) with local tracking
  const addedIds = useMemo(() => {
    const merged: Record<string, Set<string>> = { ...localAddedIds };
    if (playlistSongIds && playlistSongIds.size > 0) {
      const projSet = new Set(merged['projector'] || []);
      playlistSongIds.forEach(id => projSet.add(id));
      merged['projector'] = projSet;
    }
    return merged;
  }, [localAddedIds, playlistSongIds]);

  const handleAdd = useCallback((targetKey: string, song: Song, meta?: { isPsalm?: boolean; litDate?: string }) => {
    const target = addTargets.find(t => t.key === targetKey);
    if (!target) return;
    target.onAdd(song, meta);
    setLocalAddedIds(prev => {
      const set = new Set(prev[targetKey] || []);
      set.add(song.id);
      return { ...prev, [targetKey]: set };
    });
  }, [addTargets]);

  const psalmRefrain = useMemo(() => extractPsalmRefrain(readings), [readings]);
  const psalmMatch = useMemo(() => {
    if (!psalmRefrain || !projectorSongs.length || !songIndex.length) return null;
    const matched = findPsalmMatch(psalmRefrain, songIndex, projectorSongs);
    if (!matched) return null;
    return projectorSongs.find(s => s.id === matched.id) || null;
  }, [psalmRefrain, projectorSongs, songIndex]);

  const acclamationRefrain = useMemo(() => extractAcclamation(readings), [readings]);
  const acclamationMatch = useMemo(() => {
    if (!acclamationRefrain || !projectorSongs.length || !songIndex.length) return null;
    const matched = findPsalmMatch(acclamationRefrain, songIndex);
    if (!matched) return null;
    return projectorSongs.find(s => s.id === matched.id) || null;
  }, [acclamationRefrain, projectorSongs, songIndex]);


  if (data.sets.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">Brak propozycji pieśni na ten dzień.</div>;
  }

  const currentSet = data.sets[activeSet] || data.sets[0];

  // Psalm section for mobile
  const renderPsalmMobile = () => {
    if (!psalmRefrain) return null;
    return (
      <MobileSongCard
        song={{ title: psalmRefrain }}
        slPage={null}
        siedlPage={null}
        pdfUrl={null}
        matchedSong={psalmMatch}
        addTargets={addTargets}
        addedIds={addedIds}
        onAdd={handleAdd}
        onPdfPreview={onPdfPreview}
        onSongbookPreview={onSongbookPreview}
        litDate={litDate}
        hasProjectorSongs={projectorSongs.length > 0}
        isPsalm
      />
    );
  };

  // Psalm section for desktop (table)
  const renderPsalmSection = () => {
    if (!psalmRefrain) return null;
    const psalmIsAdded = psalmMatch ? addTargets.some(t => addedIds[t.key]?.has(psalmMatch.id)) : false;
    const psalmCanAdd = !!psalmMatch && !psalmIsAdded && addTargets.length > 0;
    return (
      <div className="rounded-lg border border-amber/30 overflow-hidden">
        <div className="bg-amber/10 px-4 py-2 font-bold text-sm text-amber flex items-center gap-2">
          <Music className="w-4 h-4" />
          Psalm responsoryjny
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/30 bg-muted/30 text-xs text-muted-foreground">
              <th className="px-4 py-1.5 text-left font-semibold">Refren</th>
              <th className="px-2 py-1.5 text-center font-semibold w-14">WWW</th>
              <th className="px-2 py-1.5 text-center font-semibold w-12">SL</th>
              <th className="px-2 py-1.5 text-center font-semibold w-16">Siedl.</th>
              <th className="px-2 py-1.5 text-center font-semibold w-12">DN</th>
            </tr>
          </thead>
          <tbody>
            <tr
              onClick={() => { if (psalmCanAdd) handleAdd(addTargets[0].key, psalmMatch!, { isPsalm: true, litDate: toYMD(litDate) }); }}
              className={cn(
                "transition-colors",
                !psalmMatch && projectorSongs.length > 0 ? "opacity-40" : "",
                psalmIsAdded ? "bg-amber/5" : "",
                psalmCanAdd ? "hover:bg-muted/30 cursor-pointer" : "hover:bg-muted/20",
              )}
            >
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  {psalmIsAdded && <CheckCircle2 className="w-3.5 h-3.5 text-amber shrink-0" />}
                  <span className="text-sm font-semibold text-amber">{psalmRefrain}</span>
                </div>
              </td>
              <td className="px-1 py-2 text-center"><span className="text-xs text-muted-foreground">-</span></td>
              <td className="px-2 py-2 text-center"><span className="text-xs text-muted-foreground">-</span></td>
              <td className="px-1 py-2 text-center"><span className="text-xs text-muted-foreground">-</span></td>
              <td className="px-2 py-2 text-center"><span className="text-xs text-muted-foreground">-</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  // Acclamation section for mobile
  const renderAcclamationMobile = () => {
    if (!acclamationRefrain) return null;
    return (
      <MobileSongCard
        song={{ title: acclamationRefrain }}
        slPage={null}
        siedlPage={null}
        pdfUrl={null}
        matchedSong={acclamationMatch}
        addTargets={addTargets}
        addedIds={addedIds}
        onAdd={handleAdd}
        onPdfPreview={onPdfPreview}
        onSongbookPreview={onSongbookPreview}
        litDate={litDate}
        hasProjectorSongs={projectorSongs.length > 0}
        isPsalm
      />
    );
  };

  // Acclamation section for desktop
  const renderAcclamationSection = () => {
    if (!acclamationRefrain) return null;
    const acclIsAdded = acclamationMatch ? addTargets.some(t => addedIds[t.key]?.has(acclamationMatch.id)) : false;
    const acclCanAdd = !!acclamationMatch && !acclIsAdded && addTargets.length > 0;
    return (
      <div className="rounded-lg border border-amber/30 overflow-hidden">
        <div className="bg-amber/10 px-4 py-2 font-bold text-sm text-amber flex items-center gap-2">
          <Music className="w-4 h-4" />
          Aklamacja
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/30 bg-muted/30 text-xs text-muted-foreground">
              <th className="px-4 py-1.5 text-left font-semibold">Refren</th>
              <th className="px-2 py-1.5 text-center font-semibold w-14">WWW</th>
              <th className="px-2 py-1.5 text-center font-semibold w-12">SL</th>
              <th className="px-2 py-1.5 text-center font-semibold w-16">Siedl.</th>
              <th className="px-2 py-1.5 text-center font-semibold w-12">DN</th>
            </tr>
          </thead>
          <tbody>
            <tr
              onClick={() => { if (acclCanAdd) handleAdd(addTargets[0].key, acclamationMatch!); }}
              className={cn(
                "transition-colors",
                !acclamationMatch && projectorSongs.length > 0 ? "opacity-40" : "",
                acclIsAdded ? "bg-amber/5" : "",
                acclCanAdd ? "hover:bg-muted/30 cursor-pointer" : "hover:bg-muted/20",
              )}
            >
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  {acclIsAdded && <CheckCircle2 className="w-3.5 h-3.5 text-amber shrink-0" />}
                  <span className="text-sm font-semibold text-amber">{acclamationRefrain}</span>
                </div>
              </td>
              <td className="px-1 py-2 text-center"><span className="text-xs text-muted-foreground">-</span></td>
              <td className="px-2 py-2 text-center"><span className="text-xs text-muted-foreground">-</span></td>
              <td className="px-1 py-2 text-center"><span className="text-xs text-muted-foreground">-</span></td>
              <td className="px-2 py-2 text-center"><span className="text-xs text-muted-foreground">-</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  // === MOBILE: card layout ===
  if (isMobile) {
    return (
      <div className="space-y-3">
        {addTargets.length > 0 && projectorSongs.length > 0 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 px-1">
            <Monitor className="w-3 h-3" />
            Kliknij pieśń, aby dodać ją do rzutnika
          </p>
        )}
        {data.sets.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
            {data.sets.map((set, i) => (
              <button
                key={i}
                onClick={() => onSetChange(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                  i === activeSet
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {set.name}
              </button>
            ))}
          </div>
        )}

        {currentSet.sections.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Brak propozycji pieśni.</div>
        ) : currentSet.sections.map((sec, i) => (
          <React.Fragment key={i}>
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Music className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold text-primary">{sec.name}</span>
              </div>
              {sec.items.map((song, j) => {
                const slPage = findSlPageForSong(song.title);
                const siedlPage = findSlPageForSiedl(song.siedl);
                const pdfUrl = findLiturgiaPdfForSong(song.title);
                const matched = projectorSongs.length > 0 ? findMatch(song.title, songIndex, projectorSongs) : null;
                const matchedSong = matched ? projectorSongs.find(s => s.id === matched.id) || null : null;
                return (
                  <MobileSongCard
                    key={j}
                    song={song}
                    slPage={slPage}
                    siedlPage={siedlPage}
                    pdfUrl={pdfUrl}
                    matchedSong={matchedSong}
                    addTargets={addTargets}
                    addedIds={addedIds}
                    onAdd={handleAdd}
                    onPdfPreview={onPdfPreview}
                    onSongbookPreview={onSongbookPreview}
                    litDate={litDate}
                    hasProjectorSongs={projectorSongs.length > 0}
                  />
                );
              })}
            </div>
            {i === 0 && psalmRefrain && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <Music className="w-4 h-4 text-amber" />
                  <span className="text-sm font-bold text-amber">Psalm responsoryjny</span>
                </div>
                {renderPsalmMobile()}
              </div>
            )}
            {i === 0 && acclamationRefrain && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <Music className="w-4 h-4 text-amber" />
                  <span className="text-sm font-bold text-amber">Aklamacja</span>
                </div>
                {renderAcclamationMobile()}
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }

  // === DESKTOP: table layout ===
  return (
    <div className="space-y-4">
      {data.sets.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {data.sets.map((set, i) => (
            <button
              key={i}
              onClick={() => onSetChange(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                i === activeSet
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {set.name}
            </button>
          ))}
        </div>
      )}

      {addTargets.length > 0 && projectorSongs.length > 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5 px-1">
          <Monitor className="w-3 h-3" />
          Kliknij wiersz pieśni, aby dodać ją do rzutnika
        </p>
      )}

      {currentSet.sections.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Brak propozycji pieśni dla tego formularza na ten dzień.
        </div>
      ) : currentSet.sections.map((sec, i) => (
        <React.Fragment key={i}>
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <div className="bg-primary/10 px-4 py-2 font-bold text-sm text-primary flex items-center gap-2">
              <Music className="w-4 h-4" />
              {sec.name}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 bg-muted/30 text-xs text-muted-foreground">
                  <th className="px-4 py-1.5 text-left font-semibold">Tytuł</th>
                  <th className="px-2 py-1.5 text-center font-semibold w-14">WWW</th>
                  <th className="px-2 py-1.5 text-center font-semibold w-12">SL</th>
                  <th className="px-2 py-1.5 text-center font-semibold w-16">Siedl.</th>
                  <th className="px-2 py-1.5 text-center font-semibold w-12">DN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {sec.items.map((song, j) => {
                  const slPage = findSlPageForSong(song.title);
                  const siedlPage = findSlPageForSiedl(song.siedl);
                  const pdfUrl = findLiturgiaPdfForSong(song.title);
                  const matched = projectorSongs.length > 0 ? findMatch(song.title, songIndex, projectorSongs) : null;
                  const matchedSong = matched ? projectorSongs.find(s => s.id === matched.id) || null : null;
                  const isAdded = matchedSong ? addTargets.some(t => addedIds[t.key]?.has(matchedSong.id)) : false;
                  const canAdd = !!matchedSong && !isAdded && addTargets.length > 0;

                  return (
                    <tr
                      key={j}
                      onClick={() => {
                        if (canAdd) handleAdd(addTargets[0].key, matchedSong!);
                      }}
                      className={cn(
                        "transition-colors",
                        !matchedSong && projectorSongs.length > 0
                          ? "opacity-40"
                          : isAdded
                            ? "bg-primary/5"
                            : canAdd
                              ? "hover:bg-muted/30 cursor-pointer"
                              : "hover:bg-muted/20"
                      )}
                    >
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          {isAdded && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                          <div>
                            {song.url ? (
                              <a href={song.url} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-sm font-semibold text-primary hover:underline">
                                {song.title}
                              </a>
                            ) : (
                              <span className="text-sm font-semibold text-foreground">{song.title}</span>
                            )}
                            {song.note && (
                              <div className="text-xs text-muted-foreground italic mt-0.5">{song.note}</div>
                            )}
                            {!matchedSong && projectorSongs.length > 0 && (
                              <div className="text-[10px] text-muted-foreground/60">brak w bazie rzutnika</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-1 py-2 text-center">
                        {pdfUrl ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); onPdfPreview(pdfUrl, song.title); }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors text-[10px] font-bold cursor-pointer"
                            title="Podgląd PDF z nutami">
                            <FileText className="w-3 h-3" />
                            PDF
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center text-xs text-muted-foreground">
                        {slPage ? (
                          <button onClick={(e) => { e.stopPropagation(); onSongbookPreview(slViewerUrl(slPage), `${song.title} — SL str. ${slPage}`); }}
                            className="text-primary font-semibold hover:underline cursor-pointer">
                            {song.sl}
                          </button>
                        ) : (
                          <span>{song.sl}</span>
                        )}
                      </td>
                      <td className="px-1 py-2 text-center">
                        {siedlPage ? (
                          <button onClick={(e) => { e.stopPropagation(); onSongbookPreview(slViewerUrl(siedlPage), `${song.title} — Siedl. ${song.siedl}`); }}
                            className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[11px] font-bold min-w-[36px] cursor-pointer">
                            {song.siedl}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">{song.siedl}</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center text-xs text-muted-foreground">{song.dn}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {i === 0 && renderPsalmSection()}
          {i === 0 && renderAcclamationSection()}
        </React.Fragment>
      ))}
    </div>
  );
}

// ──── Readings Tab ────
function ReadingsContent({ data, activeOption, onOptionChange, addTargets = [], litDate }: { data: ReadingsData; activeOption: number; onOptionChange: (i: number) => void; addTargets?: LiturgyAddTarget[]; litDate: Date }) {
  const [projectorSongs, setProjectorSongs] = useState<Song[]>([]);
  useEffect(() => {
    import('@/lib/songsDb').then(({ loadSongsFromDb }) =>
      loadSongsFromDb().then(s => setProjectorSongs(s))
    );
  }, []);

  const songIndex = useMemo(() => projectorSongs.map(s => ({ id: s.id, title: s.title })), [projectorSongs]);

  if (data.options.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">Brak danych liturgicznych na ten dzień.</div>;
  }

  const current = data.options[activeOption] || data.options[0];

  return (
    <div className="space-y-4">
      {data.options.length > 1 && (
        <div className="flex gap-1.5 items-center overflow-x-auto scrollbar-none">
          {data.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => onOptionChange(i)}
              className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap shrink-0 ${
                i === activeOption
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {opt.name.split(/[\s,–—-]+/)[0]}
            </button>
          ))}
        </div>
      )}

      {current.contentHtml ? (
        <CollapsibleLiturgyContent
          html={current.contentHtml}
          projectorSongs={projectorSongs}
          songIndex={songIndex}
          addTargets={addTargets}
          litDate={litDate}
        />
      ) : (
        <div className="text-center py-8 text-muted-foreground">Brak treści czytań.</div>
      )}
    </div>
  );
}

// ──── Collapsible liturgy content ────
function CollapsibleLiturgyContent({
  html,
  projectorSongs,
  songIndex,
  addTargets = [],
  litDate,
}: {
  html: string;
  projectorSongs?: Song[];
  songIndex?: { id: string; title: string }[];
  addTargets?: LiturgyAddTarget[];
  litDate?: Date;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [refrainMatch, setRefrainMatch] = useState<{ text: string; song: Song } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const title = target.closest('.readings-section-title') as HTMLElement | null;
      if (!title) return;
      title.classList.toggle('collapsed');
      let sibling = title.nextElementSibling;
      while (sibling && !sibling.classList.contains('readings-section-title')) {
        (sibling as HTMLElement).style.display =
          title.classList.contains('collapsed') ? 'none' : '';
        sibling = sibling.nextElementSibling;
      }
    };
    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [html]);

  useEffect(() => {
    setRefrainMatch(null);
    setAddedTargets(new Set());
    if (!projectorSongs?.length || !songIndex?.length) return;

    const el = ref.current;
    if (!el) return;

    const fullText = el.textContent || '';
    const refrainMatch2 = fullText.match(/Refren:\s*(.+)/i);

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    let refrainText = '';
    while ((node = walker.nextNode() as Text | null)) {
      const text = node.textContent || '';
      const match = text.match(/Refren:\s*(.+)/i);
      if (match) {
        refrainText = match[1].trim();
        break;
      }
    }

    if (!refrainText) {
      if (refrainMatch2) {
        refrainText = refrainMatch2[1].trim();
      } else {
        return;
      }
    }

    const matched = findPsalmMatch(refrainText, songIndex!, projectorSongs);
    if (matched) {
      const song = projectorSongs.find(s => s.id === matched.id);
      if (song) {
        setRefrainMatch({ text: refrainText, song });
      }
    }
  }, [html, projectorSongs, songIndex]);

  const [addedTargets, setAddedTargets] = useState<Set<string>>(new Set());

  const handleAdd = useCallback((targetKey: string) => {
    if (!refrainMatch) return;
    const target = addTargets.find(t => t.key === targetKey);
    if (!target) return;
    target.onAdd(refrainMatch.song, { isPsalm: true, litDate: litDate ? toYMD(litDate) : undefined });
    setAddedTargets(prev => new Set(prev).add(targetKey));
  }, [refrainMatch, addTargets, litDate]);

  return (
    <div>
      {refrainMatch && addTargets.length > 0 && (
        <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/30 flex-wrap">
          <Music className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-xs text-foreground font-medium truncate flex-1">
            Psalm: <span className="text-primary">{refrainMatch.text}</span>
          </span>
          <div className="flex gap-1 flex-shrink-0">
            {addTargets.map(target => (
              addedTargets.has(target.key) ? (
                <span key={target.key} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-bold">
                  <CheckCircle2 className="w-3 h-3" />
                  {target.label}
                </span>
              ) : (
                <button
                  key={target.key}
                  onClick={() => handleAdd(target.key)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-[10px] font-bold"
                  title={`Dodaj do ${target.label}`}
                >
                  {target.icon}
                  {target.label}
                </button>
              )
            ))}
          </div>
        </div>
      )}
      <div
        ref={ref}
        className="liturgy-content prose prose-sm max-w-none dark:prose-invert text-foreground leading-relaxed"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
      />
    </div>
  );
}

// ──── Calendar Tab ────
function CalendarContent({ data }: { data: CalendarData }) {
  if (!data.contentHtml) {
    return <div className="text-center py-8 text-muted-foreground">Brak danych kalendarza na ten dzień.</div>;
  }

  return (
    <div className="space-y-3">
      <CollapsibleLiturgyContent html={data.contentHtml} />
    </div>
  );
}
