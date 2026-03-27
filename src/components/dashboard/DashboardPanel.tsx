import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Radio, Monitor, MonitorOff, ExternalLink, Church, Megaphone, X,
  BookOpen, MessageSquare, Send, Plus, Sparkles, Database, Globe,
  ChevronUp, ChevronDown, SkipForward, Pencil, FileText, GripVertical, ScrollText, Loader2,
  AlertTriangle, CalendarIcon, Check, User, Maximize, Minimize, ArrowUp, ArrowLeft, ArrowDown, ArrowRight as ArrowRightIcon,
  ListMusic, Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import DOMPurify from 'dompurify';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { loadLiturgy } from '@/lib/liturgyCache';
import { ProjectorMiniature } from '@/components/projector/ProjectorMiniature';
import { PlaylistPanel } from '@/components/projector/PlaylistPanel';
import { SuggestedSongs, type SuggestedSongsTarget } from '@/components/projector/SuggestedSongs';
import { SongLibrary } from '@/components/projector/SongLibrary';
import { ConnectionPanel } from '@/components/projector/ConnectionPanel';
import { ProjectorSettingsPanel } from '@/components/projector/ProjectorSettingsPanel';
import { ScreenPickerDialog } from '@/components/projector/ScreenPickerDialog';
import { SongEditDialog } from '@/components/projector/SongEditDialog';
import { TodayAnnouncementCard } from '@/components/announcements/TodayAnnouncementCard';
import { getProjectorSettings } from '@/lib/projectorSettings';
import { getSongSlides } from '@/lib/projectorLayout';
import { getOrganistColor } from '@/lib/colors';
import { formatPL, toYMD } from '@/lib/dateUtils';
import { isDevotionOnDate, estimateLiturgicalPeriod, type Devotion, type SongbookLink } from '@/hooks/useDevotions';
import { getCachedLiturgy } from '@/lib/liturgyCache';
import { findSlPageForSong, findLiturgiaPdfForSong, slViewerUrl } from '@/lib/songMatcher';
import { siedleckiPagePath } from '@/data/siedleckiToc';
import { supabase } from '@/integrations/supabase/client';

import type { SongsData, ReadingsData, CalendarData } from '@/lib/liturgyParsers';
import type { ScheduleEntry } from '@/types/schedule';
import type { AnnouncementsData } from '@/hooks/useAnnouncements';
import type { Section } from '@/components/layout/AppSidebar';
import type { Song, PlaylistItem } from '@/types/projector';
import type { useProjector } from '@/hooks/useProjector';

type ProjectorHook = ReturnType<typeof useProjector>;

interface DashboardProps {
  sched: ScheduleEntry[];
  todayStr: string;
  tomorrowStr: string;
  dates: string[];
  organists: string[];
  todayGroup: Record<string, string[]>;
  tomorrowGroup: Record<string, string[]>;
  announcements: { data: AnnouncementsData | null; loading: boolean; error: string };
  devotions: Devotion[];
  devotionsLoading: boolean;
  projector: ProjectorHook;
  onNavigate: (section: Section) => void;
  currentUser?: string;
}

const SONGBOOK_URL = 'https://build-your-songbook.lovable.app';

function SongbookChips({ links }: { links: SongbookLink[] }) {
  if (!links.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {links.map((link, i) => (
        <a key={i} href={`${SONGBOOK_URL}?page=${link.page}`} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/50 text-accent-foreground text-[11px] font-bold hover:bg-accent transition-colors">
          <BookOpen className="w-3 h-3" />
          {link.label ? `${link.label} (str. ${link.page})` : `Śpiewnik str. ${link.page}`}
        </a>
      ))}
    </div>
  );
}

