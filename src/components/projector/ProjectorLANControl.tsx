import { useState, useCallback, useEffect, useRef } from 'react';
import { useProjectorLAN } from '@/hooks/useProjectorLAN';
import { useProjector } from '@/hooks/useProjector';
import { addSongToService, searchAndAddSong } from '@/lib/openLpApi';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { SongLibrary } from './SongLibrary';
import {
  Wifi, WifiOff, ListMusic, SkipForward, HelpCircle,
  ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, ChevronDown,
  Monitor, MonitorOff, RefreshCw, Settings2, FlaskConical, Loader2,
  Radio, Globe, Database, Search, Upload, CheckCircle2, AlertCircle, HardDrive,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { Song } from '@/types/projector';

type LANHook = ReturnType<typeof useProjectorLAN>;
type ProjectorHook = ReturnType<typeof useProjector>;

export function ProjectorLANControl({ lan, projector }: { lan: LANHook; projector: ProjectorHook }) {
  const {
    config, setConfig, state, polling,
    connect, disconnect, nextSlide, prevSlide,
    goToSlide, goToServiceItem, nextServiceItem, prevServiceItem, toggleDisplay,
    refreshData, remoteLanState, lanSync,
  } = lan;

  const isRemote = !state.connected && !!remoteLanState?.connected;
  const effectiveServiceItems = isRemote ? (remoteLanState?.serviceItems ?? []) : state.serviceItems;
  const effectiveSlides = isRemote ? (remoteLanState?.slides ?? []) : state.slides;
  const effectiveServiceIndex = isRemote ? (remoteLanState?.currentServiceIndex ?? -1) : state.currentServiceIndex;
  const effectiveSlideIndex = isRemote ? (remoteLanState?.currentSlideIndex ?? -1) : state.currentSlideIndex;
  const effectiveConnected = state.connected || isRemote;
  const effectiveDisplayMode = isRemote ? (remoteLanState?.displayMode ?? 'show') : state.displayMode;
  const effectiveTitle = isRemote ? (remoteLanState?.currentTitle ?? '') : state.currentTitle;

  const [roomInput, setRoomInput] = useState(lan.lanSync.roomId);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<{ proxy: string | null; openlp: string | null; details: string } | null>(null);

  const {
    songs, filteredSongs, loading,
    searchQuery, setSearchQuery, searchByContent, setSearchByContent,
    forceReloadDatabase, checkLocalDb, importDatabase,
    directSong, directVerseIndex, clearDirectMode, showOnScreen,
    getCurrentText,
    nextSlide: projectorNextSlide, prevSlide: projectorPrevSlide,
  } = projector;

  const directText = directSong ? getCurrentText() : null;
  const directVerse = directSong?.verses[directVerseIndex];
  const directTotalVerses = directSong?.verses.length || 0;

  const [importMsg, setImportMsg] = useState('');
  const [libraryExpanded, setLibraryExpanded] = useState(false);
  const [dbStatus, setDbStatus] = useState<{ source: string; count: number } | null>(null);
  const [localDbInfo, setLocalDbInfo] = useState<{ available: boolean; path: string | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoLoadedLocalRef = useRef(false);

  // Auto-detect local DB on mount
  useEffect(() => {
    checkLocalDb().then(info => {
      setLocalDbInfo(info);
      // Auto-load local DB if available and not yet loaded
      if (info.available && !autoLoadedLocalRef.current) {
        autoLoadedLocalRef.current = true;
        forceReloadDatabase('local')
          .then(count => {
            setDbStatus({ source: `lokalna baza (${info.path})`, count });
            setImportMsg(`✅ Załadowano ${count} pieśni z lokalnej bazy OpenLP`);
          })
          .catch(() => {
            setImportMsg('⚠️ Nie udało się wczytać lokalnej bazy');
          });
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update db status when songs change
  useEffect(() => {
    if (songs.length > 0 && !dbStatus) {
      setDbStatus({ source: 'pamięć/cache', count: songs.length });
    }
  }, [songs.length, dbStatus]);

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg(`Importuję bazę z pliku „${file.name}"...`);
    try {
      const count = await importDatabase(file);
      setDbStatus({ source: `plik: ${file.name}`, count });
      setImportMsg(`✅ Załadowano ${count} pieśni z pliku „${file.name}"`);
    } catch {
      setImportMsg('⚠️ Błąd importu bazy z pliku');
    }
    e.target.value = '';
  };

  const handleLoadBundled = async () => {
    setImportMsg('Przeładowuję wbudowaną bazę SQLite...');
    try {
      const count = await forceReloadDatabase('bundled');
      setDbStatus({ source: 'wbudowana baza SQLite', count });
      setImportMsg(`✅ Załadowano ${count} pieśni z wbudowanej bazy SQLite`);
    } catch { setImportMsg('⚠️ Błąd ładowania wbudowanej bazy'); }
  };

  const handleLoadLocal = async () => {
    setImportMsg('Wczytuję bazę z dysku...');
    try {
      const count = await forceReloadDatabase('local');
      setDbStatus({ source: `lokalna baza OpenLP`, count });
      setImportMsg(`✅ Załadowano ${count} pieśni z lokalnej bazy`);
    } catch {
      setImportMsg('⚠️ Nie udało się wczytać lokalnej bazy');
    }
  };

  const handleAddToPlaylist = async (song: Song) => {
    if (!state.connected) {
      if (isRemote) {
        try {
          setImportMsg(`Wysyłam „${song.title}" do mostu...`);
          await lanSync.sendLanCommand('addSong', undefined, song.title);
          await lanSync.sendLanCommand('refresh');
          setImportMsg(`Wysłano „${song.title}" do dodania`);
        } catch {
          setImportMsg(`Błąd wysyłania „${song.title}" do mostu`);
        }
        return;
      }
      setImportMsg('Najpierw połącz z OpenLP');
      return;
    }

    setImportMsg(`Dodaję „${song.title}" do listy...`);
    try {
      let added = false;
      const numericSongId = Number(song.id);

      if (Number.isFinite(numericSongId) && numericSongId >= 0) {
        try {
          await addSongToService(config, numericSongId);
          added = true;
        } catch {
          // fallback do wyszukiwania po tytule
        }
      }

      if (!added) {
        added = await searchAndAddSong(config, song.title);
      }

      if (added) {
        setImportMsg(`Dodano „${song.title}" do listy`);
        setTimeout(() => refreshData(), 500);
        setTimeout(() => refreshData(), 1200);
        setTimeout(() => refreshData(), 2200);
      } else {
        setImportMsg(`Nie znaleziono „${song.title}" w OpenLP`);
      }
    } catch (err) {
      const details = err instanceof Error ? ` (${err.message})` : '';
      setImportMsg(`Błąd dodawania „${song.title}"${details}`);
    }
  };

  const runTest = useCallback(async () => {
    setTesting(true);
    setTestResults(null);
    const isLocal = window.location.protocol === 'http:';
    const proxyBase = isLocal ? `${window.location.origin}/openlp-proxy/${config.ip}/${config.port}` : null;
    const directUrl = `http://${config.ip}:${config.port}/api/poll`;
    const lines: string[] = [];
    let proxyStatus: string | null = null;
    let openlpStatus: string | null = null;

    if (proxyBase) {
      try {
        const t0 = performance.now();
        const res = await fetch(`${proxyBase}/api/poll`, { signal: AbortSignal.timeout(5000) });
        const ms = Math.round(performance.now() - t0);
        if (res.ok) {
          const raw = await res.json();
          const data = raw.results ?? raw;
          proxyStatus = `✅ OK (${ms}ms)`;
          lines.push(`Proxy → ${res.status} w ${ms}ms`);
          lines.push(`Poll: slide=${data.slide}, service=${data.service}, item=${data.item}`);
        } else {
          proxyStatus = `⚠️ HTTP ${res.status}`;
          lines.push(`Proxy → HTTP ${res.status}`);
        }
      } catch (e: any) {
        proxyStatus = `❌ ${e.name === 'TimeoutError' ? 'Timeout' : e.message}`;
        lines.push(`Proxy → ${proxyStatus}`);
      }
    } else {
      proxyStatus = '⏭ Pominięto (HTTPS)';
      lines.push('Proxy niedostępne przez HTTPS');
    }

    try {
      const t0 = performance.now();
      const res = await fetch(directUrl, { signal: AbortSignal.timeout(5000) });
      const ms = Math.round(performance.now() - t0);
      if (res.ok) {
        openlpStatus = `✅ OK (${ms}ms)`;
        lines.push(`Bezpośrednio → ${res.status} w ${ms}ms`);
      } else {
        openlpStatus = `⚠️ HTTP ${res.status}`;
        lines.push(`Bezpośrednio → HTTP ${res.status}`);
      }
    } catch (e: any) {
      openlpStatus = `❌ ${e.name === 'TimeoutError' ? 'Timeout' : e.message}`;
      lines.push(`Bezpośrednio → ${openlpStatus}`);
      if (window.location.protocol === 'https:') {
        lines.push('(Mixed content — HTTPS→HTTP blokowane)');
      }
    }

    setTestResults({ proxy: proxyStatus, openlp: openlpStatus, details: lines.join('\n') });
    setTesting(false);
  }, [config.ip, config.port]);

  return (
    <div className="animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 h-full">
        {/* LEFT: Tabs + Song Library */}
        <div className="md:col-span-1 flex flex-col min-h-0 gap-3">
          <Tabs defaultValue={state.connected ? 'service' : 'connect'} className="flex flex-col min-h-0 transition-all duration-300" style={{ flex: libraryExpanded ? '0 0 auto' : '1 1 auto' }}>
            <TabsList className="w-full shrink-0" onClick={() => {
              if (libraryExpanded) setLibraryExpanded(false);
            }}>
              <TabsTrigger value="connect" className="flex-1 gap-1.5 text-xs">
                {state.connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                Połączenie
              </TabsTrigger>
              <TabsTrigger value="service" className="flex-1 gap-1.5 text-xs">
                <ListMusic className="w-3.5 h-3.5" />
                Lista
              </TabsTrigger>
              <TabsTrigger value="slides" className="flex-1 gap-1.5 text-xs">
                <SkipForward className="w-3.5 h-3.5" />
                Slajdy
              </TabsTrigger>
              <TabsTrigger value="help" className="w-10 px-0" title="Instrukcja">
                <HelpCircle className="w-3.5 h-3.5" />
              </TabsTrigger>
            </TabsList>

            {/* CONNECTION TAB */}
            <TabsContent value="connect" className={`flex-1 min-h-0 mt-2 overflow-auto ${libraryExpanded ? 'hidden' : ''}`}>
              <div className="rounded-xl border border-border bg-card p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${state.connected ? 'bg-success' : lan.paused ? 'bg-amber-500 animate-pulse' : 'bg-destructive'}`} />
                  <span className="text-sm font-medium text-foreground">
                    {state.connected ? 'Połączono z OpenLP' : lan.paused ? 'Wstrzymano (błędy połączenia)' : 'Rozłączono'}
                  </span>
                </div>

                {state.error && (
                  <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-1.5">
                    {state.error}
                  </div>
                )}

                {lan.paused && (
                  <Button onClick={connect} size="sm" className="w-full bg-amber-600 hover:bg-amber-700 text-white h-9">
                    <RefreshCw className="w-4 h-4" />
                    Połącz ponownie
                  </Button>
                )}

                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">IP</label>
                    <input
                      value={config.ip}
                      onChange={e => setConfig(prev => ({ ...prev, ip: e.target.value }))}
                      placeholder="192.168.0.102"
                      className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground"
                    />
                  </div>
                  <div className="w-20">
                    <label className="text-xs text-muted-foreground mb-1 block">Port</label>
                    <input
                      type="number"
                      value={config.port}
                      onChange={e => setConfig(prev => ({ ...prev, port: Number(e.target.value) }))}
                      className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground"
                    />
                  </div>
                  {!polling ? (
                    <Button onClick={connect} size="sm" className="bg-primary text-primary-foreground h-8">
                      <Wifi className="w-3.5 h-3.5" />
                      Połącz
                    </Button>
                  ) : (
                    <Button onClick={disconnect} variant="outline" size="sm" className="text-destructive border-destructive/30 h-8">
                      <WifiOff className="w-3.5 h-3.5" />
                      Rozłącz
                    </Button>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button onClick={runTest} disabled={testing} variant="outline" size="sm" className="flex-1 h-7 text-xs">
                    {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
                    {testing ? 'Test…' : 'Test'}
                  </Button>
                  {state.connected && (
                    <Button onClick={() => refreshData()} variant="ghost" size="sm" className="h-7">
                      <RefreshCw className="w-3 h-3" />
                    </Button>
                  )}
                </div>

                {testResults && (
                  <div className="rounded-lg border border-border bg-muted/50 p-2 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Proxy:</span>
                      <span className="font-medium text-foreground">{testResults.proxy}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">OpenLP:</span>
                      <span className="font-medium text-foreground">{testResults.openlp}</span>
                    </div>
                    <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap bg-background rounded p-1.5 border border-border">
                      {testResults.details}
                    </pre>
                  </div>
                )}

                {/* Bridge Mode */}
                <div className="border-t border-border pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Radio className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-medium text-foreground">Tryb mostu</span>
                    </div>
                    <Switch
                      checked={lan.bridgeMode}
                      onCheckedChange={lan.setBridgeMode}
                      disabled={!state.connected}
                    />
                  </div>
                  {lan.bridgeMode && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <Globe className="w-3 h-3 text-primary" />
                        <span className="text-xs font-medium text-foreground">
                          Pokój: <span className="font-mono text-primary">{lan.lanSync.roomId}</span>
                        </span>
                        <span className={`ml-auto w-2 h-2 rounded-full ${lan.lanSync.cloudConnected ? 'bg-success' : 'bg-muted'}`} />
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Podaj ten kod osobom, które chcą sterować zdalnie.
                      </p>
                    </div>
                  )}
                </div>

                {/* Join Room — when not connected */}
                {!state.connected && (
                  <div className="border-t border-border pt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-medium text-foreground">Dołącz do pokoju</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={roomInput}
                        onChange={e => setRoomInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                        placeholder="1234"
                        maxLength={4}
                        className="w-20 rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground font-mono text-center tracking-widest"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={roomInput.length !== 4}
                        onClick={() => lan.lanSync.changeRoom(roomInput)}
                      >
                        Dołącz
                      </Button>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
                        <span className={`w-2 h-2 rounded-full ${lan.lanSync.cloudConnected ? 'bg-success' : 'bg-muted'}`} />
                        {lan.lanSync.cloudConnected
                          ? <span className="font-mono text-primary">{lan.lanSync.roomId}</span>
                          : <span>—</span>
                        }
                      </div>
                    </div>
                    {lan.remoteLanState?.connected && (
                      <div className="text-xs text-success flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-success" />
                        Most aktywny
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* SERVICE TAB */}
            <TabsContent value="service" className={`flex-1 min-h-0 mt-2 ${libraryExpanded ? 'hidden' : ''}`}>
              <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col h-full">
                <div className="px-3 py-2.5 border-b border-border">
                  <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                    <ListMusic className="w-4 h-4 text-primary" />
                    Lista ({effectiveServiceItems.length})
                    {isRemote && <span title="Dane zdalne"><Globe className="w-3 h-3 text-muted-foreground ml-1" /></span>}
                  </h3>
                </div>
                <div className="flex-1 overflow-auto px-2 pb-2 pt-1">
                  {effectiveServiceItems.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      {effectiveConnected ? 'Brak elementów nabożeństwa' : 'Połącz z OpenLP lub dołącz do pokoju z mostem'}
                    </p>
                  )}
                  {effectiveServiceItems.map((item, i) => (
                    <button
                      key={item.id}
                      onClick={() => isRemote ? lanSync.sendLanCommand('goToItem', i) : goToServiceItem(i)}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors touch-target ${
                        i === effectiveServiceIndex
                          ? 'bg-primary/10 text-primary border border-primary/30'
                          : 'hover:bg-panel-hover'
                      }`}
                    >
                      <span className="font-mono text-xs text-muted-foreground w-5">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.plugin}</p>
                      </div>
                      {item.selected && (
                        <span className="text-xs text-success font-medium">▶</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* SLIDES TAB */}
            <TabsContent value="slides" className={`flex-1 min-h-0 mt-2 ${libraryExpanded ? 'hidden' : ''}`}>
              <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col h-full">
                <div className="px-3 py-2.5 border-b border-border">
                  <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                    <SkipForward className="w-4 h-4 text-primary" />
                    Slajdy ({effectiveSlides.length})
                    {isRemote && <span title="Dane zdalne"><Globe className="w-3 h-3 text-muted-foreground ml-1" /></span>}
                  </h3>
                </div>
                <div className="flex-1 overflow-auto px-2 pb-2 pt-1">
                  {effectiveSlides.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      {effectiveConnected ? 'Brak slajdów — wybierz element nabożeństwa' : 'Połącz z OpenLP lub dołącz do pokoju z mostem'}
                    </p>
                  )}
                  {effectiveSlides.map((slide, i) => (
                    <button
                      key={i}
                      onClick={() => isRemote ? lanSync.sendLanCommand('goToSlide', i) : goToSlide(i)}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors touch-target ${
                        i === effectiveSlideIndex
                          ? 'bg-primary/10 text-primary border border-primary/30'
                          : 'hover:bg-panel-hover'
                      }`}
                    >
                      <span className="font-mono text-xs text-primary w-8">{slide.tag}</span>
                      <p className="text-xs text-foreground truncate flex-1 whitespace-pre-line line-clamp-2">
                        {slide.text.replace(/<[^>]*>/g, '').trim() || '—'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* HELP TAB */}
            <TabsContent value="help" className={`flex-1 min-h-0 mt-2 overflow-auto ${libraryExpanded ? 'hidden' : ''}`}>
              <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground space-y-4">
                <div>
                  <h4 className="font-semibold text-foreground mb-1">Konfiguracja OpenLP</h4>
                  <div className="space-y-1">
                    <p><strong className="text-foreground">1.</strong> Uruchom OpenLP na komputerze w sieci LAN</p>
                    <p><strong className="text-foreground">2.</strong> Ustawienia → Zdalne sterowanie → włącz moduł Remote</p>
                    <p><strong className="text-foreground">3.</strong> Ustaw adres na <kbd className="px-1 py-0.5 rounded bg-muted text-xs">0.0.0.0</kbd>, port <kbd className="px-1 py-0.5 rounded bg-muted text-xs">4316</kbd></p>
                    <p><strong className="text-foreground">4.</strong> Zrestartuj OpenLP</p>
                    <p><strong className="text-foreground">5.</strong> Sprawdź IP komputera: <kbd className="px-1 py-0.5 rounded bg-muted text-xs">ipconfig</kbd> w wierszu poleceń</p>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground mb-1">Uruchomienie aplikacji</h4>
                  <div className="space-y-1">
                    <p><strong className="text-foreground">A.</strong> Na <strong className="text-foreground">tym samym komputerze</strong> co OpenLP (zalecane):</p>
                    <div className="ml-4 space-y-0.5 text-xs">
                      <p>1. Sklonuj projekt: <kbd className="px-1 py-0.5 rounded bg-muted">git clone [URL] && cd [folder]</kbd></p>
                      <p>2. Zainstaluj: <kbd className="px-1 py-0.5 rounded bg-muted">npm install</kbd> (jednorazowo)</p>
                      <p>3. Uruchom: <kbd className="px-1 py-0.5 rounded bg-muted">npm run dev</kbd></p>
                      <p>4. Otwórz <kbd className="px-1 py-0.5 rounded bg-muted">http://localhost:8080</kbd></p>
                    </div>
                  </div>
                </div>
                <div className="border-t border-border pt-2">
                  <h4 className="font-semibold text-foreground mb-1">Częste problemy</h4>
                  <div className="space-y-0.5 text-xs">
                    <p>⚠️ <strong>HTTPS blokuje połączenie</strong> — zawsze używaj wersji HTTP (localhost lub IP)</p>
                    <p>⚠️ <strong>Firewall</strong> — odblokuj port 4316 (OpenLP) i 8080 (aplikacja)</p>
                    <p>⚠️ <strong>Brak odpowiedzi</strong> — sprawdź czy w OpenLP adres to <kbd className="px-1 py-0.5 rounded bg-muted">0.0.0.0</kbd> (nie 127.0.0.1)</p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Song Library — with DB status */}
          <div className="min-h-0 transition-all duration-300 flex flex-col" style={{ flex: libraryExpanded ? '1 1 auto' : '0 0 auto' }}>
            <Tabs defaultValue="library" className="flex flex-col h-full">
              <TabsList className="w-full shrink-0 cursor-pointer" onClick={() => { if (!libraryExpanded) setLibraryExpanded(true); }}>
                <TabsTrigger value="library" className="flex-1 gap-1.5 text-xs">
                  <Database className="w-3.5 h-3.5" />
                  Baza {songs.length > 0 && <span className="text-[10px] text-muted-foreground">({songs.length})</span>}
                </TabsTrigger>
                <button
                  onClick={(e) => { e.stopPropagation(); setLibraryExpanded(!libraryExpanded); }}
                  className="p-1.5 rounded hover:bg-muted-foreground/20 text-muted-foreground"
                  title={libraryExpanded ? 'Zwiń bazę' : 'Szukaj pieśni'}
                >
                  {libraryExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
                </button>
              </TabsList>

              {/* DB Status bar — always visible */}
              <div className="mt-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-[11px] space-y-1">
                <div className="flex items-center gap-1.5">
                  {songs.length > 0 ? (
                    <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
                  ) : (
                    <AlertCircle className="w-3 h-3 text-warning shrink-0" />
                  )}
                  <span className="text-foreground font-medium">
                    {songs.length > 0 ? `${songs.length} pieśni` : 'Brak bazy'}
                  </span>
                  {dbStatus && (
                    <span className="text-muted-foreground truncate">
                      — {dbStatus.source}
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {localDbInfo?.available && (
                    <button
                      onClick={handleLoadLocal}
                      disabled={loading}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors text-[10px] font-medium disabled:opacity-50"
                    >
                      <HardDrive className="w-2.5 h-2.5" />
                      Wczytaj z dysku
                    </button>
                  )}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-background text-foreground hover:bg-muted transition-colors text-[10px] font-medium disabled:opacity-50"
                  >
                    <Upload className="w-2.5 h-2.5" />
                    Wskaż plik .sqlite
                  </button>
                  <button
                    onClick={handleLoadBundled}
                    disabled={loading}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-background text-foreground hover:bg-muted transition-colors text-[10px] font-medium disabled:opacity-50"
                  >
                    <Database className="w-2.5 h-2.5" />
                    Wbudowana
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".sqlite,.db,.sqlite3"
                  onChange={handleFileImport}
                  className="hidden"
                />
              </div>

              {libraryExpanded && (
                <TabsContent value="library" className="flex-1 min-h-0 mt-2">
                  <div className="h-full">
                    <SongLibrary
                      songs={songs}
                      filteredSongs={filteredSongs}
                      searchQuery={searchQuery}
                      onSearchChange={setSearchQuery}
                      onLoadBundled={handleLoadBundled}
                      onAddToPlaylist={handleAddToPlaylist}
                      onShowOnScreen={showOnScreen}
                      onDeleteSong={projector.deleteSong}
                      onSearchFocus={() => setLibraryExpanded(true)}
                      loading={loading}
                      importMsg={importMsg}
                      searchByContent={searchByContent}
                      onSearchByContentChange={setSearchByContent}
                    />
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </div>
        </div>

        {/* RIGHT: Live Preview */}
        <div className="md:col-span-1 lg:col-span-2 flex flex-col min-h-0">
          {/* Status bar */}
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                directSong ? 'bg-warning animate-pulse'
                  : effectiveDisplayMode === 'show' && effectiveConnected ? 'bg-success animate-pulse' : 'bg-warning'
              }`} />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {directSong ? '⚡ EKRAN'
                  : effectiveConnected
                    ? effectiveDisplayMode === 'show' ? 'NA ŻYWO' : 'WYGASZONO'
                    : 'ROZŁĄCZONO'}
              </span>
              {directSong ? (
                <span className="text-sm text-foreground font-medium truncate min-w-0">
                  <span className="text-xs text-warning mr-1">⚡</span>
                  {directSong.title}
                  <span className="text-muted-foreground ml-1 text-xs">
                    {directVerseIndex + 1}/{directTotalVerses}
                  </span>
                </span>
              ) : effectiveTitle && (
                <span className="text-sm text-foreground font-medium truncate min-w-0">
                  {effectiveTitle}
                  <span className="text-muted-foreground ml-1 text-xs">
                    {effectiveSlideIndex + 1}/{effectiveSlides.length}
                  </span>
                </span>
              )}
              {directSong && (
                <button
                  onClick={clearDirectMode}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border"
                  title="Wróć do OpenLP"
                >
                  ✕ Zamknij
                </button>
              )}
            </div>
          </div>

          {/* Preview area */}
          <div className={`flex-1 rounded-xl border min-h-0 overflow-hidden relative flex items-center justify-center p-8 ${
            directSong ? 'border-warning/30 bg-black'
              : effectiveDisplayMode === 'show' && effectiveConnected ? 'border-success/30 bg-black' : 'border-muted-foreground/20 bg-black'
          }`}>
            {directSong ? (
              <div className="text-center max-w-2xl w-full">
                <p className="text-xs text-warning/70 mb-3 font-medium">
                  ⚡ {directSong.title} — slajd {directVerseIndex + 1}/{directTotalVerses}
                </p>
                <p
                  className="whitespace-pre-line font-medium leading-relaxed text-white"
                  style={{
                    fontSize: (directText?.length || 0) > 300 ? '0.8rem' : (directText?.length || 0) > 200 ? '1rem' : (directText?.length || 0) > 100 ? '1.15rem' : '1.3rem',
                    lineHeight: 1.5,
                  }}
                >
                  {directText}
                </p>
                {directVerse && (
                  <span className="absolute bottom-2 right-3 text-xs text-muted-foreground font-mono">
                    {directVerse.label}
                  </span>
                )}
              </div>
            ) : !effectiveConnected ? (
              <div className="text-center">
                <MonitorOff className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground/40">Połącz z OpenLP lub dołącz do pokoju</p>
              </div>
            ) : effectiveDisplayMode === 'blank' ? (
              <div className="text-center">
                <MonitorOff className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground/40">Ekran wygaszony</p>
              </div>
            ) : (() => {
              const slide = effectiveSlides[effectiveSlideIndex];
              const text = slide?.text ?? '';
              return text ? (
                <p className="text-white text-center text-lg leading-relaxed whitespace-pre-line max-w-2xl">{text}</p>
              ) : (
                <p className="text-muted-foreground text-sm">Brak tekstu na slajdzie</p>
              );
            })()}
            {!directSong && effectiveConnected && effectiveSlides[effectiveSlideIndex]?.tag && (
              <span className="absolute bottom-2 right-3 text-xs text-muted-foreground font-mono">
                {effectiveSlides[effectiveSlideIndex].tag}
              </span>
            )}
          </div>

          {/* Controls — 6-column */}
          <div className="grid grid-cols-6 gap-2 mt-2">
            <button
              onClick={() => directSong ? projectorPrevSlide() : isRemote ? lanSync.sendLanCommand('prev') : prevSlide()}
              disabled={!directSong && !effectiveConnected}
              className="flex flex-col items-center gap-1 rounded-xl border border-destructive/40 bg-card p-3 hover:bg-destructive/10 touch-target disabled:opacity-30 disabled:border-border"
            >
              <ChevronLeft className="h-6 w-6 text-destructive" />
            </button>
            <button
              onClick={() => {
                if (directSong) return;
                prevServiceItem();
              }}
              disabled={!!directSong || !effectiveConnected || effectiveServiceItems.length === 0}
              className="flex flex-col items-center gap-1 rounded-xl border border-muted-foreground/30 bg-card p-3 hover:bg-muted/30 touch-target disabled:opacity-30 disabled:border-border"
            >
              <ChevronsLeft className="h-6 w-6 text-muted-foreground" />
            </button>
            <button
              onClick={() => {
                if (directSong) return;
                nextServiceItem();
              }}
              disabled={!!directSong || !effectiveConnected || effectiveServiceItems.length === 0}
              className="flex flex-col items-center gap-1 rounded-xl border border-muted-foreground/30 bg-card p-3 hover:bg-muted/30 touch-target disabled:opacity-30 disabled:border-border"
            >
              <ChevronsRight className="h-6 w-6 text-muted-foreground" />
            </button>
            <button
              onClick={() => directSong ? projectorNextSlide() : isRemote ? lanSync.sendLanCommand('next') : nextSlide()}
              disabled={!directSong && !effectiveConnected}
              className="flex flex-col items-center gap-1 rounded-xl border border-success/40 bg-card p-3 hover:bg-success/10 touch-target disabled:opacity-30 disabled:border-border"
            >
              <ChevronRight className="h-6 w-6 text-success" />
            </button>
            <button
              onClick={() => isRemote ? lanSync.sendLanCommand('toggleBlank') : toggleDisplay()}
              disabled={!effectiveConnected}
              className={`flex flex-col items-center gap-1 rounded-xl border p-3 touch-target disabled:opacity-30 ${
                effectiveDisplayMode === 'show'
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-muted/40 bg-muted/10 text-muted-foreground'
              }`}
            >
              {effectiveDisplayMode === 'show' ? <Monitor className="h-6 w-6" /> : <MonitorOff className="h-6 w-6" />}
            </button>
            <button
              onClick={() => isRemote ? lanSync.sendLanCommand('refresh') : refreshData()}
              disabled={!effectiveConnected}
              className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-3 hover:bg-panel-hover touch-target disabled:opacity-30"
            >
              <RefreshCw className="h-6 w-6 text-foreground" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
