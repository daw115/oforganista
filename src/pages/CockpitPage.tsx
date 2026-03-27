/**
 * CockpitPage — customizable single-view dashboard.
 *
 * Renders all church app functionality as configurable widgets
 * in a drag & drop grid. Designed for laptop touchscreens.
 */

import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { PinLockScreen } from '@/components/auth/PinLockScreen';
import { useSchedule } from '@/hooks/useSchedule';
import { useProjector } from '@/hooks/useProjector';
// useProjectorLAN removed — internet-only sync
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
import { Monitor } from 'lucide-react';

// ─── Lazy-loaded widget content ───────────────────────────────────────────

const ProjectorControl = lazy(() => import('@/components/projector/ProjectorControl').then(m => ({ default: m.ProjectorControl })));
// ProjectorLANControl removed — no OpenLP
const LiturgyPanel = lazy(() => import('@/components/liturgy/LiturgyPanel').then(m => ({ default: m.LiturgyPanel })));
const AnnouncementsPanel = lazy(() => import('@/components/announcements/AnnouncementsPanel').then(m => ({ default: m.AnnouncementsPanel })));
const DevotionsManager = lazy(() => import('@/components/devotions/DevotionsManager').then(m => ({ default: m.DevotionsManager })));
const CantorPanel = lazy(() => import('@/components/cantor/CantorPanel').then(m => ({ default: m.CantorPanel })));
const TodayCard = lazy(() => import('@/components/schedule/TodayCard').then(m => ({ default: m.TodayCard })));
const StatsPanel = lazy(() => import('@/components/schedule/StatsPanel').then(m => ({ default: m.StatsPanel })));