function ScheduleBlock({ title, emoji, dateStr, dates, organists, group }: {
  title: string; emoji: string; dateStr: string; dates: string[]; organists: string[];
  group: Record<string, string[]>;
}) {
  const inRange = dates.includes(dateStr);
  return (
    <div>
      <h4 className="text-xs font-bold text-muted-foreground flex items-center gap-1.5 mb-1.5">
        <span>{emoji}</span> {title}
        <span className="ml-auto text-[10px] font-normal capitalize">{formatPL(new Date(dateStr + 'T12:00:00'))}</span>
      </h4>
      {!inRange ? (
        <p className="text-xs text-muted-foreground italic">Poza zakresem grafiku</p>
      ) : (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {[...organists].sort((a, b) => {
            const ta = (group[a] || [])[0] || 'ZZ';
            const tb = (group[b] || [])[0] || 'ZZ';
            return ta.localeCompare(tb);
          }).map(name => {
            const times = group[name] || [];
            const c = getOrganistColor(name);
            return (
              <div key={name} className="flex items-center gap-1.5 py-1">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                  style={{ background: c.dot }}>{name[0]}</div>
                <span className="font-bold text-xs">{name}</span>
                {times.length > 0 ? (
                  <div className="flex gap-0.5">
                    {times.map((t, i) => (
                      <span key={i} className="px-1 py-0.5 rounded text-[10px] font-bold font-mono"
                        style={{ background: c.chip, color: c.text }}>{t}</span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground italic text-[10px]">wolne</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DevotionsBlock({ title, icon, devotions }: { title: string; icon: React.ReactNode; devotions: Devotion[] }) {
  if (!devotions.length) return null;
  return (
    <div>
      <h4 className="text-xs font-bold text-muted-foreground flex items-center gap-1.5 mb-1.5">
        {icon} {title} ({devotions.length})
      </h4>
      <div className="space-y-1.5">
        {devotions.map(d => (
          <div key={d.id}>
            <p className="text-xs font-semibold text-primary">
              {d.name}
              {d.start_time && <span className="text-muted-foreground font-normal ml-1">({d.start_time})</span>}
            </p>
            {d.description && <p className="text-[11px] text-muted-foreground">{d.description}</p>}
            <SongbookChips links={d.songbook_links} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardPanel({
  sched, todayStr, tomorrowStr, dates, organists, todayGroup, tomorrowGroup,
  announcements, devotions, devotionsLoading, projector, onNavigate, currentUser,
}: DashboardProps) {
  const [projSettings, setProjSettings] = useState(() => getProjectorSettings());
  const [customTextInput, setCustomTextInput] = useState('');
  const [customTextTitle, setCustomTextTitle] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [screenPickerOpen, setScreenPickerOpen] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [previewMode, setPreviewMode] = useState<'collapsed' | 'half' | 'full'>('collapsed');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  // Map: normalized song title → liturgy section name
  const [liturgyCategoryMap, setLiturgyCategoryMap] = useState<Map<string, string>>(new Map());
  const [liturgySections, setLiturgySections] = useState<string[]>([]);
  // Manual category overrides: playlistItem.id → category name
  const [categoryOverrides, setCategoryOverrides] = useState<Map<string, string>>(new Map());
  // Drag state
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [readingsDialog, setReadingsDialog] = useState<{ open: boolean; html: string; loading: boolean }>({ open: false, html: '', loading: false });
  const [liturgicalDay, setLiturgicalDay] = useState<string>('');
  const [liturgicalTags, setLiturgicalTags] = useState<string[]>([]);
  const [announcementRead, setAnnouncementRead] = useState(() => {
    try { return localStorage.getItem('announcementReadDate') === toYMD(new Date()); } catch { return false; }
  });
  const [massCountdown, setMassCountdown] = useState<{ show: boolean; time: string; minutesLeft: number }>({ show: false, time: '', minutesLeft: 0 });
  // New state for refactored right panel
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [selectedOrganist, setSelectedOrganist] = useState<string>(currentUser || '');
  const [announcementPopupOpen, setAnnouncementPopupOpen] = useState(false);
  const [announcementPopupShown, setAnnouncementPopupShown] = useState(false);
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [organistPickerOpen, setOrganistPickerOpen] = useState(false);
  const [resumeOrganist, setResumeOrganist] = useState<string>('');
  const [lastHarmonogramId, setLastHarmonogramId] = useState<string | null>(null);
  const [harmonogramLoaded, setHarmonogramLoaded] = useState(false);
  const [calendarDateLine, setCalendarDateLine] = useState('');
  const [calendarDescLine, setCalendarDescLine] = useState('');
  const [calendarRosaryLine, setCalendarRosaryLine] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  // Songbook viewer mode: normal (in right panel), tall (expand up), wide (pilot+songbook only), fullscreen
  const [songbookMode, setSongbookMode] = useState<'normal' | 'tall'>('normal');
  const [songbookPage, setSongbookPage] = useState<number | null>(null);
  const [songbookCollapsed, setSongbookCollapsed] = useState(false);
  const slidesScrollRef = useRef<HTMLDivElement>(null);
  const activeSlideRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setProjSettings(getProjectorSettings());
    window.addEventListener('projector-settings-changed', handler);
    return () => window.removeEventListener('projector-settings-changed', handler);
  }, []);

  const { state, currentSong, directSong, directVerseIndex, getCurrentText,
    prevSlide, nextSlide, toggleLive, openProjectorWindow,
    songs, filteredSongs, searchQuery, setSearchQuery, searchByContent, setSearchByContent,
    goToItem, removeFromPlaylist, moveInPlaylist, clearPlaylist,
    showCustomText, addCustomTextToPlaylist, addToPlaylist, addPsalmToPlaylist,
    showOnScreen, deleteSong, updateSong, loadBundledDatabase,
    projectorSync,
  } = projector;

  // Keyboard shortcuts (same as ProjectorControl)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault(); nextSlide();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); prevSlide();
      } else if (e.key === '.') {
        e.preventDefault(); toggleLive();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (!directSong && state.currentItemIndex < state.playlist.length - 1) goToItem(state.currentItemIndex + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (!directSong && state.currentItemIndex > 0) goToItem(state.currentItemIndex - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [nextSlide, prevSlide, toggleLive, goToItem, directSong, state.currentItemIndex, state.playlist.length]);

  useEffect(() => {
    (async () => {
      try {
        const [songsCached, readingsCached] = await Promise.all([
          getCachedLiturgy(new Date(), 'songs'),
          getCachedLiturgy(new Date(), 'readings'),
        ]);
        if (!songsCached?.data) return;
        const songsData = songsCached.data as unknown as SongsData;
        if (!songsData?.sets?.length) return;
        const mainSet = songsData.sets[0];
        const map = new Map<string, string>();
        const sectionNames: string[] = [];
        for (const sec of mainSet.sections) {
          sectionNames.push(sec.name);
          for (const item of sec.items) {
            const norm = item.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
            if (norm) map.set(norm, sec.name);
          }
        }
        setLiturgyCategoryMap(map);
        setLiturgySections(sectionNames);

        // Auto-add psalm & acclamation
        const rd = readingsCached?.data as unknown as ReadingsData | null;
        if (rd?.options?.length) {
          const html = rd.options[0]?.contentHtml || '';
          if (html) {
            const div = document.createElement('div');
            div.innerHTML = html;
            const text = div.textContent || '';

            // Psalm
            const psalmMatch = text.match(/Refren:\s*(.+)/i);
            if (psalmMatch) {
              const refrain = psalmMatch[1].trim();
              addPsalmToPlaylist(`Psalm: ${refrain}`);
            }

            // Acclamation
            const ACCL = ['Chwała Tobie, Słowo Boże.', 'Chwała Tobie, Królu wieków.', 'Alleluja, alleluja, alleluja.'];
            const normAccl = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0142/g, 'l').replace(/[.,;:!?'"()]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
            const normText = normAccl(text);
            for (const opt of ACCL) {
              if (normText.includes(normAccl(opt))) {
                addPsalmToPlaylist(`Aklamacja: ${opt}`);
                break;
              }
            }
          }
        }
      } catch {}
    })();
  }, [addPsalmToPlaylist]);

  const activeSong = directSong || currentSong;
  const activeVerseIndex = directSong ? directVerseIndex : state.currentVerseIndex;
  const allSlides = activeSong ? getSongSlides(activeSong) : [];
  const totalVerses = allSlides.length;
  const currentText = getCurrentText();
  const { isLive } = state;
  const playlistLength = state.playlist.length;

  // Wrap toggleLive: going live → show slides, stopping → collapse both
  const handleToggleLive = useCallback(() => {
    if (!isLive) {
      setPreviewMode('half');
    } else {
      setPreviewMode('collapsed');
    }
    toggleLive();
  }, [isLive, toggleLive]);

  const goPrevSong = useCallback(() => {
    if (state.currentItemIndex > 0) goToItem(state.currentItemIndex - 1);
  }, [state.currentItemIndex, goToItem]);

  const goNextSong = useCallback(() => {
    if (state.currentItemIndex < state.playlist.length - 1) goToItem(state.currentItemIndex + 1);
  }, [state.currentItemIndex, state.playlist.length, goToItem]);

  const handleSendCustomText = () => {
    if (!customTextInput.trim()) return;
    showCustomText(customTextInput.trim(), customTextTitle.trim() || undefined);
    setCustomTextInput('');
    setCustomTextTitle('');
  };

  const handleAddCustomTextToPlaylist = () => {
    if (!customTextInput.trim()) return;
    addCustomTextToPlaylist(customTextInput.trim(), customTextTitle.trim() || undefined);
    setCustomTextInput('');
    setCustomTextTitle('');
  };

  const today = useMemo(() => new Date(), []);
  const tomorrow = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d; }, []);
  const currentPeriod = useMemo(() => estimateLiturgicalPeriod(today), [today]);
  const tomorrowPeriod = useMemo(() => estimateLiturgicalPeriod(tomorrow), [tomorrow]);

  const todayDevotions = useMemo(
    () => devotions.filter(d => isDevotionOnDate(d, today, currentPeriod)),
    [devotions, today, currentPeriod]
  );
  const tomorrowDevotions = useMemo(
    () => devotions.filter(d => isDevotionOnDate(d, tomorrow, tomorrowPeriod)),
    [devotions, tomorrow, tomorrowPeriod]
  );

  const playlistSongIds = useMemo(() => new Set(state.playlist.map(p => p.songId)), [state.playlist]);
  const playlistTitles = useMemo(() => new Set(state.playlist.map(p => p.title)), [state.playlist]);

  const suggestedTargets = useMemo<SuggestedSongsTarget[]>(() => [{
    key: 'projector',
    label: 'Rzutnik',
    icon: <Monitor className="w-3 h-3 text-primary" />,
    enabled: true,
    onAdd: (song, title) => {
      if (song) addToPlaylist(song);
      else addPsalmToPlaylist(title);
    },
    onRemoveBySongId: (songId) => {
      const item = state.playlist.find(p => p.songId === songId);
      if (item) removeFromPlaylist(item.id);
    },
    isInList: (query) => {
      if (query.startsWith('title:')) return playlistTitles.has(query.slice(6));
      return playlistSongIds.has(query);
    },
  }], [addToPlaylist, addPsalmToPlaylist, removeFromPlaylist, state.playlist, playlistSongIds, playlistTitles]);

  const handleLoadBundled = async () => {
    setImportMsg('');
    try {
      const count = await loadBundledDatabase();
      setImportMsg(`Załadowano ${count} pieśni z wbudowanej bazy`);
  } catch { setImportMsg('Błąd ładowania wbudowanej bazy'); }
  };

  // Fixed liturgy categories that always appear (matching cache names from SuggestedSongs)
  // Gloria is conditionally inserted between Wejście and Psalm when GLORIA tag is present
  const FIXED_CATEGORIES = useMemo(() => {
    const base = ['Śpiew na Wejście'];
    if (liturgicalTags.includes('GLORIA')) base.push('Chwała na wysokości Bogu');
    base.push('Psalm responsoryjny', 'Aklamacja',
      'Śpiew na Przygotowanie Darów', 'Śpiew na Komunię',
      'Śpiew na Uwielbienie', 'Śpiew na Zakończenie');
    return base;
  }, [liturgicalTags]);

  // Group playlist items by liturgy category
  const categorizedPlaylist = useMemo(() => {
    const normTitle = (t: string) => t.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    type CategorizedItem = { item: PlaylistItem; index: number };
    const grouped = new Map<string, CategorizedItem[]>();
    for (let i = 0; i < state.playlist.length; i++) {
      const item = state.playlist[i];
      let category = categoryOverrides.get(item.id) || null;
      if (!category) {
        if (item.title.startsWith('Psalm:')) { category = 'Psalm responsoryjny'; }
        else if (item.title.startsWith('Aklamacja:')) { category = 'Aklamacja'; }
        else if (item.songId === '56' || normTitle(item.title).includes('chwala na wysokosci bogu')) { category = 'Chwała na wysokości Bogu'; }
        else {
          const norm = normTitle(item.title);
          category = liturgyCategoryMap.get(norm) || null;
          if (!category) {
            for (const [key, cat] of liturgyCategoryMap) {
              if (norm.includes(key) || key.includes(norm)) { category = cat; break; }
            }
          }
        }
      }
      const catName = category || 'Inne';
      if (!grouped.has(catName)) grouped.set(catName, []);
      grouped.get(catName)!.push({ item, index: i });
    }

    // Build section order: use FIXED_CATEGORIES as canonical, merge any liturgySections that don't overlap
    const sectionOrder = [...FIXED_CATEGORIES];
    const normCat = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const fixedNorms = new Set(FIXED_CATEGORIES.map(normCat));
    for (const s of liturgySections) {
      if (!fixedNorms.has(normCat(s)) && !sectionOrder.includes(s)) {
        const zakIdx = sectionOrder.indexOf('Zakończenie');
        if (zakIdx >= 0) sectionOrder.splice(zakIdx, 0, s);
        else sectionOrder.push(s);
      }
    }

    // Remap grouped keys: if a cache section name matches a fixed category, merge into it
    for (const [key, items] of [...grouped.entries()]) {
      const norm = normCat(key);
      const fixedMatch = FIXED_CATEGORIES.find(f => normCat(f) === norm);
      if (fixedMatch && fixedMatch !== key) {
        const existing = grouped.get(fixedMatch) || [];
        grouped.set(fixedMatch, [...existing, ...items]);
        grouped.delete(key);
      }
    }

    // Ensure ALL fixed categories exist (even if empty)
    for (const cat of sectionOrder) {
      if (!grouped.has(cat)) grouped.set(cat, []);
    }

    if (grouped.has('Inne') && !sectionOrder.includes('Inne')) sectionOrder.push('Inne');

    const allCats = [...grouped.keys()].sort((a, b) => {
      if (a === 'Inne') return 1;
      if (b === 'Inne') return -1;
      const ai = sectionOrder.indexOf(a);
      const bi = sectionOrder.indexOf(b);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return allCats.map(name => ({ name, items: grouped.get(name)! }));
  }, [state.playlist, liturgyCategoryMap, liturgySections, categoryOverrides]);

  const moveToCategory = useCallback((itemId: string, targetCategory: string) => {
    setCategoryOverrides(prev => {
      const next = new Map(prev);
      next.set(itemId, targetCategory);
      return next;
    });
  }, []);

  // All available categories for the move menu — only fixed + Inne
  const allCategories = useMemo(() => {
    return [...FIXED_CATEGORIES, 'Inne'];
  }, []);

  const openReadings = useCallback(async () => {
    setReadingsDialog({ open: true, html: '', loading: true });
    try {
      const result = await loadLiturgy(new Date(), 'readings');
      const rd = result.data as ReadingsData;
      const fullHtml = rd?.options?.[0]?.contentHtml || '<p>Brak danych czytań</p>';
      setReadingsDialog({ open: true, html: fullHtml, loading: false });
    } catch {
      setReadingsDialog({ open: true, html: '<p>Błąd pobierania czytań</p>', loading: false });
    }
  }, []);

  const toggleSection = useCallback((name: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  // Auto-scroll to active slide with 2-slide buffer (nearest instead of start)
  useEffect(() => {
    activeSlideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeVerseIndex, activeSong?.id]);

  // Auto-track current song → Siedlecki page
  useEffect(() => {
    if (!activeSong) return;
    const page = findSlPageForSong(activeSong.title);
    if (page) setSongbookPage(page);
  }, [activeSong?.id, activeSong?.title]);

  // Fetch liturgical day title + GLORIA/CREDO from calendar cache (based on selectedDate)
  useEffect(() => {
    (async () => {
      try {
        const cached = await getCachedLiturgy(selectedDate, 'calendar');
        if (!cached?.data) {
          console.warn('[Dashboard] Brak danych kalendarza dla', toYMD(selectedDate));
          return;
        }
        const cal = cached.data as unknown as CalendarData;
        if (cal.title) setLiturgicalDay(cal.title);

        // Extract liturgical info from calendar HTML
        const div = document.createElement('div');
        div.innerHTML = cal.contentHtml || '';
        document.body.appendChild(div);
        const fullText = div.innerText || div.textContent || '';
        document.body.removeChild(div);

        // Split into paragraphs (double-newline) or lines
        const allLines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
        
        // Line 0 = date (already have from datepicker)
        // Find period description: contains "tydzień" or "okres" or "wspomnienie" or "uroczystość" or "święto"
        const descLine = allLines.find(l => 
          /tydzień|tydzien|okres|wspomnienie|uroczystość|uroczystosc|święto|swieto|oktawa/i.test(l)
        ) || '';
        
        // Find rosary mysteries line
        const rosaryLine = allLines.find(l => /tajemnice różańca|tajemnice rozanca/i.test(l)) || '';
        
        setCalendarDateLine(allLines[0] || '');
        setCalendarDescLine(descLine);
        setCalendarRosaryLine(rosaryLine);

        const tags: string[] = [];
        if (/\bGLORIA\b/i.test(fullText)) tags.push('GLORIA');
        if (/\bCREDO\b/i.test(fullText)) tags.push('CREDO');
        setLiturgicalTags(tags);
        
        console.log('[Dashboard] Kalendarz:', { descLine, rosaryLine, tags, allLines: allLines.slice(0, 6) });
      } catch (e) {
        console.warn('[Dashboard] Błąd kalendarza:', e);
      }
    })();
  }, [selectedDate]);

  // Auto-add Gloria (#518) when GLORIA tag is detected and songs are loaded
  const gloriaAutoAddedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!harmonogramLoaded) return;
    if (!liturgicalTags.includes('GLORIA')) return;
    if (songs.length === 0) return;
    const dateKey = toYMD(selectedDate);
    if (gloriaAutoAddedRef.current === dateKey) return;
    
    const gloriaSong = songs.find(s => s.id === '56');
    if (!gloriaSong) return;
    if (playlistSongIds.has('56')) {
      gloriaAutoAddedRef.current = dateKey;
      return;
    }
    
    gloriaAutoAddedRef.current = dateKey;
    addToPlaylist(gloriaSong);
    console.log('[Dashboard] Auto-added Gloria #56:', gloriaSong.title);
  }, [harmonogramLoaded, liturgicalTags, songs.length, selectedDate, playlistSongIds, addToPlaylist]);

  // Mass countdown — check every 30s if any mass is within 5 min
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const todayEntries = sched.filter(e => e.date === todayStr);
      for (const entry of todayEntries) {
        const [h, m] = entry.time.split(':').map(Number);
        const massMin = h * 60 + m;
        const diff = massMin - nowMin;
        if (diff > 0 && diff <= 5) {
          setMassCountdown({ show: true, time: entry.time, minutesLeft: diff });
          return;
        }
      }
      setMassCountdown(prev => prev.show ? { show: false, time: '', minutesLeft: 0 } : prev);
    };
    check();
    const iv = setInterval(check, 30_000);
    return () => clearInterval(iv);
  }, [sched, todayStr]);

  const markAnnouncementRead = useCallback(() => {
    setAnnouncementRead(true);
    setAnnouncementPopupOpen(false);
    try { localStorage.setItem('announcementReadDate', toYMD(new Date())); } catch {}
  }, []);

  // Show announcement popup on launch (once)
  useEffect(() => {
    if (!announcementPopupShown && announcements.data?.selectedAnnouncement && !announcementRead) {
      setAnnouncementPopupOpen(true);
      setAnnouncementPopupShown(true);
    }
  }, [announcements.data, announcementRead, announcementPopupShown]);

  // Auto-load harmonogram for current user on mount
  useEffect(() => {
    if (!currentUser) { setHarmonogramLoaded(true); return; }
    setSelectedOrganist(currentUser);
    const dateStr = toYMD(selectedDate);
    (async () => {
      try {
        const { data } = await supabase.from('harmonograms')
          .select('id, playlist')
          .eq('mass_date', dateStr)
          .eq('organist', currentUser)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          setLastHarmonogramId(data.id);
          if (Array.isArray(data.playlist) && (data.playlist as any[]).length > 0) {
            clearPlaylist();
            for (const item of data.playlist as { title: string; songId?: string }[]) {
              if (item.songId) {
                const song = songs.find(s => s.id === item.songId);
                if (song) addToPlaylist(song);
                else addPsalmToPlaylist(item.title);
              } else {
                addPsalmToPlaylist(item.title);
              }
            }
          }
        }
        setHarmonogramLoaded(true);
      } catch { setHarmonogramLoaded(true); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // (auto-save moved after saveCurrentHarmonogram declaration below)

  // Resume prompt on visibility change (screen wake)
  useEffect(() => {
    let lastHidden = 0;
    const handler = () => {
      if (document.hidden) {
        lastHidden = Date.now();
      } else {
        if (lastHidden && Date.now() - lastHidden > 30_000) {
          setResumeOrganist('');
          setResumeDialogOpen(true);
        }
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  // Save current harmonogram to DB (fire-and-forget)
  // Rule: max 1 harmonogram per organist per date — always upsert
  const saveCurrentHarmonogram = useCallback(async () => {
    if (!selectedOrganist || state.playlist.length === 0) return;
    const dateStr = toYMD(selectedDate);
    const playlistData = state.playlist.map(p => ({ title: p.title, songId: p.songId }));
    try {
      if (lastHarmonogramId) {
        await supabase.from('harmonograms').update({
          playlist: playlistData,
          liturgical_day: liturgicalDay || null,
        }).eq('id', lastHarmonogramId).select();
      } else {
        // Check if one already exists for this organist+date
        const { data: existing } = await supabase.from('harmonograms')
          .select('id')
          .eq('mass_date', dateStr)
          .eq('organist', selectedOrganist)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing) {
          setLastHarmonogramId(existing.id);
          await supabase.from('harmonograms').update({
            playlist: playlistData,
            liturgical_day: liturgicalDay || null,
          }).eq('id', existing.id).select();
        } else {
          const { data } = await supabase.from('harmonograms').insert({
            mass_date: dateStr,
            organist: selectedOrganist,
            playlist: playlistData,
            liturgical_day: liturgicalDay || null,
          }).select('id').single();
          if (data) setLastHarmonogramId(data.id);
        }
      }
    } catch (e) { console.warn('Błąd zapisu harmonogramu:', e); }
  }, [selectedOrganist, state.playlist, selectedDate, liturgicalDay, lastHarmonogramId]);

  // Manual save with feedback
  const [saving, setSaving] = useState(false);
  const handleManualSave = useCallback(async () => {
    if (!selectedOrganist || state.playlist.length === 0) {
      toast.error('Brak pieśni do zapisania');
      return;
    }
    setSaving(true);
    await saveCurrentHarmonogram();
    const dateStr = toYMD(selectedDate);
    const dayName = format(selectedDate, 'EEEE', { locale: pl });
    const label = calendarDescLine
      ? `${dateStr}-(${dayName}) ${calendarDescLine}`
      : `${dateStr}-(${dayName})`;
    toast.success(`Zapisano: ${label}`);
    setSaving(false);
  }, [saveCurrentHarmonogram, selectedOrganist, state.playlist.length, selectedDate, calendarDescLine]);

  const handleResumeOrganistPick = useCallback((name: string) => {
    setResumeOrganist(name);
  }, []);

  const handleResumeContinue = useCallback(async () => {
    if (!resumeOrganist) return;
    // If same organist — just continue
    if (resumeOrganist === selectedOrganist) {
      setResumeDialogOpen(false);
      return;
    }
    // Different organist wants to continue — duplicate harmonogram
    if (state.playlist.length > 0) {
      // Save current under old organist first
      await saveCurrentHarmonogram();
      // Create duplicate under new organist
      const dateStr = toYMD(selectedDate);
      const playlistData = state.playlist.map(p => ({ title: p.title, songId: p.songId }));
      try {
        const { data } = await supabase.from('harmonograms').insert({
          mass_date: dateStr,
          organist: resumeOrganist,
          playlist: playlistData,
          liturgical_day: liturgicalDay || null,
        }).select('id').single();
        if (data) setLastHarmonogramId(data.id);
      } catch (e) { console.warn('Błąd duplikacji harmonogramu:', e); }
    }
    setSelectedOrganist(resumeOrganist);
    setResumeDialogOpen(false);
  }, [resumeOrganist, selectedOrganist, state.playlist, saveCurrentHarmonogram, selectedDate, liturgicalDay]);

  const handleResumeNew = useCallback(async () => {
    if (!resumeOrganist) return;
    // Save old harmonogram under old organist
    await saveCurrentHarmonogram();
    // Start fresh
    clearPlaylist();
    setLastHarmonogramId(null);
    setSelectedOrganist(resumeOrganist);
    setResumeDialogOpen(false);
  }, [resumeOrganist, saveCurrentHarmonogram, clearPlaylist]);

  const handleOrganistPick = useCallback(async (name: string) => {
    setSelectedOrganist(name);
    setOrganistPickerOpen(false);
    // Try to load existing harmonogram for this organist+date (max 1 per organist+date)
    const dateStr = toYMD(selectedDate);
    try {
      const { data } = await supabase.from('harmonograms')
        .select('id, playlist')
        .eq('mass_date', dateStr)
        .eq('organist', name)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setLastHarmonogramId(data.id);
        // Auto-restore saved playlist
        if (Array.isArray(data.playlist) && (data.playlist as any[]).length > 0) {
          clearPlaylist();
          for (const item of data.playlist as { title: string; songId?: string }[]) {
            if (item.songId) {
              const song = songs.find(s => s.id === item.songId);
              if (song) addToPlaylist(song);
              else addPsalmToPlaylist(item.title);
            } else {
              addPsalmToPlaylist(item.title);
            }
          }
        }
      } else {
        setLastHarmonogramId(null);
      }
    } catch {}
  }, [selectedDate, songs, clearPlaylist, addToPlaylist, addPsalmToPlaylist]);

  // Save organist selection to localStorage
  useEffect(() => {
    if (selectedOrganist) {
      try { localStorage.setItem('dashboardOrganist', selectedOrganist); } catch {}
    }
  }, [selectedOrganist]);

  // On mount, if organist already selected, find existing harmonogram for today
  useEffect(() => {
    if (!selectedOrganist || lastHarmonogramId) return;
    const dateStr = toYMD(selectedDate);
    supabase.from('harmonograms')
      .select('id')
      .eq('mass_date', dateStr)
      .eq('organist', selectedOrganist)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setLastHarmonogramId(data.id);
      });
  }, [selectedOrganist, selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save harmonogram to DB when playlist changes (debounced)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!selectedOrganist || state.playlist.length === 0) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveCurrentHarmonogram(), 3000);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [state.playlist, selectedOrganist, saveCurrentHarmonogram]);

  // Pilot button styles
  const btnBase = "flex items-center justify-center rounded-lg border active:scale-95 transition-all";

  // Songbook viewer component
  const currentSbPage = songbookPage || 1;
  const sbLeftPage = currentSbPage % 2 === 0 ? currentSbPage : currentSbPage;
  const sbRightPage = Math.min(sbLeftPage + 1, 1404);
  const hasSongbookPage = songbookPage !== null;
  const songbookViewer = hasSongbookPage ? (
    <div className={cn(
      "flex flex-col border border-border rounded-xl bg-card overflow-hidden",
      songbookCollapsed ? "shrink-0" : "flex-1 min-h-0"
    )}>
      {/* Header — clickable to toggle collapse */}
      <div
        className="flex items-center gap-1 px-2 py-1 border-b border-border bg-muted/30 shrink-0 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setSongbookCollapsed(c => !c)}
      >
        <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-[10px] font-bold text-muted-foreground truncate">
          Śpiewnik str. {sbLeftPage}–{sbRightPage}
          {activeSong && <span className="text-foreground ml-1">— {activeSong.title}</span>}
        </span>
        <div className="ml-auto flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
          {!songbookCollapsed && (<>
            <button onClick={() => setSongbookPage(p => Math.max(1, (p || 1) - 2))}
              className="p-0.5 rounded hover:bg-muted transition-colors" title="Poprzednie strony">
              <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button onClick={() => setSongbookPage(p => Math.min(1404, (p || 1) + 2))}
              className="p-0.5 rounded hover:bg-muted transition-colors" title="Następne strony">
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <div className="w-px h-3 bg-border mx-0.5" />
            <button
              onClick={() => setSongbookMode(m => m === 'tall' ? 'normal' : 'tall')}
              className={cn("p-0.5 rounded hover:bg-muted transition-colors", songbookMode === 'tall' && "bg-primary/15 text-primary")}
              title={songbookMode === 'tall' ? 'Zmniejsz' : 'Rozwiń (pilot + slajdy + śpiewnik)'}
            >
              {songbookMode === 'tall' ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            </button>
          </>)}
          <button
            onClick={(e) => { e.stopPropagation(); setSongbookCollapsed(c => !c); }}
            className="p-0.5 rounded hover:bg-muted transition-colors"
            title={songbookCollapsed ? 'Rozwiń śpiewnik' : 'Zwiń śpiewnik'}
          >
            {songbookCollapsed ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
        </div>
      </div>
      {/* Two-page spread — hidden when collapsed */}
      {!songbookCollapsed && (
        <div
          className="flex-1 min-h-0 overflow-auto flex items-center justify-center bg-muted/10 gap-0.5 p-1 cursor-pointer"
          onClick={() => setSongbookMode(m => m === 'tall' ? 'normal' : 'tall')}
          onDoubleClick={(e) => { e.stopPropagation(); onNavigate('songbook'); }}
        >
          <img
            src={siedleckiPagePath(sbLeftPage)}
            alt={`Śpiewnik str. ${sbLeftPage}`}
            className="h-full w-auto object-contain max-w-[50%]"
          />
          {sbRightPage > sbLeftPage && (
            <img
              src={siedleckiPagePath(sbRightPage)}
              alt={`Śpiewnik str. ${sbRightPage}`}
              className="h-full w-auto object-contain max-w-[50%]"
            />
          )}
        </div>
      )}
    </div>
  ) : null;



  return (
    <div className="grid grid-cols-8 gap-2 h-[calc(100vh-6rem)]">
      {/* === COL 1: Pilot (1/8) === */}
      <div className="col-span-1 flex flex-col items-stretch p-1.5 gap-1.5 border border-border bg-muted/30 rounded-xl min-h-0">
        <div className="text-center shrink-0 py-0.5">
          <div className={cn("w-2.5 h-2.5 rounded-full mx-auto mb-0.5", isLive ? "bg-success animate-pulse" : "bg-warning")} />
          <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">{isLive ? 'Live' : 'Stop'}</span>
        </div>
        <button onClick={() => openProjectorWindow()} className={cn(btnBase, "flex-1 w-full", "border-border bg-card hover:bg-muted/30")} title="Otwórz projekcję">
          <ExternalLink className="h-[3vh] w-[3vh] text-foreground" />
        </button>
        <button onClick={handleToggleLive} className={cn(btnBase, "flex-1 w-full",
          isLive ? "border-primary/40 bg-primary/10 text-primary" : "border-muted/40 bg-muted/10 text-muted-foreground"
        )} title={isLive ? 'Wyłącz' : 'Włącz'}>
          {isLive ? <Monitor className="h-[3vh] w-[3vh]" /> : <MonitorOff className="h-[3vh] w-[3vh]" />}
        </button>
        <button onClick={goPrevSong} disabled={!!directSong || playlistLength === 0 || state.currentItemIndex <= 0}
          className={cn(btnBase, "flex-1 w-full", "border-muted-foreground/30 bg-card hover:bg-muted/30 disabled:opacity-30")} title="Poprzednia pieśń">
          <ChevronsLeft className="h-[3vh] w-[3vh] text-muted-foreground" />
        </button>
        <button onClick={prevSlide} disabled={playlistLength === 0}
          className={cn(btnBase, "flex-1 w-full", "border-destructive/40 bg-card hover:bg-destructive/10 disabled:opacity-30")} title="Poprzedni slajd">
          <ChevronLeft className="h-[3vh] w-[3vh] text-destructive" />
        </button>
        <button onClick={nextSlide} disabled={playlistLength === 0}
          className={cn(btnBase, "flex-1 w-full", "border-success/40 bg-card hover:bg-success/10 disabled:opacity-30")} title="Następny slajd">
          <ChevronRight className="h-[3vh] w-[3vh] text-success" />
        </button>
        <button onClick={goNextSong} disabled={!!directSong || playlistLength === 0 || state.currentItemIndex >= state.playlist.length - 1}
          className={cn(btnBase, "flex-1 w-full", "border-muted-foreground/30 bg-card hover:bg-muted/30 disabled:opacity-30")} title="Następna pieśń">
          <ChevronsRight className="h-[3vh] w-[3vh] text-muted-foreground" />
        </button>
      </div>

      {/* === COL 2-4: Ekran + Slajdy + Tabs (3/8 normal, 2/8 tall) === */}
      <div className={cn("flex flex-col min-h-0 gap-1.5", songbookMode === 'tall' ? "col-span-2" : "col-span-3")}>
        {/* PANEL 1: Ekran (Screen preview) — max 50% height */}
        <div className={cn(
          "rounded-xl border border-border bg-card overflow-hidden flex flex-col transition-all duration-300 ease-in-out",
          previewMode === 'full' ? "min-h-0" : "shrink-0 grow-0"
        )} style={previewMode === 'full' ? { maxHeight: '50%', flex: '1 1 50%' } : { height: 'auto' }}>
          <button
            onClick={() => setPreviewMode(m => m === 'full' ? 'half' : 'full')}
            className="px-2 py-0.5 border-b border-border flex items-center justify-between hover:bg-muted/30 transition-colors shrink-0"
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <div className={cn("w-2 h-2 rounded-full shrink-0", isLive ? "bg-success animate-pulse" : "bg-warning")} />
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                {isLive ? 'LIVE' : 'STOP'}
              </span>
              {activeSong && (
                <span className="text-[10px] text-foreground font-medium truncate min-w-0">
                  {activeSong.title}
                  <span className="text-muted-foreground ml-1 text-[9px]">{activeVerseIndex + 1}/{totalVerses}</span>
                </span>
              )}
            </div>
            <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform duration-200 shrink-0", previewMode !== 'full' && "-rotate-90")} />
          </button>
          {previewMode === 'full' && (
            <div className="flex-1 min-h-0 cursor-pointer" onClick={() => onNavigate('projector')}>
              <ProjectorMiniature
                text={currentText} isLive={isLive} projSettings={projSettings}
                playlistLength={playlistLength} currentSong={activeSong}
                currentVerseIndex={activeVerseIndex} totalVerses={totalVerses}
              />
            </div>
          )}
        </div>

        {/* PANEL 2: Slajdy — compact inline text */}
        <div className={cn(
          "rounded-xl border border-border bg-card overflow-hidden flex flex-col transition-all duration-300 ease-in-out",
          previewMode === 'collapsed' ? "shrink-0 grow-0" : "flex-1 min-h-0"
        )} style={previewMode === 'collapsed' ? { height: 'auto' } : undefined}>
          <button
            onClick={() => setPreviewMode(m => m === 'collapsed' ? 'half' : 'collapsed')}
            className="px-2 py-0.5 border-b border-border flex items-center justify-between hover:bg-muted/30 transition-colors shrink-0"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Slajdy</span>
              {activeSong && (
                <span className="text-[10px] text-muted-foreground">{activeVerseIndex + 1}/{totalVerses}</span>
              )}
            </div>
            <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform duration-200 shrink-0", previewMode === 'collapsed' && "-rotate-90")} />
          </button>
          {previewMode !== 'collapsed' && (
            <div className="flex-1 min-h-0 overflow-auto p-1.5" ref={slidesScrollRef}>
              {activeSong ? (
                <div className="space-y-1">
                  {allSlides.map((slideInfo, i) => (
                    <div
                      key={i}
                      ref={i === activeVerseIndex ? activeSlideRef : undefined}
                      className={cn(
                        "rounded-lg p-2 cursor-pointer transition-colors",
                        i === activeVerseIndex
                          ? "bg-primary/10 border border-primary/30 text-foreground font-medium"
                          : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                      )}
                      onClick={() => goToItem(state.currentItemIndex, i)}
                    >
                      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">
                        Slajd {i + 1}
                      </span>
                      <p className="text-xs leading-relaxed">{slideInfo.slide.text.replace(/<\/?[biu]>/g, '').replace(/\n/g, ' ')}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-3">Wybierz pieśń</p>
              )}
            </div>
          )}
        </div>

        {/* PANEL 3: Tabs */}
        <div className={cn(
          "rounded-xl border border-border bg-card overflow-hidden flex flex-col transition-all duration-300 ease-in-out",
          previewMode === 'full' ? "flex-1 min-h-0" : previewMode === 'half' ? "flex-1 min-h-0" : "flex-[4] min-h-0"
        )}>
          <Tabs defaultValue="plan" className="flex flex-col h-full min-h-0">
            <TabsList className="w-full shrink-0 rounded-none border-b border-border h-7">
              <TabsTrigger value="plan" className="flex-1 gap-0.5 text-[10px] px-0.5 h-6">
                <BookOpen className="w-2.5 h-2.5" /> Plan
              </TabsTrigger>
              <TabsTrigger value="suggestions" className="flex-1 gap-0.5 text-[10px] px-0.5 h-6">
                <Sparkles className="w-2.5 h-2.5" /> Propozycje
              </TabsTrigger>
              <TabsTrigger value="library" className="flex-1 gap-0.5 text-[10px] px-0.5 h-6">
                <Database className="w-2.5 h-2.5" /> Baza
              </TabsTrigger>
              <TabsTrigger value="message" className="flex-1 gap-0.5 text-[10px] px-0.5 h-6">
                <MessageSquare className="w-2.5 h-2.5" /> Komunikat
              </TabsTrigger>
              <TabsTrigger value="connect" className="w-6 px-0 h-6" title="Połączenie">
                <Globe className="w-2.5 h-2.5" />
              </TabsTrigger>
            </TabsList>

            <TabsContent value="plan" className="flex-1 min-h-0 mt-0">
              <div className="h-full overflow-auto px-1.5 py-1">
                {categorizedPlaylist.length > 0 ? (
                  <div className="space-y-1">
                    {categorizedPlaylist.map(({ name, items }) => {
                      const isOpen = !collapsedSections.has(name);
                      const isDragOverCat = dragItemId && dragOverCategory === name && !dropTargetId;
                      return (
                        <div
                          key={name}
                          className={cn(
                            "rounded-lg border overflow-hidden transition-colors",
                            isDragOverCat ? "border-primary bg-primary/5" : "border-border"
                          )}
                          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCategory(name); }}
                          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setDragOverCategory(null); setDropTargetId(null); } }}
                          onDrop={e => {
                            e.preventDefault();
                            const id = e.dataTransfer.getData('text/plain');
                            if (id) {
                              if (dropTargetId) {
                                // Reorder: move dragged item before dropTargetId
                                const fromIdx = state.playlist.findIndex(p => p.id === id);
                                const toIdx = state.playlist.findIndex(p => p.id === dropTargetId);
                                if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
                                  moveInPlaylist(fromIdx, toIdx);
                                }
                                // Also set category if different
                                moveToCategory(id, name);
                              } else {
                                moveToCategory(id, name);
                              }
                              setDragItemId(null);
                              setDragOverCategory(null);
                              setDropTargetId(null);
                            }
                          }}
                        >
                          <button
                            onClick={() => toggleSection(name)}
                            className="w-full flex items-center gap-1.5 px-2 py-1 bg-muted/40 hover:bg-muted/60 transition-colors"
                          >
                            <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform", !isOpen && "-rotate-90")} />
                            <span className="text-[10px] font-semibold text-muted-foreground">{name}</span>
                            <span className="text-[9px] text-muted-foreground ml-auto">{items.length}</span>
                          </button>
                          {isOpen && (
                            <div className="px-1 py-0.5">
                              {items.map(({ item, index }) => {
                                const isActive = index === state.currentItemIndex;
                                const isDragging = dragItemId === item.id;
                                const isDropTarget = dropTargetId === item.id;
                                const isPsalmOrAccl = item.title.startsWith('Psalm:') || item.title.startsWith('Aklamacja:');
                                const slPage = isPsalmOrAccl ? null : findSlPageForSong(item.title);
                                const pdfUrl = isPsalmOrAccl ? null : (!slPage ? findLiturgiaPdfForSong(item.title) : null);
                                const displayTitle = item.title === item.title.toUpperCase() && item.title.length > 3
                                  ? item.title.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())
                                  : item.title;
                                return (
                                  <div key={item.id}>
                                    {isDropTarget && (
                                      <div className="h-0.5 bg-primary rounded-full mx-2 my-0.5" />
                                    )}
                                    <div
                                      draggable
                                      onDragStart={e => {
                                        setDragItemId(item.id);
                                        e.dataTransfer.effectAllowed = 'move';
                                        e.dataTransfer.setData('text/plain', item.id);
                                      }}
                                      onDragEnd={() => { setDragItemId(null); setDragOverCategory(null); setDropTargetId(null); }}
                                      onDragOver={e => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (item.id !== dragItemId) {
                                          setDropTargetId(item.id);
                                          setDragOverCategory(name);
                                        }
                                      }}
                                      className={cn(
                                        "group flex items-center gap-1 px-1.5 py-1 rounded cursor-grab transition-all",
                                        isDragging && "opacity-40",
                                        !isDragging && isActive && (isPsalmOrAccl ? "bg-amber-500/15 text-amber-600" : "bg-primary/10 text-primary"),
                                        !isDragging && !isActive && (isPsalmOrAccl ? "text-amber-600 hover:bg-amber-500/10" : "text-foreground hover:bg-muted/40")
                                      )}
                                      onClick={() => { if (!dragItemId) goToItem(index); }}
                                    >
                                      <GripVertical className={cn("w-3 h-3 shrink-0", isPsalmOrAccl ? "text-amber-400/50" : "text-muted-foreground/50")} />
                                      <span className={cn("text-xs truncate flex-1 min-w-0", isActive && "font-medium")}>
                                        {displayTitle}
                                      </span>
                                      {isPsalmOrAccl && (
                                        <button
                                          onClick={e => { e.stopPropagation(); openReadings(); }}
                                          className="p-0.5 shrink-0 text-amber-500 hover:text-amber-400 transition-colors"
                                          title="Pokaż czytania"
                                        >
                                          <ScrollText className="w-3 h-3" />
                                        </button>
                                      )}
                                      {slPage && (
                                        <a href={slViewerUrl(slPage)} target="_blank" rel="noopener noreferrer"
                                          onClick={e => e.stopPropagation()}
                                          className="p-0.5 shrink-0 text-amber-500 hover:text-amber-400 transition-colors"
                                          title={`Siedlecki str. ${slPage}`}>
                                          <BookOpen className="w-3 h-3" />
                                        </a>
                                      )}
                                      {!slPage && pdfUrl && (
                                        <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                                          onClick={e => e.stopPropagation()}
                                          className="p-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                                          title="PDF">
                                          <FileText className="w-3 h-3" />
                                        </a>
                                      )}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); removeFromPlaylist(item.id); }}
                                        className="text-muted-foreground hover:text-destructive p-0.5 shrink-0 opacity-0 group-hover:opacity-100"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col gap-px">
                    {state.playlist.map((item, index) => {
                      const isActive = index === state.currentItemIndex;
                      const slPage = findSlPageForSong(item.title);
                      const pdfUrl = !slPage ? findLiturgiaPdfForSong(item.title) : null;
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "group flex items-center gap-1 px-1.5 py-1 rounded cursor-pointer transition-colors",
                            isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/40"
                          )}
                          onClick={() => goToItem(index)}
                        >
                          <span className={cn("text-[10px] font-mono w-4 shrink-0 text-center", isActive ? "text-primary" : "text-muted-foreground")}>
                            {index + 1}
                          </span>
                          <span className={cn("text-xs truncate flex-1 min-w-0", isActive && "font-medium")}>
                            {item.title}
                          </span>
                          {slPage && (
                            <a href={slViewerUrl(slPage)} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()} className="p-0.5 shrink-0 text-amber-500 hover:text-amber-400" title={`Siedlecki str. ${slPage}`}>
                              <BookOpen className="w-3 h-3" />
                            </a>
                          )}
                          {!slPage && pdfUrl && (
                            <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()} className="p-0.5 shrink-0 text-muted-foreground hover:text-foreground" title="PDF">
                              <FileText className="w-3 h-3" />
                            </a>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); removeFromPlaylist(item.id); }}
                            className="text-muted-foreground hover:text-destructive p-0.5 shrink-0 opacity-0 group-hover:opacity-100">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="suggestions" className="flex-1 min-h-0 mt-0">
              <div className="h-full">
                <SuggestedSongs songs={songs} date={today} targets={suggestedTargets}
                  onAddCustomTextToPlaylist={addCustomTextToPlaylist}
                  onNextSlide={nextSlide} onPrevSlide={prevSlide}
                  onNextSong={goNextSong} onPrevSong={goPrevSong}
                  onToggleLive={handleToggleLive} isLive={isLive}
                  slideInfo={activeSong ? `${activeVerseIndex + 1}/${totalVerses}` : undefined} />
              </div>
            </TabsContent>

            <TabsContent value="library" className="flex-1 min-h-0 mt-0">
              <div className="h-full">
                <SongLibrary songs={songs} filteredSongs={filteredSongs}
                  searchQuery={searchQuery} onSearchChange={setSearchQuery}
                  onLoadBundled={handleLoadBundled} onAddToPlaylist={addToPlaylist}
                  onShowOnScreen={showOnScreen} onDeleteSong={deleteSong}
                  onSearchFocus={() => {}} loading={false} importMsg={importMsg}
                  searchByContent={searchByContent} onSearchByContentChange={setSearchByContent}
                  playlistSongIds={playlistSongIds} onEditSong={setEditingSong} />
              </div>
            </TabsContent>

            <TabsContent value="message" className="flex-1 min-h-0 mt-0 overflow-auto">
              <div className="flex flex-col gap-2 p-2">
                <input className="w-full py-1.5 px-2.5 rounded-lg border border-input bg-muted text-foreground text-xs outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Tytuł (opcjonalnie)" value={customTextTitle} onChange={e => setCustomTextTitle(e.target.value)} />
                <textarea className="w-full min-h-[60px] py-1.5 px-2.5 rounded-lg border border-input bg-muted text-foreground text-xs outline-none focus:ring-1 focus:ring-ring resize-y"
                  placeholder="Wpisz komunikat..." value={customTextInput} onChange={e => setCustomTextInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleSendCustomText(); }} />
                <div className="flex gap-1.5">
                  <button onClick={handleAddCustomTextToPlaylist} disabled={!customTextInput.trim()}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border border-primary text-primary font-medium hover:bg-primary/10 transition-colors disabled:opacity-40 text-xs">
                    <Plus className="w-3 h-3" /> Do planu
                  </button>
                  <button onClick={handleSendCustomText} disabled={!customTextInput.trim()}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 text-xs">
                    <Send className="w-3 h-3" /> Na ekran
                  </button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="connect" className="flex-1 min-h-0 mt-0 overflow-auto space-y-2 p-2">
              <ConnectionPanel isLive={isLive} projectorSync={projectorSync} onOpenProjector={() => setScreenPickerOpen(true)} />
              <ProjectorSettingsPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* === Right side: Songbook (5/8 tall, 4/8 normal) === */}
      <div className={cn("flex flex-col gap-2 overflow-auto relative", songbookMode === 'tall' ? "col-span-5" : "col-span-4")}>
        {/* Mass countdown overlay */}
        {massCountdown.show && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-destructive/15 border-2 border-destructive rounded-2xl p-8 text-center max-w-sm mx-4 animate-pulse">
              <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-3" />
              <h2 className="text-2xl font-extrabold text-destructive mb-2">
                Msza za {massCountdown.minutesLeft} min!
              </h2>
              <p className="text-4xl font-mono font-black text-destructive">
                {massCountdown.time}
              </p>
              <button
                onClick={() => setMassCountdown({ show: false, time: '', minutesLeft: 0 })}
                className="mt-4 px-4 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-sm font-bold hover:bg-destructive/90 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        )}

        {/* Info cards — hidden in tall/wide modes */}
        {songbookMode !== 'tall' && (<>
        {/* Card 1: Date picker + Liturgical day + Organist selection */}
        <Card className="overflow-hidden border-l-4 border-l-primary shrink-0">
          <CardContent className="p-2.5 space-y-1.5">
            {/* Line 1: Date selector */}
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d); setLastHarmonogramId(null); }}
                className="p-1 rounded hover:bg-muted transition-colors"
                title="Poprzedni dzień"
              >
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              </button>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1.5 text-sm font-bold text-foreground hover:text-primary transition-colors">
                    <CalendarIcon className="w-4 h-4" />
                    {format(selectedDate, 'EEEE, d MMMM yyyy', { locale: pl })}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => { if (d) { setSelectedDate(d); setDatePickerOpen(false); setLastHarmonogramId(null); } }}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <button
                onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d); setLastHarmonogramId(null); }}
                className="p-1 rounded hover:bg-muted transition-colors"
                title="Następny dzień"
              >
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>

              {/* Save harmonogram */}
              <button
                onClick={handleManualSave}
                disabled={saving || state.playlist.length === 0}
                className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-30"
                title={`Zapisz: ${toYMD(selectedDate)}-(${format(selectedDate, 'EEEE', { locale: pl })})${calendarDescLine ? ' ' + calendarDescLine : ''}`}
              >
                <Save className={`w-4 h-4 ${saving ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
              </button>

              {/* Harmonograms shortcut */}
              <button
                onClick={() => onNavigate('harmonograms')}
                className="p-1 rounded hover:bg-muted transition-colors"
                title="Harmonogramy"
              >
                <ListMusic className="w-4 h-4 text-muted-foreground" />
              </button>

              {/* Organist badge (display only — identified by PIN) */}
              {selectedOrganist && (
                <span className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-bold">
                  <User className="w-3.5 h-3.5" />
                  {selectedOrganist}
                </span>
              )}
            </div>

            {/* Line 2: Liturgical period from kartka (blue, bold) + GLORIA/CREDO */}
            {calendarDescLine && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-primary">
                  {calendarDescLine}
                </span>
                {liturgicalTags.map(tag => (
                  <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] font-extrabold text-destructive bg-destructive/15 border border-destructive/30">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Line 3: Rosary mysteries */}
            {calendarRosaryLine && (
              <div className="text-xs text-muted-foreground">
                {calendarRosaryLine}
              </div>
            )}

            {/* Who plays today */}
            {sched.length > 0 && dates.includes(todayStr) && (
              <div className="flex items-center gap-2 flex-wrap border-t border-border pt-1.5">
                <span className="text-[10px] font-bold text-muted-foreground">☀️ Grają:</span>
                {[...organists].sort((a, b) => {
                  const ta = (todayGroup[a] || [])[0] || 'ZZ';
                  const tb = (todayGroup[b] || [])[0] || 'ZZ';
                  return ta.localeCompare(tb);
                }).map(name => {
                  const times = todayGroup[name] || [];
                  const c = getOrganistColor(name);
                  return (
                    <span key={name} className="inline-flex items-center gap-1">
                      <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold text-white"
                        style={{ background: c.dot }}>{name[0]}</span>
                      <span className="font-bold text-[10px]">{name}</span>
                      {times.map((t, i) => (
                        <span key={i} className="px-1 py-0.5 rounded text-[8px] font-bold font-mono"
                          style={{ background: c.chip, color: c.text }}>{t}</span>
                      ))}
                    </span>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Announcements — collapsed after popup confirmation */}
        {announcements.data?.selectedAnnouncement && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <div
                className={cn(
                  "border-2 rounded-lg p-2.5 cursor-pointer transition-all shrink-0",
                  announcementRead
                    ? "border-border bg-card"
                    : "border-purple-500 animate-pulse shadow-[0_0_12px_hsl(var(--accent)/0.4)]"
                )}
                onClick={() => { if (!announcementRead) markAnnouncementRead(); }}
              >
                <div className="flex items-center gap-2">
                  <Megaphone className={cn("w-4 h-4 shrink-0", announcementRead ? "text-muted-foreground" : "text-purple-500")} />
                  <span className={cn("font-bold text-sm", announcementRead ? "text-muted-foreground" : "text-purple-400")}>
                    Ogłoszenia — {announcements.data.selectedDayKey ? (
                      { today: 'Niedziela', mon: 'Poniedziałek', tue: 'Wtorek', wed: 'Środa', thu: 'Czwartek', fri: 'Piątek', sat: 'Sobota', nextsun: 'Przyszła niedziela' }[announcements.data.selectedDayKey] || announcements.data.selectedDayKey
                    ) : 'Dziś'}
                  </span>
                  {!announcementRead && (
                    <span className="text-[9px] bg-purple-500 text-white px-1.5 py-0.5 rounded-md font-bold ml-auto">NOWE</span>
                  )}
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border border-t-0 border-border rounded-b-lg p-3 bg-card">
                <div className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">
                  {announcements.data.selectedAnnouncement}
                </div>
                {announcements.data.sourceUrl && (
                  <a href={announcements.data.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline mt-1.5 inline-block">
                    Źródło →
                  </a>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
        </>)}

        {/* Songbook viewer */}
        {songbookViewer}
      </div>

      {/* Announcement popup dialog */}
      <Dialog open={announcementPopupOpen} onOpenChange={setAnnouncementPopupOpen}>
        <DialogContent className="max-w-lg border-2 border-purple-500 shadow-[0_0_24px_hsl(var(--accent)/0.5)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-400">
              <Megaphone className="w-5 h-5" />
              Ogłoszenia parafialne
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed max-h-[60vh] overflow-auto">
            {announcements.data?.selectedAnnouncement}
          </div>
          <DialogFooter>
            <Button onClick={markAnnouncementRead} className="gap-2">
              <Check className="w-4 h-4" /> Przeczytane
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resume dialog — shown on screen wake */}
      <Dialog open={resumeDialogOpen} onOpenChange={setResumeDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Kto gra?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {state.playlist.length > 0
              ? `Masz harmonogram (${state.playlist.length} pieśni, ${selectedOrganist || '?'}). Kontynuujesz czy zaczynasz nowy?`
              : 'Wybierz organistę:'}
          </p>
          <div className="flex gap-2 justify-center py-2 flex-wrap">
            {organists.map(name => {
              const c = getOrganistColor(name);
              return (
                <button
                  key={name}
                  onClick={() => handleResumeOrganistPick(name)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5",
                    resumeOrganist === name
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                    style={{ background: c.dot }}>{name[0]}</span>
                  {name}
                </button>
              );
            })}
          </div>
          {resumeOrganist && state.playlist.length > 0 && (
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleResumeNew}>Nowy harmonogram</Button>
              <Button onClick={handleResumeContinue}>Kontynuuj</Button>
            </DialogFooter>
          )}
          {resumeOrganist && state.playlist.length === 0 && (
            <DialogFooter>
              <Button onClick={() => { setSelectedOrganist(resumeOrganist); setResumeDialogOpen(false); }}>OK</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <ScreenPickerDialog
        open={screenPickerOpen}
        onOpenChange={setScreenPickerOpen}
        onSelect={(screen) => openProjectorWindow(screen)}
      />

      <SongEditDialog
        song={editingSong}
        open={!!editingSong}
        onOpenChange={(open) => { if (!open) setEditingSong(null); }}
        onSave={(song) => { updateSong(song); setEditingSong(null); }}
      />
      <Dialog open={readingsDialog.open} onOpenChange={open => { if (!open) setReadingsDialog(p => ({ ...p, open: false })); }}>
        <DialogContent className="max-w-3xl w-[95vw] h-[85vh] flex flex-row p-0 gap-0">
          {/* Pilot — left strip */}
          <div className="w-16 shrink-0 border-r border-border bg-muted/30 flex flex-col items-center justify-center gap-2 py-3">
            {activeSong && (
              <div className="text-[9px] text-muted-foreground text-center px-1 truncate w-full mb-1">
                {activeVerseIndex + 1}/{totalVerses}
              </div>
            )}
            <button onClick={goPrevSong} className="flex items-center justify-center rounded-lg border border-muted-foreground/30 bg-card p-2 hover:bg-muted/30 active:scale-95 transition-all" title="Poprzednia pieśń">
              <ChevronsLeft className="h-5 w-5 text-muted-foreground" />
            </button>
            <button onClick={prevSlide} className="flex items-center justify-center rounded-lg border border-destructive/40 bg-card p-2 hover:bg-destructive/10 active:scale-95 transition-all" title="Poprzedni slajd">
              <ChevronLeft className="h-5 w-5 text-destructive" />
            </button>
            <button onClick={handleToggleLive} className={cn(
              "flex items-center justify-center rounded-lg border p-2 active:scale-95 transition-all",
              isLive ? "border-primary/40 bg-primary/10 text-primary" : "border-muted/40 bg-muted/10 text-muted-foreground"
            )} title={isLive ? 'Wyłącz ekran' : 'Włącz ekran'}>
              {isLive ? <Monitor className="h-5 w-5" /> : <MonitorOff className="h-5 w-5" />}
            </button>
            <button onClick={nextSlide} className="flex items-center justify-center rounded-lg border border-success/40 bg-card p-2 hover:bg-success/10 active:scale-95 transition-all" title="Następny slajd">
              <ChevronRight className="h-5 w-5 text-success" />
            </button>
            <button onClick={goNextSong} className="flex items-center justify-center rounded-lg border border-muted-foreground/30 bg-card p-2 hover:bg-muted/30 active:scale-95 transition-all" title="Następna pieśń">
              <ChevronsRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 flex flex-col">
            <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
              <DialogTitle>Czytania</DialogTitle>
            </DialogHeader>
            {readingsDialog.loading ? (
              <div className="flex-1 flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
                <div
                  className="liturgy-content prose prose-sm max-w-none dark:prose-invert text-foreground leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(readingsDialog.html) }}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
