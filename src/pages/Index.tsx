import { useState, useEffect, useMemo, lazy, Suspense, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PinLockScreen } from '@/components/auth/PinLockScreen';
import { getProjectorSettings } from '@/lib/projectorSettings';
import { useSchedule } from '@/hooks/useSchedule';
import { useProjector } from '@/hooks/useProjector';
// useProjectorLAN removed — internet-only sync via Supabase Realtime
import { useCantors } from '@/hooks/useCantors';
import { AppSidebar, Section } from '@/components/layout/AppSidebar';
import { SimpleNavBar } from '@/components/layout/SimpleNavBar';
import { useAnnouncements } from '@/hooks/useAnnouncements';
import { SettingsPanel, getModuleSettings, syncModuleSettingsFromServer, type ModuleSettings, type ViewMode } from '@/components/settings/SettingsPanel';
import { useDevotions, estimateLiturgicalPeriod } from '@/hooks/useDevotions';
import type { PilotProps } from '@/components/projector/PilotStrip';
import type { LiturgyAddTarget } from '@/components/liturgy/LiturgyPanel';
import { getSongSlides } from '@/lib/projectorLayout';
import { useLiturgyPrefetch } from '@/hooks/useLiturgyPrefetch';

import { ChevronDown, ChevronUp, Calendar, Download, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Lazy-loaded panels — only loaded when user navigates to them ───
const DashboardPanel = lazy(() => import('@/components/dashboard/DashboardPanel').then(m => ({ default: m.DashboardPanel })));
const AllPanel = lazy(() => import('@/components/all/AllPanel').then(m => ({ default: m.AllPanel })));
const LiturgyPanel = lazy(() => import('@/components/liturgy/LiturgyPanel').then(m => ({ default: m.LiturgyPanel })));
const ProjectorControl = lazy(() => import('@/components/projector/ProjectorControl').then(m => ({ default: m.ProjectorControl })));
// ProjectorLANControl and ProjectorLANRemote removed — no OpenLP
const SongLibraryManager = lazy(() => import('@/components/projector/SongLibraryManager').then(m => ({ default: m.SongLibraryManager })));
const SongDatabaseEditor = lazy(() => import('@/components/projector/SongDatabaseEditor').then(m => ({ default: m.SongDatabaseEditor })));
const AnnouncementsPanel = lazy(() => import('@/components/announcements/AnnouncementsPanel').then(m => ({ default: m.AnnouncementsPanel })));
const CantorPanel = lazy(() => import('@/components/cantor/CantorPanel').then(m => ({ default: m.CantorPanel })));
const MelodyLibraryManager = lazy(() => import('@/components/cantor/MelodyLibraryManager').then(m => ({ default: m.MelodyLibraryManager })));
const DevotionsManager = lazy(() => import('@/components/devotions/DevotionsManager').then(m => ({ default: m.DevotionsManager })));
const SongbookPanel = lazy(() => import('@/components/songbook/SongbookPanel').then(m => ({ default: m.SongbookPanel })));
const HarmonogramsPanel = lazy(() => import('@/components/harmonograms/HarmonogramsPanel').then(m => ({ default: m.HarmonogramsPanel })));
const TodayCard = lazy(() => import('@/components/schedule/TodayCard').then(m => ({ default: m.TodayCard })));
const StatsPanel = lazy(() => import('@/components/schedule/StatsPanel').then(m => ({ default: m.StatsPanel })));
const ScheduleTable = lazy(() => import('@/components/schedule/ScheduleTable').then(m => ({ default: m.ScheduleTable })));
const SettlementPanel = lazy(() => import('@/components/schedule/SettlementPanel').then(m => ({ default: m.SettlementPanel })));

// Section loading fallback — skeleton with subtle pulse
const SectionLoader = () => (
  <div className="space-y-4 animate-pulse">
    <div className="h-8 bg-muted/30 rounded-lg w-1/3" />
    <div className="h-32 bg-muted/20 rounded-xl" />
    <div className="h-32 bg-muted/20 rounded-xl" />
  </div>
);


const Index = () => {
  const navigate = useNavigate();
  const {
    sched, loading, msg, organists, dates, stats, rawCsv,
    todayStr, tomorrowStr, todayGroup, tomorrowGroup,
    fetchSheet, importData, clearSchedule, groupByDate, csvHolidays,
  } = useSchedule();

  const projector = useProjector();
  const announcements = useAnnouncements();
  const cantors = useCantors();
  const devotionsHook = useDevotions();
  useLiturgyPrefetch(7);

  const [moduleSettings, setModuleSettings] = useState<ModuleSettings>(getModuleSettings);

  // Sync module settings and projector settings from server on mount
  useEffect(() => {
    syncModuleSettingsFromServer().then(serverSettings => {
      if (serverSettings) setModuleSettings(serverSettings);
    });
    // Also sync projector visual settings
    import('@/lib/projectorSettings').then(mod => mod.syncProjectorSettingsFromServer());
  }, []);
  const viewMode: ViewMode = moduleSettings.viewMode ?? 'complex';
  const defaultSection: Section = viewMode === 'all' ? 'all' : 'dashboard';
  const [section, setSectionRaw] = useState<Section>(defaultSection);
  const setSection = useCallback((s: Section) => {
    if (s === 'cockpit') { navigate('/cockpit'); return; }
    setSectionRaw(s);
  }, [navigate]);
  const [showFull, setShowFull] = useState(false);
  const [unlockedUser, setUnlockedUser] = useState<string | null>(() => {
    try { return sessionStorage.getItem('appUnlockedUser'); } catch { return null; }
  });

  const handleUnlock = useCallback((name: string) => {
    setUnlockedUser(name);
    try { sessionStorage.setItem('appUnlockedUser', name); } catch {}
  }, []);


  // Build dynamic add targets for Liturgy panel
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

  // If current section is disabled, redirect
  const effectiveSection = (
    (section === 'all' && viewMode !== 'all') ||
    (section === 'projector' && !moduleSettings.projectorEnabled)
  ) ? 'dashboard' : section;

  const remoteElement = null;

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  if (!unlockedUser) {
    return <PinLockScreen onUnlock={handleUnlock} />;
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {effectiveSection !== 'songbook' && viewMode === 'simple' && (
        <SimpleNavBar active={effectiveSection} onNavigate={setSection} defaultCollapsed={effectiveSection === 'dashboard'} />
      )}
      {effectiveSection !== 'songbook' && viewMode !== 'simple' && (
        <AppSidebar
          active={effectiveSection}
          onNavigate={setSection}
          onRefresh={fetchSheet}
          onPaste={() => setSection('settings')}
          onHelp={() => setSection('settings')}
          onClear={clearSchedule}
          loading={loading}
          hasData={sched.length > 0}
          moduleSettings={moduleSettings}
          remoteSlot={remoteElement}
          onToggleFullscreen={toggleFullscreen}
          cantorBadge={cantors.pendingCount}
        />
      )}

      <main className="flex-1 overflow-auto">
        <div className="h-full p-3 md:p-4 lg:p-5 pb-20 md:pb-4 max-w-screen-2xl mx-auto">

          {/* Status message */}
          {msg && (
            <div className="bg-emerald/10 border border-emerald/30 text-emerald px-5 py-3 rounded-lg mb-4 font-semibold text-sm">
              {msg}
            </div>
          )}

          {/* Dashboard */}
          <Suspense fallback={<SectionLoader />}>
          {effectiveSection === 'dashboard' && (
            <DashboardPanel
              sched={sched}
              todayStr={todayStr}
              tomorrowStr={tomorrowStr}
              dates={dates}
              organists={organists}
              todayGroup={todayGroup}
              tomorrowGroup={tomorrowGroup}
              announcements={announcements}
              devotions={devotionsHook.devotions}
              devotionsLoading={devotionsHook.loading}
              projector={projector}
              onNavigate={setSection}
              currentUser={unlockedUser || undefined}
            />
          )}

          {/* ALL panel */}
          {effectiveSection === 'all' && (
            <AllPanel
              sched={sched}
              todayStr={todayStr}
              tomorrowStr={tomorrowStr}
              dates={dates}
              organists={organists}
              todayGroup={todayGroup}
              tomorrowGroup={tomorrowGroup}
              projector={projector}
              onNavigate={setSection}
              announcements={announcements}
              devotions={devotionsHook.devotions}
              devotionsLoading={devotionsHook.loading}
              cantorSelections={cantors.selections}
              cantorPendingCount={cantors.pendingCount}
              onCantorLoad={cantors.loadSelections}
              onCantorMarkSeen={cantors.markSeen}
              onCantorMarkAllSeen={cantors.markAllSeen}
            />
          )}

          {effectiveSection === 'schedule' && (
            <div className="space-y-4">
              {sched.length === 0 && !loading && (
                <div className="glass-card border-2 border-dashed border-border p-16 text-center">
                  <div className="text-6xl mb-4">📅</div>
                  <h3 className="text-xl font-bold mb-2">Brak wgranego grafiku</h3>
                  <p className="text-muted-foreground mb-6">
                    Kliknij Odśwież aby pobrać z Google Sheets lub przejdź do Ustawień aby wkleić ręcznie
                  </p>
                  <div className="flex gap-3 justify-center flex-wrap">
                    <Button onClick={fetchSheet} className="bg-emerald text-white hover:bg-emerald/90">
                      <Download className="w-4 h-4" />
                      Pobierz z Google Sheets
                    </Button>
                    <Button onClick={() => setSection('settings')} className="bg-primary text-primary-foreground">
                      Wklej ręcznie
                    </Button>
                  </div>
                </div>
              )}

              {sched.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <TodayCard
                    title="Dziś gra"
                    emoji="☀️"
                    dateStr={todayStr}
                    dates={dates}
                    organists={organists}
                    group={todayGroup}
                    accentClass="border-l-primary"
                  />
                  <TodayCard
                    title="Jutro gra"
                    emoji="🌅"
                    dateStr={tomorrowStr}
                    dates={dates}
                    organists={organists}
                    group={tomorrowGroup}
                    accentClass="border-l-amber"
                  />
                </div>
              )}


              {sched.length > 0 && !dates.includes(todayStr) && (
                <div className="bg-amber/10 border border-amber/30 text-amber rounded-lg px-5 py-3 text-sm font-medium">
                  Dzisiejsza data jest poza zakresem grafiku ({dates[0]} — {dates[dates.length - 1]}). Wgraj aktualny grafik.
                </div>
              )}

              {sched.length > 0 && (
                <div className="glass-card overflow-hidden">
                  <button
                    onClick={() => setShowFull(!showFull)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
                  >
                    <span className="font-extrabold flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-primary" />
                      Pełny grafik ({dates.length} dni, {sched.length} mszy)
                    </span>
                    {showFull ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                  </button>

                  <StatsPanel organists={organists} stats={stats} />

                  {showFull && (
                    <ScheduleTable
                      organists={organists}
                      dates={dates}
                      sched={sched}
                      groupByDate={groupByDate}
                    />
                  )}
                </div>
              )}

              {sched.length > 0 && (
                <SettlementPanel sched={sched} organists={organists} rawCsv={rawCsv} csvHolidays={csvHolidays} />
              )}
            </div>
          )}

          {/* Liturgy section */}
          {effectiveSection === 'liturgy' && <LiturgyPanel addTargets={liturgyAddTargets} playlistSongIds={projectorPlaylistSongIds} />}

          {/* Announcements section */}
          {effectiveSection === 'announcements' && <AnnouncementsPanel />}

          {/* Devotions section */}
          {effectiveSection === 'devotions' && <DevotionsManager />}

          {/* Projector section */}
          {effectiveSection === 'projector' && <ProjectorControl projector={projector} />}

          {/* Song Library Manager section */}
          {effectiveSection === 'songLibrary' && <SongLibraryManager projector={projector} />}

          {/* Song Database Editor section */}
          {effectiveSection === 'songEditor' && <SongDatabaseEditor projector={projector} />}

          {/* Melody Library Manager section */}
          {effectiveSection === 'melodyLibrary' && (
            <MelodyLibraryManager
              allMelodies={cantors.allMelodies}
              onAdd={cantors.addMelodyToLibrary}
              onUpdate={cantors.updateMelodyInLibrary}
              onDelete={cantors.deleteMelodyFromLibrary}
            />
          )}

          {/* Cantors section */}
          {effectiveSection === 'cantors' && <CantorPanel cantors={cantors} />}

          {/* Harmonograms section */}
          {effectiveSection === 'harmonograms' && (
            <HarmonogramsPanel onLoad={(playlist, organist) => {
              projector.clearPlaylist();
              playlist.forEach(item => {
                if (item.songId) {
                  const song = projector.songs.find(s => s.id === item.songId);
                  if (song) projector.addToPlaylist(song);
                  else projector.addPsalmToPlaylist(item.title);
                } else {
                  projector.addPsalmToPlaylist(item.title);
                }
              });
              setSection('dashboard');
            }} />
          )}

          {/* Songbook section */}
          {effectiveSection === 'songbook' && (() => {
            const pilotProps: PilotProps | undefined = moduleSettings.projectorEnabled ? {
              onPrevSlide: () => projector.prevSlide(),
              onNextSlide: () => projector.nextSlide(),
              onPrevSong: () => { const { currentItemIndex } = projector.state; if (currentItemIndex > 0) projector.goToItem(currentItemIndex - 1); },
              onNextSong: () => { const { currentItemIndex, playlist } = projector.state; if (currentItemIndex < playlist.length - 1) projector.goToItem(currentItemIndex + 1); },
              onToggleLive: () => projector.toggleLive(),
              isLive: projector.state.isLive,
              slideInfo: (() => {
                const song = projector.directSong || projector.currentSong;
                const vi = projector.directSong ? projector.directVerseIndex : projector.state.currentVerseIndex;
                const total = song ? getSongSlides(song).length : 0;
                return total > 0 ? `${vi + 1}/${total}` : '';
              })(),
            } : undefined;
            return <SongbookPanel onClose={() => setSection('schedule')} pilot={pilotProps} />;
          })()}

          {/* Settings section */}
          {effectiveSection === 'settings' && (
            <SettingsPanel
              onImport={importData}
              moduleSettings={moduleSettings}
              onModuleSettingsChange={setModuleSettings}
              onRestoreBackup={projector.setSongs}
            />
          )}
          </Suspense>
        </div>
      </main>
    </div>
  );
};

export default Index;
