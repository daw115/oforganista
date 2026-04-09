/**
 * CockpitPage v3 — Responsive glass-morphism dashboard.
 *
 * Beautiful, touch-friendly dashboard that adapts to
 * laptop, tablet, and smartphone screens.
 */

import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { PinLockScreen } from '@/components/auth/PinLockScreen';
import { useSchedule } from '@/hooks/useSchedule';
import { useProjector } from '@/hooks/useProjector';
import { useCantors } from '@/hooks/useCantors';
import { useAnnouncements } from '@/hooks/useAnnouncements';
import { useDevotions } from '@/hooks/useDevotions';
import { useLiturgyPrefetch } from '@/hooks/useLiturgyPrefetch';
import { getModuleSettings, syncModuleSettingsFromServer, type ModuleSettings } from '@/components/settings/SettingsPanel';
import { getSongSlides } from '@/lib/projectorLayout';
import type { LiturgyAddTarget } from '@/components/liturgy/LiturgyPanel';
import { CockpitGrid } from '@/components/cockpit/CockpitGrid';
import {
  type CockpitLayout,
  loadLayout,
  syncLayoutFromServer,
} from '@/lib/cockpitLayout';
import { Monitor, Play, Square, ChevronLeft, ChevronRight, Maximize, ExternalLink } from 'lucide-react';

const ProjectorControl = lazy(() => import('@/components/projector/ProjectorControl').then(m => ({ default: m.ProjectorControl })));
const LiturgyPanel = lazy(() => import('@/components/liturgy/LiturgyPanel').then(m => ({ default: m.LiturgyPanel })));
const AnnouncementsPanel = lazy(() => import('@/components/announcements/AnnouncementsPanel').then(m => ({ default: m.AnnouncementsPanel })));
const DevotionsManager = lazy(() => import('@/components/devotions/DevotionsManager').then(m => ({ default: m.DevotionsManager })));
const CantorPanel = lazy(() => import('@/components/cantor/CantorPanel').then(m => ({ default: m.CantorPanel })));
const TodayCard = lazy(() => import('@/components/schedule/TodayCard').then(m => ({ default: m.TodayCard })));
const StatsPanel = lazy(() => import('@/components/schedule/StatsPanel').then(m => ({ default: m.StatsPanel })));

const WidgetLoader = () => (
  <div className="flex items-center justify-center h-full min-h-[80px]">
    <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
  </div>
);

