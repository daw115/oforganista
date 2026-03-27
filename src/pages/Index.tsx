import { useState, useEffect, useMemo } from 'react';
import { PinLockScreen } from '@/components/auth/PinLockScreen';
import { getProjectorSettings, getResolvedTextColor } from '@/lib/projectorSettings';
import { useSchedule } from '@/hooks/useSchedule';
import { useProjector } from '@/hooks/useProjector';
import { useProjectorLAN } from '@/hooks/useProjectorLAN';
import { useCantors } from '@/hooks/useCantors';
import { AppSidebar, Section } from '@/components/layout/AppSidebar';
import { SimpleNavBar } from '@/components/layout/SimpleNavBar';
import { TodayCard } from '@/components/schedule/TodayCard';
import { StatsPanel } from '@/components/schedule/StatsPanel';
import { ScheduleTable } from '@/components/schedule/ScheduleTable';
import { SettlementPanel } from '@/components/schedule/SettlementPanel';
import { LiturgyPanel, type LiturgyAddTarget } from '@/components/liturgy/LiturgyPanel';
import { ProjectorControl } from '@/components/projector/ProjectorControl';
import { ProjectorLANControl } from '@/components/projector/ProjectorLANControl';
import { ProjectorLANRemote } from '@/components/projector/ProjectorLANRemote';
import { SongLibraryManager } from '@/components/projector/SongLibraryManager';
import { SongDatabaseEditor } from '@/components/projector/SongDatabaseEditor';
import { AnnouncementsPanel } from '@/components/announcements/AnnouncementsPanel';
import { TodayAnnouncementCard } from '@/components/announcements/TodayAnnouncementCard';
import { useAnnouncements } from '@/hooks/useAnnouncements';
import { CantorPanel } from '@/components/cantor/CantorPanel';
import { CantorNotifications } from '@/components/cantor/CantorNotifications';
import { CantorAdmin } from '@/components/cantor/CantorAdmin';
import { MelodyLibraryManager } from '@/components/cantor/MelodyLibraryManager';
import { SettingsPanel, getModuleSettings, syncModuleSettingsFromServer, type ModuleSettings, type ViewMode } from '@/components/settings/SettingsPanel';
import { useDevotions, estimateLiturgicalPeriod } from '@/hooks/useDevotions';
import { DevotionsManager } from '@/components/devotions/DevotionsManager';
import { TodayDevotionsCard } from '@/components/devotions/TodayDevotionsCard';
import { SongbookPanel } from '@/components/songbook/SongbookPanel';
import type { PilotProps } from '@/components/projector/PilotStrip';
import { getSongSlides } from '@/lib/projectorLayout';
import { DashboardPanel } from '@/components/dashboard/DashboardPanel';
import { AllPanel } from '@/components/all/AllPanel';
import { useLiturgyPrefetch } from '@/hooks/useLiturgyPrefetch';
import { HarmonogramsPanel } from '@/components/harmonograms/HarmonogramsPanel';