// Mini widget loader
const WidgetLoader = () => (
  <div className="flex items-center justify-center h-full min-h-[80px]">
    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

// ─── Projector Pilot Widget (touch-optimized mini control) ─────────────────

function ProjectorPilotWidget({ projector }: {
  projector: ReturnType<typeof useProjector>;
}) {
  const song = projector.directSong || projector.currentSong;
  const verseIdx = projector.directSong ? projector.directVerseIndex : projector.state.currentVerseIndex;
  const slides = song ? getSongSlides(song) : [];
  const currentSlide = slides[verseIdx];
  const isLive = projector.state.isLive;

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      {/* Title + status */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold truncate flex-1">
          {song?.title || 'Brak pieśni'}
        </h3>
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${isLive ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-muted text-muted-foreground'}`}>
          {isLive ? 'LIVE' : 'OFF'}
        </span>
      </div>

      {/* Current text preview — larger, more readable */}
      <div className="flex-1 bg-black/50 rounded-xl p-4 flex items-center justify-center text-center min-h-[80px] border border-white/5">
        <p className="text-base text-white/90 leading-relaxed line-clamp-5 whitespace-pre-line">
          {currentSlide?.slide.text || '—'}
        </p>
      </div>

      {/* Slide indicator — larger dots for touch */}
      {slides.length > 0 && (
        <div className="flex justify-center gap-1.5 flex-wrap">
          {slides.map((s, i) => (
            <button
              key={i}
              onClick={() => {
                if (projector.directSong) projector.goToDirectVerse(i);
                else projector.goToItem(projector.state.currentItemIndex, i);
              }}
              className={`min-w-[28px] h-7 rounded-full text-[10px] font-bold transition-all touch-manipulation active:scale-90 ${
                i === verseIdx
                  ? 'bg-primary text-primary-foreground px-2'
                  : 'bg-muted-foreground/20 hover:bg-muted-foreground/40 text-muted-foreground px-1.5'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Controls — large touch targets (min 48px height) */}
      <div className="flex items-center gap-2">
        <button
          onClick={projector.prevSlide}
          className="flex-1 py-3 rounded-xl bg-muted/50 hover:bg-muted text-sm font-semibold transition-colors active:scale-[0.97] touch-manipulation select-none"
        >
          ◀ Wstecz
        </button>
        <button
          onClick={projector.toggleLive}
          className={`px-6 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.95] touch-manipulation select-none ${
            isLive
              ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25'
          }`}
        >
          {isLive ? 'STOP' : 'LIVE'}
        </button>
        <button
          onClick={projector.nextSlide}
          className="flex-1 py-3 rounded-xl bg-muted/50 hover:bg-muted text-sm font-semibold transition-colors active:scale-[0.97] touch-manipulation select-none"
        >
          Dalej ▶
        </button>
      </div>
    </div>
  );
}

// ─── Playlist Widget ──────────────────────────────────────────────────────

function PlaylistWidget({ projector }: { projector: ReturnType<typeof useProjector> }) {
  const { playlist, currentItemIndex } = projector.state;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-sm font-bold text-muted-foreground">
          Playlist ({playlist.length})
        </span>
        {playlist.length > 0 && (
          <button
            onClick={projector.clearPlaylist}
            className="text-xs text-destructive/70 hover:text-destructive font-medium px-2 py-1 rounded-lg hover:bg-destructive/10 transition-colors touch-manipulation"
          >
            Wyczyść
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {playlist.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-4 text-center">
            Dodaj pieśni z liturgii lub wyszukiwarki
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {playlist.map((item, i) => {
              const song = projector.songs.find(s => s.id === item.songId);
              const slides = song ? getSongSlides(song) : [];
              const isActive = i === currentItemIndex;

              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-2 transition-colors ${isActive ? 'bg-primary/10 border-l-3 border-primary' : 'hover:bg-muted/20'}`}
                >
                  <button
                    onClick={() => projector.goToItem(i)}
                    className="flex-1 text-left px-3 py-3 flex items-center gap-3 touch-manipulation min-h-[48px]"
                  >
                    <span className={`text-sm font-mono w-6 text-center shrink-0 ${isActive ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${isActive ? 'font-semibold text-primary' : ''}`}>
                        {item.title}
                      </p>
                      {isActive && slides.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Slajd {projector.state.currentVerseIndex + 1}/{slides.length}
                        </p>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => projector.removeFromPlaylist(item.id)}
                    className="p-2.5 mr-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors touch-manipulation shrink-0"
                    title="Usuń"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Song Search Widget ───────────────────────────────────────────────────

function SongSearchWidget({ projector }: { projector: ReturnType<typeof useProjector> }) {
  const playlistIds = new Set(projector.state.playlist.map(p => p.songId));

  return (
    <div className="flex flex-col h-full p-3 gap-2">
      <input
        type="text"
        value={projector.searchQuery}
        onChange={(e) => projector.setSearchQuery(e.target.value)}
        placeholder="Szukaj pieśni... (tytuł lub numer)"
        className="w-full px-4 py-3 rounded-xl bg-muted/30 border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 touch-manipulation"
      />
      <div className="flex-1 overflow-auto -mx-1">
        {projector.filteredSongs.slice(0, 40).map(song => {
          const inPlaylist = playlistIds.has(song.id);
          return (
            <button
              key={song.id}
              onClick={() => { if (!inPlaylist) projector.addToPlaylist(song); }}
              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors touch-manipulation min-h-[44px] ${
                inPlaylist
                  ? 'bg-primary/5 text-primary/60 cursor-default'
                  : 'hover:bg-muted/30 active:bg-muted/50'
              }`}
            >
              <span className="text-muted-foreground text-xs font-mono w-8 text-right shrink-0">
                {song.siedleckiNumber || song.songNumber || '·'}
              </span>
              <span className="truncate text-sm">{song.title}</span>
              {inPlaylist && <span className="text-xs text-primary/50 shrink-0 ml-auto">dodana</span>}
            </button>
          );
        })}
        {projector.searchQuery && projector.filteredSongs.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Nie znaleziono</p>
        )}
        {!projector.searchQuery && (
          <p className="text-sm text-muted-foreground text-center py-6">Wpisz tytuł lub numer pieśni</p>
        )}
      </div>
    </div>
  );
}

// ─── Quick Actions Widget ─────────────────────────────────────────────────

function QuickActionsWidget({ projector, onOpenProjector }: {
  projector: ReturnType<typeof useProjector>;
  onOpenProjector: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 p-3 flex-wrap">
      <button
        onClick={onOpenProjector}
        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-sm font-semibold transition-colors touch-manipulation active:scale-[0.97] select-none"
      >
        <Monitor className="w-4 h-4" />
        Otwórz projektor
      </button>
      <button
        onClick={projector.toggleLive}
        className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all touch-manipulation active:scale-[0.97] select-none ${
          projector.state.isLive
            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
            : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
        }`}
      >
        {projector.state.isLive ? '⏹ Stop' : '▶ Live'}
      </button>
      <button
        onClick={() => {
          if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
          else document.exitFullscreen().catch(() => {});
        }}
        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-muted/50 hover:bg-muted text-sm font-semibold transition-colors touch-manipulation active:scale-[0.97] select-none"
      >
        ⛶ Fullscreen
      </button>
      <a
        href="/"
        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-muted/50 hover:bg-muted text-sm font-semibold transition-colors touch-manipulation active:scale-[0.97] select-none"
      >
        ← Pełny widok
      </a>
    </div>
  );
}

// ─── Main CockpitPage ─────────────────────────────────────────────────────

const CockpitPage = () => {
  // ─── Auth ───
  const [unlockedUser, setUnlockedUser] = useState<string | null>(() => {
    try { return sessionStorage.getItem('appUnlockedUser'); } catch { return null; }
  });
  const handleUnlock = useCallback((name: string) => {
    setUnlockedUser(name);
    try { sessionStorage.setItem('appUnlockedUser', name); } catch {}
  }, []);

  // ─── Hooks ───
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

  // ─── Layout ───
  const [layout, setLayout] = useState<CockpitLayout>(loadLayout);
  useEffect(() => {
    syncLayoutFromServer().then(server => { if (server) setLayout(server); });
  }, []);

  // ─── Liturgy add targets ───
  const liturgyAddTargets = useMemo<LiturgyAddTarget[]>(() => {
    const targets: LiturgyAddTarget[] = [];
    if (moduleSettings.projectorEnabled) {
      targets.push({
        key: 'projector',
        label: 'Rzutnik',
        icon: <Monitor className="w-3 h-3 text-primary" />,
        onAdd: (song, meta) => projector.addToPlaylist(song, meta),
      });
    }
    return targets;
  }, [moduleSettings.projectorEnabled, projector.addToPlaylist]);

  const projectorPlaylistSongIds = useMemo(() => new Set(projector.state.playlist.map(p => p.songId)), [projector.state.playlist]);

  // ─── Open projector window ───
  const handleOpenProjector = useCallback(() => {
    projector.openProjectorWindow();
  }, [projector.openProjectorWindow]);

  // ─── Widget renderer ───
  const renderWidget = useCallback((widgetId: string) => {
    return (
      <Suspense fallback={<WidgetLoader />}>
        {widgetId === 'projector-pilot' && (
          <ProjectorPilotWidget projector={projector} />
        )}
        {widgetId === 'projector-playlist' && (
          <PlaylistWidget projector={projector} />
        )}
        {widgetId === 'projector-search' && (
          <SongSearchWidget projector={projector} />
        )}
        {widgetId === 'liturgy-today' && (
          <LiturgyPanel addTargets={liturgyAddTargets} playlistSongIds={projectorPlaylistSongIds} />
        )}
        {widgetId === 'liturgy-proposals' && (
          <LiturgyPanel addTargets={liturgyAddTargets} playlistSongIds={projectorPlaylistSongIds} />
        )}
        {widgetId === 'announcements' && (
          <AnnouncementsPanel />
        )}
        {widgetId === 'devotions' && (
          <DevotionsManager />
        )}
        {widgetId === 'today-card' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
            <TodayCard
              title="Dziś gra"
              emoji="☀️"
              dateStr={schedule.todayStr}
              dates={schedule.dates}
              organists={schedule.organists}
              group={schedule.todayGroup}
              accentClass="border-l-primary"
            />
            <TodayCard
              title="Jutro gra"
              emoji="🌅"
              dateStr={schedule.tomorrowStr}
              dates={schedule.dates}
              organists={schedule.organists}
              group={schedule.tomorrowGroup}
              accentClass="border-l-amber"
            />
          </div>
        )}
        {widgetId === 'schedule-stats' && (
          <StatsPanel organists={schedule.organists} stats={schedule.stats} />
        )}
        {widgetId === 'cantor' && (
          <CantorPanel cantors={cantors} />
        )}
        {widgetId === 'songbook' && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            <a href="/" className="text-primary hover:underline">Otwórz śpiewnik w pełnym widoku</a>
          </div>
        )}
        {widgetId === 'quick-actions' && (
          <QuickActionsWidget projector={projector} onOpenProjector={handleOpenProjector} />
        )}
      </Suspense>
    );
  }, [projector, liturgyAddTargets, projectorPlaylistSongIds, schedule, cantors, handleOpenProjector]);

  // ─── Render ───
  if (!unlockedUser) {
    return <PinLockScreen onUnlock={handleUnlock} />;
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <CockpitGrid
        layout={layout}
        onLayoutChange={setLayout}
        renderWidget={renderWidget}
      />
    </div>
  );
};

export default CockpitPage;