function ProjectorPilotWidget({ projector }: { projector: ReturnType<typeof useProjector> }) {
  const song = projector.directSong || projector.currentSong;
  const verseIdx = projector.directSong ? projector.directVerseIndex : projector.state.currentVerseIndex;
  const slides = song ? getSongSlides(song) : [];
  const currentSlide = slides[verseIdx];
  const isLive = projector.state.isLive;

  return (
    <div className="flex flex-col h-full p-3 sm:p-4 gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm sm:text-base font-bold truncate flex-1">
          {song?.title || 'Brak pieśni'}
        </h3>
        <span className={`cockpit-status-badge ${isLive ? 'bg-red-500/15 text-red-400 border-red-500/30 shadow-sm shadow-red-500/10' : 'bg-muted/30 text-muted-foreground border-border/50'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-red-400 animate-pulse' : 'bg-muted-foreground/50'}`} />
          {isLive ? 'LIVE' : 'OFF'}
        </span>
      </div>

      <div className="flex-1 cockpit-preview-box">
        <p className="text-sm sm:text-base text-white/90 leading-relaxed line-clamp-5 whitespace-pre-line">
          {currentSlide?.slide.text || '—'}
        </p>
      </div>

      {slides.length > 0 && (
        <div className="flex justify-center gap-1.5 flex-wrap">
          {slides.map((s, i) => (
            <button
              key={i}
              onClick={() => {
                if (projector.directSong) projector.goToDirectVerse(i);
                else projector.goToItem(projector.state.currentItemIndex, i);
              }}
              className={`cockpit-slide-dot ${i === verseIdx ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30 px-2.5' : 'bg-white/[0.06] hover:bg-white/[0.12] text-muted-foreground px-1.5'}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button onClick={projector.prevSlide} className="cockpit-btn-control flex-1">
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Wstecz</span>
        </button>
        <button
          onClick={projector.toggleLive}
          className={`cockpit-btn-live ${isLive ? 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30 shadow-lg shadow-red-500/10' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30 shadow-lg shadow-emerald-500/10'}`}
        >
          {isLive ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isLive ? 'STOP' : 'LIVE'}
        </button>
        <button onClick={projector.nextSlide} className="cockpit-btn-control flex-1">
          <span className="hidden sm:inline">Dalej</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function PlaylistWidget({ projector }: { projector: ReturnType<typeof useProjector> }) {
  const { playlist, currentItemIndex } = projector.state;
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Playlist ({playlist.length})</span>
        {playlist.length > 0 && (
          <button onClick={projector.clearPlaylist} className="text-[11px] text-destructive/60 hover:text-destructive font-semibold px-2.5 py-1 rounded-lg hover:bg-destructive/10 transition-all touch-manipulation">Wyczyść</button>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {playlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 text-sm p-6 text-center gap-2">
            <span className="text-2xl">🎵</span>
            <span>Dodaj pieśni z liturgii<br/>lub wyszukiwarki</span>
          </div>
        ) : (
          <div className="py-1">
            {playlist.map((item, i) => {
              const song = projector.songs.find(s => s.id === item.songId);
              const slides = song ? getSongSlides(song) : [];
              const isActive = i === currentItemIndex;
              return (
                <div key={item.id} className={`flex items-center gap-2 mx-1.5 my-0.5 rounded-xl transition-all duration-150 ${isActive ? 'bg-primary/10 border border-primary/20' : 'border border-transparent hover:bg-white/[0.02]'}`}>
                  <button onClick={() => projector.goToItem(i)} className="flex-1 text-left px-3 py-2.5 flex items-center gap-3 touch-manipulation min-h-[44px]">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${isActive ? 'bg-primary/20 text-primary' : 'bg-white/[0.04] text-muted-foreground/60'}`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${isActive ? 'font-semibold text-primary' : ''}`}>{item.title}</p>
                      {isActive && slides.length > 0 && (<p className="text-[11px] text-muted-foreground mt-0.5">Slajd {projector.state.currentVerseIndex + 1}/{slides.length}</p>)}
                    </div>
                  </button>
                  <button onClick={() => projector.removeFromPlaylist(item.id)} className="p-2 mr-2 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all touch-manipulation shrink-0" title="Usuń">×</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SongSearchWidget({ projector }: { projector: ReturnType<typeof useProjector> }) {
  const playlistIds = new Set(projector.state.playlist.map(p => p.songId));
  return (
    <div className="flex flex-col h-full p-3 sm:p-4 gap-2.5">
      <div className="relative">
        <input type="text" value={projector.searchQuery} onChange={(e) => projector.setSearchQuery(e.target.value)} placeholder="Szukaj pieśni... (tytuł lub numer)" className="cockpit-search-input" />
      </div>
      <div className="flex-1 overflow-auto -mx-1">
        {projector.filteredSongs.slice(0, 40).map(song => {
          const inPlaylist = playlistIds.has(song.id);
          return (
            <button key={song.id} onClick={() => { if (!inPlaylist) projector.addToPlaylist(song); }}
              className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-150 touch-manipulation min-h-[42px] ${inPlaylist ? 'bg-primary/5 text-primary/50 cursor-default' : 'hover:bg-white/[0.03] active:bg-white/[0.06]'}`}>
              <span className="text-muted-foreground/40 text-[11px] font-mono w-8 text-right shrink-0">{song.siedleckiNumber || song.songNumber || '·'}</span>
              <span className="truncate text-sm">{song.title}</span>
              {inPlaylist && <span className="text-[10px] text-primary/40 shrink-0 ml-auto font-semibold uppercase tracking-wide">dodana</span>}
            </button>
          );
        })}
        {projector.searchQuery && projector.filteredSongs.length === 0 && <p className="text-sm text-muted-foreground/50 text-center py-8">Nie znaleziono</p>}
        {!projector.searchQuery && <p className="text-sm text-muted-foreground/40 text-center py-8">Wpisz tytuł lub numer pieśni</p>}
      </div>
    </div>
  );
}

function QuickActionsWidget({ projector, onOpenProjector }: { projector: ReturnType<typeof useProjector>; onOpenProjector: () => void; }) {
  return (
    <div className="flex items-center gap-2 p-3 sm:p-4 flex-wrap">
      <button onClick={onOpenProjector} className="cockpit-action-btn group">
        <div className="cockpit-action-icon bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20"><Monitor className="w-4 h-4" /></div>
        <span className="text-xs sm:text-sm font-semibold">Projektor</span>
      </button>
      <button onClick={projector.toggleLive} className="cockpit-action-btn group">
        <div className={`cockpit-action-icon ${projector.state.isLive ? 'bg-red-500/10 text-red-400 group-hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20'}`}>
          {projector.state.isLive ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </div>
        <span className="text-xs sm:text-sm font-semibold">{projector.state.isLive ? 'Stop' : 'Live'}</span>
      </button>
      <button onClick={() => { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else document.exitFullscreen().catch(() => {}); }} className="cockpit-action-btn group">
        <div className="cockpit-action-icon bg-violet-500/10 text-violet-400 group-hover:bg-violet-500/20"><Maximize className="w-4 h-4" /></div>
        <span className="text-xs sm:text-sm font-semibold">Fullscreen</span>
      </button>
      <a href="/" className="cockpit-action-btn group">
        <div className="cockpit-action-icon bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20"><ExternalLink className="w-4 h-4" /></div>
        <span className="text-xs sm:text-sm font-semibold">Pełny widok</span>
      </a>
    </div>
  );
}

const CockpitPage = () => {
  const [unlockedUser, setUnlockedUser] = useState<string | null>(() => {
    try { return sessionStorage.getItem('appUnlockedUser'); } catch { return null; }
  });
  const handleUnlock = useCallback((name: string) => {
    setUnlockedUser(name);
    try { sessionStorage.setItem('appUnlockedUser', name); } catch {}
  }, []);

  const schedule = useSchedule();
  const projector = useProjector();
  const announcements = useAnnouncements();
  const cantors = useCantors();
  const devotionsHook = useDevotions();
  useLiturgyPrefetch(7);

  const [moduleSettings, setModuleSettings] = useState<ModuleSettings>(getModuleSettings);
  useEffect(() => {
    syncModuleSettingsFromServer().then(s => { if (s) setModuleSettings(s); });
    import('@/lib/projectorSettings').then(mod => mod.syncProjectorSettingsFromServer());
  }, []);

  const [layout, setLayout] = useState<CockpitLayout>(loadLayout);
  useEffect(() => {
    syncLayoutFromServer().then(server => { if (server) setLayout(server); });
  }, []);

  const liturgyAddTargets = useMemo<LiturgyAddTarget[]>(() => {
    const targets: LiturgyAddTarget[] = [];
    if (moduleSettings.projectorEnabled) {
      targets.push({ key: 'projector', label: 'Rzutnik', icon: <Monitor className="w-3 h-3 text-primary" />, onAdd: (song, meta) => projector.addToPlaylist(song, meta) });
    }
    return targets;
  }, [moduleSettings.projectorEnabled, projector.addToPlaylist]);

  const projectorPlaylistSongIds = useMemo(() => new Set(projector.state.playlist.map(p => p.songId)), [projector.state.playlist]);
  const handleOpenProjector = useCallback(() => { projector.openProjectorWindow(); }, [projector.openProjectorWindow]);

  const renderWidget = useCallback((widgetId: string) => {
    return (
      <Suspense fallback={<WidgetLoader />}>
        {widgetId === 'projector-pilot' && <ProjectorPilotWidget projector={projector} />}
        {widgetId === 'projector-playlist' && <PlaylistWidget projector={projector} />}
        {widgetId === 'projector-search' && <SongSearchWidget projector={projector} />}
        {widgetId === 'liturgy-today' && <LiturgyPanel addTargets={liturgyAddTargets} playlistSongIds={projectorPlaylistSongIds} />}
        {widgetId === 'liturgy-proposals' && <LiturgyPanel addTargets={liturgyAddTargets} playlistSongIds={projectorPlaylistSongIds} />}
        {widgetId === 'announcements' && <AnnouncementsPanel />}
        {widgetId === 'devotions' && <DevotionsManager />}
        {widgetId === 'today-card' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 sm:p-4">
            <TodayCard title="Dziś gra" emoji="☀️" dateStr={schedule.todayStr} dates={schedule.dates} organists={schedule.organists} group={schedule.todayGroup} accentClass="border-l-primary" />
            <TodayCard title="Jutro gra" emoji="🌅" dateStr={schedule.tomorrowStr} dates={schedule.dates} organists={schedule.organists} group={schedule.tomorrowGroup} accentClass="border-l-amber" />
          </div>
        )}
        {widgetId === 'schedule-stats' && <StatsPanel organists={schedule.organists} stats={schedule.stats} />}
        {widgetId === 'cantor' && <CantorPanel cantors={cantors} />}
        {widgetId === 'songbook' && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-6">
            <a href="/" className="cockpit-action-btn group inline-flex">
              <div className="cockpit-action-icon bg-primary/10 text-primary group-hover:bg-primary/20"><ExternalLink className="w-4 h-4" /></div>
              <span className="text-sm font-semibold">Otwórz śpiewnik</span>
            </a>
          </div>
        )}
        {widgetId === 'quick-actions' && <QuickActionsWidget projector={projector} onOpenProjector={handleOpenProjector} />}
      </Suspense>
    );
  }, [projector, liturgyAddTargets, projectorPlaylistSongIds, schedule, cantors, handleOpenProjector]);

  if (!unlockedUser) {
    return <PinLockScreen onUnlock={handleUnlock} />;
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden cockpit-page">
      <CockpitGrid layout={layout} onLayoutChange={setLayout} renderWidget={renderWidget} />
    </div>
  );
};

export default CockpitPage;
