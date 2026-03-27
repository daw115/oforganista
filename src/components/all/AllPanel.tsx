import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Calendar, BookOpen, MonitorPlay, Music, Search, Play, Square, SkipForward, SkipBack, Plus, Eye, Megaphone, Church, Mic, Trash2, ArrowUp, ArrowDown, CalendarDays, Check, CheckCheck, ChevronLeft, ChevronRight, X, FileText, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TodayAnnouncementCard } from '@/components/announcements/TodayAnnouncementCard';
import { TodayDevotionsCard } from '@/components/devotions/TodayDevotionsCard';
import { loadLiturgy } from '@/lib/liturgyCache';
import { toYMD, addDays, formatPL } from '@/lib/dateUtils';
import { estimateLiturgicalPeriod } from '@/hooks/useDevotions';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { findSlPageForSong, findSlPageForSiedl, findLiturgiaPdfForSong, slViewerUrl } from '@/lib/songMatcher';
import { findMatch, findPsalmMatch } from '@/lib/musicamSacramParser';
import { loadLiturgiaPdfs } from '@/lib/liturgiaPdf';
import type { SongsData, ReadingsData } from '@/lib/liturgyParsers';
import type { Song } from '@/types/projector';
import type { ScheduleEntry } from '@/types/schedule';
import type { Section } from '@/components/layout/AppSidebar';
import type { AnnouncementsData } from '@/hooks/useAnnouncements';
import type { Devotion } from '@/hooks/useDevotions';
import type { CantorSelection } from '@/hooks/useCantors';

interface AllPanelProps {
  sched: ScheduleEntry[];
  todayStr: string;
  tomorrowStr: string;
  dates: string[];
  organists: string[];
  todayGroup: Record<string, string[]>;
  tomorrowGroup: Record<string, string[]>;
  projector: any;
  onNavigate: (section: Section) => void;
  announcements: { data: AnnouncementsData | null; loading: boolean; error: string };
  devotions: Devotion[];
  devotionsLoading: boolean;
  cantorSelections: CantorSelection[];
  cantorPendingCount: number;
  onCantorLoad: () => void;
  onCantorMarkSeen: (id: string) => void;
  onCantorMarkAllSeen: () => void;
}

// ──── Tile Card ────
function TileCard({ icon, title, expanded, onToggle, children, preview, accentColor = 'border-primary', badge }: {
  icon: React.ReactNode;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  preview: React.ReactNode;
  accentColor?: string;
  badge?: number;
}) {
  return (
    <div
      className={cn(
        "glass-card border-t-2 overflow-hidden transition-all duration-300 ease-in-out cursor-pointer",
        accentColor,
        expanded ? "col-span-2" : ""
      )}
      onClick={() => !expanded && onToggle()}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2.5",
          expanded && "border-b border-border/50 cursor-pointer hover:bg-muted/30"
        )}
        onClick={() => expanded && onToggle()}
      >
        <div className="relative shrink-0">
          {icon}
          {badge != null && badge > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{badge}</span>
          )}
        </div>
        <span className="text-sm font-bold text-foreground flex-1">{title}</span>
        {expanded && <X className="w-4 h-4 text-muted-foreground" />}
      </div>

      {/* Preview (visible when collapsed) */}
      {!expanded && (
        <div className="px-3 pb-3 pt-0.5">
          {preview}
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 pt-2 animate-fade-in max-h-[50vh] overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  );
}

// ──── Extract psalm refrain ────
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

