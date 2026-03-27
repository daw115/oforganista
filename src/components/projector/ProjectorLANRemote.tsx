import { useState, useCallback, useEffect, useRef } from 'react';
import { useProjectorLAN } from '@/hooks/useProjectorLAN';
import { useProjector } from '@/hooks/useProjector';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { SongLibrary } from './SongLibrary';
import {
  Globe, ListMusic, SkipForward, HelpCircle,
  ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, ChevronDown,
  Monitor, MonitorOff, RefreshCw, Database, Trash2, Search,
  CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react';
import type { Song } from '@/types/projector';

type LANHook = ReturnType<typeof useProjectorLAN>;
type ProjectorHook = ReturnType<typeof useProjector>;

export function ProjectorLANRemote({ lan, projector }: { lan: LANHook; projector: ProjectorHook }) {
  const { lanSync, remoteLanState, nextServiceItem, prevServiceItem } = lan;
  const [roomInput, setRoomInput] = useState(lanSync.roomId);

  const remote = remoteLanState;
  const connected = !!remote?.connected;
  const serviceItems = remote?.serviceItems ?? [];
  const slides = remote?.slides ?? [];
  const serviceIndex = remote?.currentServiceIndex ?? -1;
  const slideIndex = remote?.currentSlideIndex ?? -1;
  const displayMode = remote?.displayMode ?? 'show';
  const currentTitle = remote?.currentTitle ?? '';

  const {
    songs, filteredSongs, loading,
    searchQuery, setSearchQuery, searchByContent, setSearchByContent,
    forceReloadDatabase,
    directSong, directVerseIndex, clearDirectMode, showOnScreen,
    getCurrentText,
    nextSlide: projectorNextSlide, prevSlide: projectorPrevSlide,
  } = projector;

  const directText = directSong ? getCurrentText() : null;
  const directVerse = directSong?.verses[directVerseIndex];
  const directTotalVerses = directSong?.verses.length || 0;

  const [importMsg, setImportMsg] = useState('');
  const [libraryExpanded, setLibraryExpanded] = useState(false);
  const dbReloadedForBridge = useRef(false);

  // Auto-reload database when bridge connection is established
  useEffect(() => {
    if (connected && !dbReloadedForBridge.current) {
      dbReloadedForBridge.current = true;
      setImportMsg('Odświeżam bazę pieśni...');
      forceReloadDatabase('bundled')
        .then(count => {
          setImportMsg(`✅ Załadowano ${count} pieśni (wbudowana baza SQLite)`);
          setTimeout(() => setImportMsg(''), 3000);
        })
        .catch(() => {
          // Fallback to cloud JSON
          return forceReloadDatabase('json')
            .then(count => {
              setImportMsg(`✅ Załadowano ${count} pieśni (JSON zapasowy)`);
              setTimeout(() => setImportMsg(''), 3000);
            })
            .catch(() => setImportMsg('⚠️ Nie udało się odświeżyć bazy'));
        });
    }
    if (!connected) {
      dbReloadedForBridge.current = false;
    }
  }, [connected, forceReloadDatabase]);

  const handleLoadBundled = async () => {
    setImportMsg('Przeładowuję wbudowaną bazę SQLite...');
    try {
      const count = await forceReloadDatabase('bundled');
      setImportMsg(`✅ Załadowano ${count} pieśni z wbudowanej bazy SQLite`);
    } catch { setImportMsg('Błąd ładowania wbudowanej bazy'); }
  };

  const handleAddToPlaylist = async (song: Song) => {
    if (!connected) {
      setImportMsg('Najpierw dołącz do pokoju z aktywnym mostem');
      return;
    }

    try {
      setImportMsg(`Wysyłam „${song.title}" do mostu...`);
      await lanSync.sendLanCommand('addSong', undefined, song.title);
      await lanSync.sendLanCommand('refresh');
      setImportMsg(`Wysłano „${song.title}" do dodania`);
    } catch {
      setImportMsg(`Błąd wysyłania „${song.title}" do mostu`);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 h-full">
        {/* LEFT: Tabs + Song Library */}
        <div className="md:col-span-1 flex flex-col min-h-0 gap-3">
          <Tabs defaultValue="connect" className="flex flex-col min-h-0 transition-all duration-300" style={{ flex: libraryExpanded ? '0 0 auto' : '1 1 auto' }}>
            <TabsList className="w-full shrink-0" onClick={() => {
              if (libraryExpanded) setLibraryExpanded(false);
            }}>
              <TabsTrigger value="connect" className="flex-1 gap-1.5 text-xs">
                <Globe className="w-3.5 h-3.5" />
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
              <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${connected ? 'bg-success' : lanSync.cloudConnected ? 'bg-amber' : 'bg-destructive'}`} />
                  <span className="text-sm font-medium text-foreground">
                    {connected ? `Połączono z mostem (pokój ${lanSync.roomId})` : lanSync.cloudConnected ? `Oczekiwanie na most... (pokój ${lanSync.roomId})` : 'Rozłączono'}
                  </span>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Kod pokoju</label>
                    <div className="flex gap-2">
                      <input
                        value={roomInput}
                        onChange={e => setRoomInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                        placeholder="np. 1234"
                        maxLength={4}
                        className="w-28 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground font-mono text-center tracking-widest"
                      />
                      <Button size="sm" disabled={roomInput.length !== 4} onClick={() => lanSync.changeRoom(roomInput)}>
                        Dołącz
                      </Button>
                    </div>
                  </div>
                </div>
                {connected && (
                  <div className="text-xs text-success flex items-center gap-1.5 border-t border-border pt-3">
                    <span className="w-2 h-2 rounded-full bg-success" />
                    Most aktywny — sterowanie OpenLP działa
                  </div>
                )}
                {lanSync.cloudConnected && !connected && (
                  <div className="rounded-lg border border-amber/30 bg-amber/5 p-3 text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">Most nieaktywny</p>
                    <p>Upewnij się, że na komputerze z OpenLP:</p>
                    <p>1. Moduł <strong className="text-foreground">Rzutnik LAN Serwer</strong> jest włączony</p>
                    <p>2. OpenLP jest połączony</p>
                    <p>3. <strong className="text-foreground">Tryb mostu</strong> jest włączony</p>
                    <p>4. Numer pokoju to <span className="font-mono text-primary">{lanSync.roomId}</span></p>
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
                    Lista ({serviceItems.length})
                    <Globe className="w-3 h-3 text-muted-foreground ml-1" />
                  </h3>
                </div>
                <div className="flex-1 overflow-auto px-2 pb-2 pt-1">
                  {serviceItems.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      {connected ? 'Brak elementów nabożeństwa' : 'Dołącz do pokoju z aktywnym mostem'}
                    </p>
                  )}
                  {serviceItems.map((item, i) => (
                    <div
                      key={item.id}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors touch-target ${
                        i === serviceIndex
                          ? 'bg-primary/10 text-primary border border-primary/30'
                          : 'hover:bg-panel-hover'
                      }`}
                    >
                      <button
                        onClick={() => lanSync.sendLanCommand('goToItem', i)}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left"
                      >
                        <span className="font-mono text-xs text-muted-foreground w-5">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.plugin}</p>
                        </div>
                        {item.selected && <span className="text-xs text-success font-medium">▶</span>}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          lanSync.sendLanCommand('removeItem', i);
                        }}
                        disabled={!connected}
                        className="p-1.5 rounded-md hover:bg-destructive/10 transition-all text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-40"
                        title="Usuń z listy"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
                    Slajdy ({slides.length})
                    <Globe className="w-3 h-3 text-muted-foreground ml-1" />
                  </h3>
                </div>
                <div className="flex-1 overflow-auto px-2 pb-2 pt-1">
                  {slides.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      {connected ? 'Brak slajdów — wybierz element nabożeństwa' : 'Dołącz do pokoju z aktywnym mostem'}
                    </p>
                  )}
                  {slides.map((slide, i) => (
                    <button
                      key={i}
                      onClick={() => lanSync.sendLanCommand('goToSlide', i)}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors touch-target ${
                        i === slideIndex
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
                  <h4 className="font-semibold text-foreground mb-1">Jak to działa?</h4>
                  <div className="space-y-1 text-xs">
                    <p>Ten moduł pozwala sterować OpenLP zdalnie przez internet, bez bezpośredniego dostępu do sieci LAN.</p>
                    <p>Wymaga <strong className="text-foreground">mostu</strong> — komputera z OpenLP, na którym działa moduł <strong className="text-foreground">Rzutnik LAN Serwer</strong> z włączonym trybem mostu.</p>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground mb-1">Konfiguracja</h4>
                  <div className="space-y-1 text-xs">
                    <p><strong className="text-foreground">Na komputerze z OpenLP:</strong></p>
                    <p className="ml-3">1. Włącz moduł <kbd className="px-1 py-0.5 rounded bg-muted">Rzutnik LAN Serwer</kbd> w Ustawieniach</p>
                    <p className="ml-3">2. Połącz się z OpenLP (zakładka Połączenie)</p>
                    <p className="ml-3">3. Włącz <kbd className="px-1 py-0.5 rounded bg-muted">Tryb mostu</kbd></p>
                    <p className="ml-3">4. Zanotuj 4-cyfrowy kod pokoju</p>
                  </div>
                  <div className="space-y-1 text-xs mt-2">
                    <p><strong className="text-foreground">Na tym urządzeniu:</strong></p>
                    <p className="ml-3">1. Wpisz kod pokoju w zakładce Połączenie</p>
                    <p className="ml-3">2. Kliknij „Dołącz"</p>
                    <p className="ml-3">3. Poczekaj na połączenie z mostem (zielona kropka)</p>
                  </div>
                </div>
                <div className="border-t border-border pt-2">
                  <h4 className="font-semibold text-foreground mb-1">Częste problemy</h4>
                  <div className="space-y-0.5 text-xs">
                    <p>⚠️ <strong>Most nieaktywny</strong> — sprawdź czy na serwerze włączony jest tryb mostu i czy pokoje się zgadzają</p>
                    <p>⚠️ <strong>Brak połączenia</strong> — oba urządzenia muszą mieć dostęp do internetu</p>
                    <p>⚠️ <strong>Opóźnienie</strong> — sterowanie zdalne ma ok. 0.5-1s opóźnienia</p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Song Library — with auto-reload status */}
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

              {/* DB Status */}
              <div className="mt-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-[11px]">
                <div className="flex items-center gap-1.5">
                  {loading ? (
                    <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
                  ) : songs.length > 0 ? (
                    <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
                  ) : (
                    <AlertCircle className="w-3 h-3 text-warning shrink-0" />
                  )}
                  <span className="text-foreground font-medium">
                    {loading ? 'Ładowanie bazy...' : songs.length > 0 ? `${songs.length} pieśni` : 'Brak bazy'}
                  </span>
                  <span className="text-muted-foreground text-[10px]">
                    {connected ? '(odświeżona)' : ''}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-5 px-1.5 text-[10px] gap-1"
                    disabled={loading}
                    onClick={async () => {
                      setImportMsg('Odświeżam bazę pieśni...');
                      try {
                        const count = await forceReloadDatabase('bundled');
                        setImportMsg(`✅ Załadowano ${count} pieśni (wbudowana SQLite)`);
                      } catch {
                        try {
                          const count = await forceReloadDatabase('json');
                          setImportMsg(`✅ Załadowano ${count} pieśni (JSON zapasowy)`);
                        } catch {
                          setImportMsg('⚠️ Nie udało się odświeżyć bazy');
                        }
                      }
                      setTimeout(() => setImportMsg(''), 3000);
                    }}
                  >
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                    Odśwież
                  </Button>
                </div>
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
                  : displayMode === 'show' && connected ? 'bg-success animate-pulse' : 'bg-warning'
              }`} />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {directSong ? '⚡ EKRAN'
                  : connected
                    ? displayMode === 'show' ? 'NA ŻYWO' : 'WYGASZONO'
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
              ) : currentTitle && (
                <span className="text-sm text-foreground font-medium truncate min-w-0">
                  {currentTitle}
                  <span className="text-muted-foreground ml-1 text-xs">
                    {slideIndex + 1}/{slides.length}
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
              : displayMode === 'show' && connected ? 'border-success/30 bg-black' : 'border-muted-foreground/20 bg-black'
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
            ) : !connected ? (
              <div className="text-center">
                <MonitorOff className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground/40">Dołącz do pokoju, aby zobaczyć podgląd</p>
              </div>
            ) : displayMode === 'blank' ? (
              <div className="text-center">
                <MonitorOff className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground/40">Ekran wygaszony</p>
              </div>
            ) : (() => {
              const slide = slides[slideIndex];
              const text = slide?.text ?? '';
              return text ? (
                <p className="text-white text-center text-lg leading-relaxed whitespace-pre-line max-w-2xl">{text}</p>
              ) : (
                <p className="text-muted-foreground text-sm">Brak tekstu na slajdzie</p>
              );
            })()}
            {!directSong && connected && slides[slideIndex]?.tag && (
              <span className="absolute bottom-2 right-3 text-xs text-muted-foreground font-mono">
                {slides[slideIndex].tag}
              </span>
            )}
          </div>

          {/* Controls */}
          <div className="grid grid-cols-6 gap-2 mt-2">
            <button
              onClick={() => directSong ? projectorPrevSlide() : lanSync.sendLanCommand('prev')}
              disabled={!directSong && !connected}
              className="flex flex-col items-center gap-1 rounded-xl border border-destructive/40 bg-card p-3 hover:bg-destructive/10 touch-target disabled:opacity-30 disabled:border-border"
            >
              <ChevronLeft className="h-6 w-6 text-destructive" />
            </button>
            <button
              onClick={() => {
                if (directSong) return;
                prevServiceItem();
              }}
              disabled={!!directSong || !connected || serviceItems.length === 0}
              className="flex flex-col items-center gap-1 rounded-xl border border-muted-foreground/30 bg-card p-3 hover:bg-muted/30 touch-target disabled:opacity-30 disabled:border-border"
            >
              <ChevronsLeft className="h-6 w-6 text-muted-foreground" />
            </button>
            <button
              onClick={() => {
                if (directSong) return;
                nextServiceItem();
              }}
              disabled={!!directSong || !connected || serviceItems.length === 0}
              className="flex flex-col items-center gap-1 rounded-xl border border-muted-foreground/30 bg-card p-3 hover:bg-muted/30 touch-target disabled:opacity-30 disabled:border-border"
            >
              <ChevronsRight className="h-6 w-6 text-muted-foreground" />
            </button>
            <button
              onClick={() => directSong ? projectorNextSlide() : lanSync.sendLanCommand('next')}
              disabled={!directSong && !connected}
              className="flex flex-col items-center gap-1 rounded-xl border border-success/40 bg-card p-3 hover:bg-success/10 touch-target disabled:opacity-30 disabled:border-border"
            >
              <ChevronRight className="h-6 w-6 text-success" />
            </button>
            <button
              onClick={() => lanSync.sendLanCommand('toggleBlank')}
              disabled={!connected}
              className={`flex flex-col items-center gap-1 rounded-xl border p-3 touch-target disabled:opacity-30 ${
                displayMode === 'show'
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-muted/40 bg-muted/10 text-muted-foreground'
              }`}
            >
              {displayMode === 'show' ? <Monitor className="h-6 w-6" /> : <MonitorOff className="h-6 w-6" />}
            </button>
            <button
              onClick={() => lanSync.sendLanCommand('refresh')}
              disabled={!connected}
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