import { searchAndAddSong } from '@/lib/openLpApi';
import { ChevronDown, ChevronUp, Calendar, Download, Monitor, Wifi, Settings as SettingsIcon, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';


const Index = () => {
  const {
    sched, loading, msg, organists, dates, stats, rawCsv,
    todayStr, tomorrowStr, todayGroup, tomorrowGroup,
    fetchSheet, importData, clearSchedule, groupByDate, csvHolidays,
  } = useSchedule();

  const projector = useProjector();
  const projectorLAN = useProjectorLAN();
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
  const [section, setSection] = useState<Section>(defaultSection);
  const [showFull, setShowFull] = useState(false);
  const [unlockedUser, setUnlockedUser] = useState<string | null>(() => {
    try { return sessionStorage.getItem('appUnlockedUser'); } catch { return null; }
  });

  const handleUnlock = (name: string) => {
    setUnlockedUser(name);
    try { sessionStorage.setItem('appUnlockedUser', name); } catch {}
  };


  // Forward remote LAN bridge state to projector screen via main sync channel
  useEffect(() => {
    const remote = projectorLAN.remoteLanState;
    if (projectorLAN.bridgeMode || !remote?.connected) return;
    const slide = remote.slides[remote.currentSlideIndex];
    const text = slide?.text ?? '';
    const title = remote.currentTitle ?? '';
    const isLive = remote.displayMode === 'show';
    // Include visual settings so remote displays get correct appearance
    const ps = getProjectorSettings();
    const resolvedColor = getResolvedTextColor(ps);
    const settings = {
      fontSize: ps.fontSize, textColor: resolvedColor, strokeWidth: ps.strokeWidth,
      background: ps.background, shadowIntensity: ps.shadowIntensity, rotation: ps.rotation,
      maxLines: ps.maxLines, offsetX: ps.offsetX, offsetY: ps.offsetY, scale: ps.scale,
    };
    projector.projectorSync.sendState({ text, isLive, title, settings });
  }, [projectorLAN.bridgeMode, projectorLAN.remoteLanState, projector.projectorSync]);

  // Build dynamic add targets for Liturgy panel based on enabled modules
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
    if (moduleSettings.projectorLANEnabled || moduleSettings.projectorLANRemoteEnabled) {
      const isServer = moduleSettings.projectorLANEnabled;
      targets.push({
        key: 'lan',
        label: 'LAN',
        icon: <Wifi className="w-3 h-3 text-emerald" />,
        onAdd: async (song) => {
          if (isServer) {
            if (projectorLAN.state.connected) {
              const found = await searchAndAddSong(projectorLAN.config, song.title);
              if (!found) console.warn(`Nie znaleziono „${song.title}" w OpenLP`);
              else {
                setTimeout(() => projectorLAN.refreshData(), 500);
                setTimeout(() => projectorLAN.refreshData(), 1200);
              }
            }
          } else {
            await projectorLAN.lanSync.sendLanCommand('addSong', undefined, song.title);
            await projectorLAN.lanSync.sendLanCommand('refresh');
          }
        },
      });
    }
    return targets;
  }, [moduleSettings.projectorEnabled, moduleSettings.projectorLANEnabled, moduleSettings.projectorLANRemoteEnabled, projector.addToPlaylist, projectorLAN.state.connected, projectorLAN.config, projectorLAN.refreshData, projectorLAN.lanSync]);

  const projectorPlaylistSongIds = useMemo(() => new Set(projector.state.playlist.map(p => p.songId)), [projector.state.playlist]);

  // If current section is disabled, redirect
  const effectiveSection = (
    (section === 'all' && viewMode !== 'all') ||
    (section === 'projector' && !moduleSettings.projectorEnabled) ||
    (section === 'projectorLAN' && !moduleSettings.projectorLANEnabled) ||
    (section === 'projectorLANRemote' && !moduleSettings.projectorLANRemoteEnabled)
  ) ? 'dashboard' : section;

  const remoteElement = null;

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

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
        <div className="animate-fade-in h-full p-3 md:p-4 lg:p-5 pb-20 md:pb-4 max-w-screen-2xl mx-auto">

          {/* Status message */}
          {msg && (
            <div className="bg-emerald/10 border border-emerald/30 text-emerald px-5 py-3 rounded-lg mb-4 font-semibold text-sm">
              {msg}
            </div>
          )}

          {/* Dashboard */}
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
          {effectiveSection === 'projector' && <ProjectorControl projector={projector} lan={moduleSettings.projectorLANEnabled ? projectorLAN : undefined} />}

          {/* Projector LAN Server section */}
          {effectiveSection === 'projectorLAN' && <ProjectorLANControl lan={projectorLAN} projector={projector} />}

          {/* Projector LAN Remote section */}
          {effectiveSection === 'projectorLANRemote' && <ProjectorLANRemote lan={projectorLAN} projector={projector} />}

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
            const activeRemote = moduleSettings.activeRemote;
            const isLAN = activeRemote === 'projectorLAN' || activeRemote === 'projectorLANRemote';
            const pilotProps: PilotProps | undefined = activeRemote ? {
              onPrevSlide: () => { if (isLAN) projectorLAN.prevSlide(); else projector.prevSlide(); },
              onNextSlide: () => { if (isLAN) projectorLAN.nextSlide(); else projector.nextSlide(); },
              onPrevSong: () => {
                if (isLAN) { projectorLAN.prevServiceItem(); }
                else { const { currentItemIndex } = projector.state; if (currentItemIndex > 0) projector.goToItem(currentItemIndex - 1); }
              },
              onNextSong: () => {
                if (isLAN) { projectorLAN.nextServiceItem(); }
                else { const { currentItemIndex, playlist } = projector.state; if (currentItemIndex < playlist.length - 1) projector.goToItem(currentItemIndex + 1); }
              },
              onToggleLive: () => { if (isLAN) projectorLAN.toggleDisplay(); else projector.toggleLive(); },
              isLive: isLAN ? projectorLAN.state.displayMode === 'show' : projector.state.isLive,
              slideInfo: (() => {
                if (isLAN) return `${projectorLAN.state.currentSlideIndex + 1}/${projectorLAN.state.slides.length}`;
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
        </div>
      </main>
    </div>
  );
};

export default Index;