export function AllPanel({
  sched, todayStr, tomorrowStr, dates, organists, todayGroup, tomorrowGroup,
  projector, onNavigate,
  announcements, devotions, devotionsLoading,
  cantorSelections, cantorPendingCount, onCantorLoad, onCantorMarkSeen, onCantorMarkAllSeen,
}: AllPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [litDate, setLitDate] = useState<Date>(new Date());
  const [litSongs, setLitSongs] = useState<SongsData | null>(null);
  const [litReadings, setLitReadings] = useState<ReadingsData | null>(null);
  const [litLoading, setLitLoading] = useState(false);
  const [songSearch, setSongSearch] = useState('');
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const [songbookModal, setSongbookModal] = useState<{ url: string; title: string } | null>(null);

  // Projector songs for matching
  const [projectorSongs, setProjectorSongs] = useState<Song[]>([]);
  useEffect(() => {
    import('@/lib/songsDb').then(({ loadSongsFromDb }) =>
      loadSongsFromDb().then(s => setProjectorSongs(s))
    );
    loadLiturgiaPdfs();
  }, []);

  const songIndex = useMemo(() => projectorSongs.map(s => ({ id: s.id, title: s.title })), [projectorSongs]);

  const toggle = (key: string) => setExpanded(prev => prev === key ? null : key);

  // Load liturgy
  useEffect(() => {
    setLitLoading(true);
    Promise.all([
      loadLiturgy(litDate, 'songs').then(r => setLitSongs(r.data as SongsData)).catch(() => {}),
      loadLiturgy(litDate, 'readings').then(r => setLitReadings(r.data as ReadingsData)).catch(() => {}),
    ]).finally(() => setLitLoading(false));
  }, [litDate]);

  useEffect(() => {
    if (expanded === 'cantors') onCantorLoad();
  }, [expanded]);

  const currentLiturgicalPeriod = useMemo(() => estimateLiturgicalPeriod(new Date()), []);

  // Psalm
  const psalmRefrain = useMemo(() => extractPsalmRefrain(litReadings), [litReadings]);
  const psalmMatch = useMemo(() => {
    if (!psalmRefrain || !projectorSongs.length) return null;
    const matched = findPsalmMatch(psalmRefrain, songIndex, projectorSongs);
    return matched ? projectorSongs.find(s => s.id === matched.id) || null : null;
  }, [psalmRefrain, projectorSongs, songIndex]);

  // Add song to projector
  const handleAddSong = useCallback((song: Song, meta?: any) => {
    projector.addToPlaylist?.(song, meta);
    setAddedIds(prev => ({ ...prev, [song.id]: true }));
  }, [projector]);

  // Schedule info
  const todayDate = new Date();
  const dayName = format(todayDate, 'EEEE', { locale: pl });
  const dateFormatted = format(todayDate, 'd MMMM yyyy', { locale: pl });
  const todayEntries = Object.entries(todayGroup);
  const tomorrowEntries = Object.entries(tomorrowGroup);

  // Song search
  const filteredSongs = songSearch.trim().length > 1
    ? ((projector.songs as Song[]) ?? []).filter((s: Song) =>
        s.title.toLowerCase().includes(songSearch.toLowerCase())
      ).slice(0, 15)
    : [];

  const currentSlideText = projector.projectorState?.text || '';
  const playlist = (projector.playlist as any[]) ?? [];

  // Build flat list of liturgy songs with metadata
  const liturgySongList = useMemo(() => {
    if (!litSongs?.sets?.length) return [];
    const items: { sectionName: string; title: string; siedl?: string; sl?: string; dn?: string; url?: string; note?: string; isPsalm?: boolean }[] = [];
    const currentSet = litSongs.sets[0];
    let psalmInserted = false;
    currentSet.sections.forEach((sec, i) => {
      sec.items.forEach(item => {
        items.push({ sectionName: sec.name, ...item });
      });
      // Insert psalm after first section
      if (i === 0 && psalmRefrain && !psalmInserted) {
        items.push({ sectionName: 'Psalm responsoryjny', title: psalmRefrain, isPsalm: true });
        psalmInserted = true;
      }
    });
    return items;
  }, [litSongs, psalmRefrain]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 animate-fade-in auto-rows-min">

        {/* ═══ DATE & SCHEDULE ═══ */}
        <TileCard
          icon={<Calendar className="w-5 h-5 text-primary" />}
          title="Grafik"
          expanded={expanded === 'schedule'}
          onToggle={() => toggle('schedule')}
          accentColor="border-primary"
          preview={
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-foreground capitalize">{dayName}</p>
              <p className="text-[11px] text-muted-foreground">{dateFormatted}</p>
              {todayEntries.length > 0 ? (
                <div className="space-y-0.5">
                  {todayEntries.map(([time, names]) => (
                    <div key={time} className="flex items-baseline gap-1.5">
                      <span className="text-[10px] font-mono text-primary">{time}</span>
                      <span className="text-xs text-foreground">{names.join(', ')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">Brak grafiku</p>
              )}
            </div>
          }
        >
          <div className="space-y-3">
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1">☀️ Dziś — {todayStr}</p>
              {todayEntries.length > 0 ? todayEntries.map(([time, names]) => (
                <div key={time} className="flex items-baseline gap-2 py-0.5">
                  <span className="text-xs font-mono text-primary w-12">{time}</span>
                  <span className="text-sm">{names.join(', ')}</span>
                </div>
              )) : <p className="text-xs text-muted-foreground">Brak danych</p>}
            </div>
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1">🌅 Jutro — {tomorrowStr}</p>
              {tomorrowEntries.length > 0 ? tomorrowEntries.map(([time, names]) => (
                <div key={time} className="flex items-baseline gap-2 py-0.5">
                  <span className="text-xs font-mono text-amber w-12">{time}</span>
                  <span className="text-sm">{names.join(', ')}</span>
                </div>
              )) : <p className="text-xs text-muted-foreground">Brak danych</p>}
            </div>
          </div>
        </TileCard>

        {/* ═══ LITURGY ═══ */}
        <TileCard
          icon={<BookOpen className="w-5 h-5 text-emerald" />}
          title="Liturgia"
          expanded={expanded === 'liturgy'}
          onToggle={() => toggle('liturgy')}
          accentColor="border-emerald"
          preview={
            <div className="space-y-1">
              {litLoading ? (
                <p className="text-[11px] text-muted-foreground">Ładowanie...</p>
              ) : liturgySongList.length > 0 ? (
                liturgySongList.slice(0, 4).map((item, i) => {
                  const matched = !item.isPsalm && projectorSongs.length > 0
                    ? findMatch(item.title, songIndex, projectorSongs)
                    : item.isPsalm ? (psalmMatch ? { id: psalmMatch.id } : null) : null;
                  const inDb = !!matched;
                  const isAdded = matched ? addedIds[matched.id] : false;
                  return (
                    <div key={i} className={cn(
                      "text-[11px] truncate rounded px-1 py-0.5",
                      isAdded ? "bg-emerald/15 text-emerald font-medium" :
                      inDb ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {item.title}
                    </div>
                  );
                })
              ) : (
                <p className="text-[11px] text-muted-foreground italic">Brak pieśni</p>
              )}
              {liturgySongList.length > 4 && (
                <p className="text-[10px] text-muted-foreground">+{liturgySongList.length - 4} więcej...</p>
              )}
            </div>
          }
        >
          <div className="space-y-2">
            {/* Date nav */}
            <div className="flex items-center gap-1.5">
              <button onClick={() => setLitDate(addDays(litDate, -1))} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold flex-1 text-center">{format(litDate, 'd MMMM yyyy', { locale: pl })}</span>
              <button onClick={() => setLitDate(addDays(litDate, 1))} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => setLitDate(new Date())} className="text-[10px] font-bold text-primary px-2 py-1 rounded-md hover:bg-primary/10">Dziś</button>
            </div>

            {litLoading ? (
              <div className="flex items-center gap-2 justify-center py-4 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">Ładowanie...</span>
              </div>
            ) : (
              <div className="space-y-0.5">
                {/* Set selector */}
                {litSongs && litSongs.sets.length > 1 && (
                  <div className="flex gap-1 mb-2 overflow-x-auto">
                    {litSongs.sets.map((set, i) => (
                      <button key={i} className="px-2 py-1 text-[10px] font-bold rounded-md bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary shrink-0">
                        {set.name}
                      </button>
                    ))}
                  </div>
                )}

                {liturgySongList.map((item, i) => {
                  const matched = !item.isPsalm && projectorSongs.length > 0
                    ? findMatch(item.title, songIndex, projectorSongs)
                    : null;
                  const matchedSong = matched ? projectorSongs.find(s => s.id === matched.id) || null : null;
                  const psalmSong = item.isPsalm ? psalmMatch : null;
                  const activeSong = matchedSong || psalmSong;
                  const isAdded = activeSong ? addedIds[activeSong.id] : false;
                  const siedlPage = item.siedl ? findSlPageForSiedl(item.siedl) : null;
                  const slPage = findSlPageForSong(item.title);
                  const pdfUrl = findLiturgiaPdfForSong(item.title);

                  // Section header when section changes
                  const prevItem = i > 0 ? liturgySongList[i - 1] : null;
                  const showSectionHeader = !prevItem || prevItem.sectionName !== item.sectionName;

                  return (
                    <div key={i}>
                      {showSectionHeader && (
                        <div className={cn(
                          "text-[10px] font-bold uppercase tracking-wider mt-2 mb-1 px-1",
                          item.isPsalm ? "text-amber" : "text-primary"
                        )}>
                          {item.sectionName}
                        </div>
                      )}
                      <div
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all text-sm group",
                          isAdded && "bg-emerald/10",
                          item.isPsalm && "border border-amber/20 bg-amber/5",
                          activeSong && !isAdded && "hover:bg-muted cursor-pointer",
                          !activeSong && !item.isPsalm && "opacity-50"
                        )}
                        onClick={() => {
                          if (activeSong && !isAdded) {
                            handleAddSong(activeSong, item.isPsalm ? { isPsalm: true, litDate: toYMD(litDate) } : undefined);
                          }
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <span className={cn(
                            "text-sm truncate block",
                            isAdded ? "text-emerald font-medium" :
                            item.isPsalm ? "text-amber font-medium" :
                            activeSong ? "text-foreground" : "text-muted-foreground"
                          )}>
                            {item.title}
                          </span>
                          {item.note && <span className="text-[10px] text-muted-foreground italic">{item.note}</span>}
                        </div>

                        {/* Badges */}
                        <div className="flex items-center gap-1 shrink-0">
                          {isAdded && <Check className="w-3.5 h-3.5 text-emerald" />}
                          {item.siedl && siedlPage && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setSongbookModal({ url: slViewerUrl(siedlPage), title: `${item.title} — Siedl. ${item.siedl}` }); }}
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20"
                            >
                              S.{item.siedl}
                            </button>
                          )}
                          {slPage && !siedlPage && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setSongbookModal({ url: slViewerUrl(slPage), title: `${item.title} — SL` }); }}
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/80"
                            >
                              SL
                            </button>
                          )}
                          {pdfUrl && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setSongbookModal({ url: `${pdfUrl}#view=Fit`, title: item.title }); }}
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive hover:bg-destructive/20"
                            >
                              PDF
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TileCard>

        {/* ═══ PROJECTOR ═══ */}
        <TileCard
          icon={<MonitorPlay className="w-5 h-5 text-amber" />}
          title="Rzutnik"
          expanded={expanded === 'projector'}
          onToggle={() => toggle('projector')}
          accentColor="border-amber"
          preview={
            <div className="space-y-1">
              {playlist.length > 0 ? (
                <>
                  {playlist.slice(0, 3).map((item: any, i: number) => (
                    <div key={i} className={cn(
                      "text-[11px] truncate",
                      projector.currentPlaylistIndex === i ? "text-amber font-medium" : "text-muted-foreground"
                    )}>
                      {projector.currentPlaylistIndex === i && '▶ '}{item.title}
                    </div>
                  ))}
                  {playlist.length > 3 && <p className="text-[10px] text-muted-foreground">+{playlist.length - 3} więcej</p>}
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">Playlista pusta</p>
              )}
            </div>
          }
        >
          <div className="space-y-3">
            {currentSlideText && (
              <div className="bg-muted/50 rounded-lg p-2.5 text-sm text-foreground/80 whitespace-pre-line max-h-20 overflow-y-auto border border-border/50">
                {currentSlideText}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button onClick={() => projector.prevSlide?.()} className="p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"><SkipBack className="w-4 h-4" /></button>
              <button
                onClick={() => projector.projectorState?.isLive ? projector.goBlack?.() : projector.goLive?.()}
                className={cn(
                  "p-2 rounded-lg transition-colors flex-1 flex items-center justify-center gap-1.5 font-medium text-sm",
                  projector.projectorState?.isLive ? "bg-destructive/15 text-destructive hover:bg-destructive/25" : "bg-emerald/15 text-emerald hover:bg-emerald/25"
                )}
              >
                {projector.projectorState?.isLive ? <><Square className="w-4 h-4" /> Stop</> : <><Play className="w-4 h-4" /> Live</>}
              </button>
              <button onClick={() => projector.nextSlide?.()} className="p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"><SkipForward className="w-4 h-4" /></button>
            </div>
            {playlist.length > 0 ? (
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {playlist.map((item: any, i: number) => (
                  <div key={i} className={cn(
                    "flex items-center gap-1 text-sm px-2 py-1 rounded-lg transition-colors",
                    projector.currentPlaylistIndex === i ? "bg-primary/15 text-primary font-medium" : "hover:bg-muted"
                  )}>
                    <button onClick={() => projector.selectPlaylistItem?.(i)} className="flex-1 text-left truncate text-xs">{item.title}</button>
                    <button onClick={() => projector.movePlaylistItem?.(i, i - 1)} disabled={i === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
                    <button onClick={() => projector.movePlaylistItem?.(i, i + 1)} disabled={i === playlist.length - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
                    <button onClick={() => projector.removeFromPlaylist?.(i)} className="p-0.5 rounded text-destructive hover:bg-destructive/10"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Playlista pusta</p>
            )}
          </div>
        </TileCard>

        {/* ═══ SONG SEARCH ═══ */}
        <TileCard
          icon={<Music className="w-5 h-5 text-accent" />}
          title="Baza pieśni"
          expanded={expanded === 'songs'}
          onToggle={() => toggle('songs')}
          accentColor="border-accent"
          preview={
            <p className="text-[11px] text-muted-foreground">{(projector.songs as Song[])?.length || 0} pieśni w bazie</p>
          }
        >
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={songSearch}
                onChange={e => setSongSearch(e.target.value)}
                placeholder="Szukaj pieśni..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-background focus:border-primary focus:outline-none"
                onClick={e => e.stopPropagation()}
              />
            </div>
            {songSearch.trim().length > 1 && (
              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                {filteredSongs.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">Brak wyników</p>
                ) : filteredSongs.map((song: Song) => (
                  <div key={song.id} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-lg hover:bg-muted transition-colors">
                    <span className="flex-1 truncate text-xs">{song.title}</span>
                    <button onClick={(e) => { e.stopPropagation(); projector.addToPlaylist?.(song); }} className="p-1 rounded text-primary hover:bg-primary/10"><Plus className="w-3.5 h-3.5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); projector.showOnScreen?.(song); }} className="p-1 rounded text-amber hover:bg-amber/10"><Eye className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TileCard>

        {/* ═══ ANNOUNCEMENTS ═══ */}
        <TileCard
          icon={<Megaphone className="w-5 h-5 text-accent" />}
          title="Ogłoszenia"
          expanded={expanded === 'announcements'}
          onToggle={() => toggle('announcements')}
          accentColor="border-accent"
          preview={
            <p className="text-[11px] text-muted-foreground truncate">
              {announcements.loading ? 'Ładowanie...' :
               announcements.data?.selectedAnnouncement ? announcements.data.selectedAnnouncement.slice(0, 50) + '…' :
               'Brak ogłoszeń'}
            </p>
          }
        >
          <TodayAnnouncementCard data={announcements.data} loading={announcements.loading} error={announcements.error} />
        </TileCard>

        {/* ═══ DEVOTIONS ═══ */}
        <TileCard
          icon={<Church className="w-5 h-5 text-amber" />}
          title="Nabożeństwa"
          expanded={expanded === 'devotions'}
          onToggle={() => toggle('devotions')}
          accentColor="border-amber"
          preview={
            <div className="space-y-0.5">
              {devotionsLoading ? <p className="text-[11px] text-muted-foreground">Ładowanie...</p> :
                (() => {
                  const today = new Date();
                  const todayDevs = devotions.filter(d => {
                    if (!d.is_active) return false;
                    if (d.recurrence_type === 'weekly') return d.day_of_week === today.getDay();
                    if (d.recurrence_type === 'monthly_day') return d.day_of_month === today.getDate();
                    return false;
                  });
                  return todayDevs.length > 0 ? todayDevs.slice(0, 2).map(d => (
                    <p key={d.id} className="text-[11px] text-foreground truncate">{d.name}</p>
                  )) : <p className="text-[11px] text-muted-foreground italic">Brak na dziś</p>;
                })()
              }
            </div>
          }
        >
          <TodayDevotionsCard devotions={devotions} loading={devotionsLoading} currentLiturgicalPeriod={currentLiturgicalPeriod} />
        </TileCard>

        {/* ═══ CANTORS ═══ */}
        <TileCard
          icon={<Mic className="w-5 h-5 text-primary" />}
          title="Kantorzy"
          expanded={expanded === 'cantors'}
          onToggle={() => toggle('cantors')}
          accentColor="border-primary"
          badge={cantorPendingCount}
          preview={
            <p className="text-[11px] text-muted-foreground">
              {cantorPendingCount > 0 ? `${cantorPendingCount} oczekujących` : 'Brak nowych'}
            </p>
          }
        >
          <div className="space-y-2">
            {cantorPendingCount > 0 && (
              <button onClick={() => onCantorMarkAllSeen()} className="text-xs text-primary hover:underline flex items-center gap-1">
                <CheckCheck className="w-3 h-3" /> Oznacz wszystkie
              </button>
            )}
            {cantorSelections.length === 0 ? (
              <p className="text-xs text-muted-foreground">Brak zgłoszeń</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {cantorSelections.slice(0, 20).map(sel => (
                  <div key={sel.id} className={cn(
                    "flex items-start gap-2 text-sm p-2 rounded-lg border",
                    sel.status === 'pending' ? 'border-amber/40 bg-amber/5' :
                    sel.status === 'confirmed' ? 'border-emerald/40 bg-emerald/5' : 'border-border'
                  )}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{sel.cantor_name || '?'}</p>
                      <p className="text-[10px] text-muted-foreground">{sel.mass_date}{sel.mass_time ? ` · ${sel.mass_time}` : ''}</p>
                      <p className="text-[10px]">{sel.melody_name || sel.custom_melody || '—'}</p>
                    </div>
                    {(sel.status === 'pending' || sel.status === 'confirmed') && (
                      <button onClick={() => onCantorMarkSeen(sel.id)} className="p-1 rounded text-emerald hover:bg-emerald/10 shrink-0"><Check className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TileCard>
      </div>

      {/* ═══ FULLSCREEN SONGBOOK MODAL ═══ */}
      {songbookModal && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <button
            onClick={() => setSongbookModal(null)}
            className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <iframe
            src={songbookModal.url}
            className="w-full h-full border-0"
            title={songbookModal.title}
          />
        </div>
      )}
    </>
  );
}
