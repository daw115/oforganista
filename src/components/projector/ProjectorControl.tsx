import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { getSongSlides } from '@/lib/projectorLayout';
import { useProjector } from '@/hooks/useProjector';
import { SongLibrary } from './SongLibrary';
import { PlaylistPanel } from './PlaylistPanel';
import { SongbookPanel } from './SongbookPanel';
import { ConnectionPanel } from './ConnectionPanel';
import { ProjectorSettingsPanel } from './ProjectorSettingsPanel';
import { SuggestedSongs, type SuggestedSongsTarget } from './SuggestedSongs';
import { SongEditDialog } from './SongEditDialog';
import { ProjectorSongbookOverlay } from './ProjectorSongbookOverlay';
import { ScreenPickerDialog } from './ScreenPickerDialog';
import { useIsMobile } from '@/hooks/use-mobile';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ListMusic, HelpCircle, SkipForward, BookOpen, FileText,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Monitor, MonitorOff, ExternalLink, Globe, Database, X,
  Play, Square, ChevronUp, ChevronDown, Sparkles, Pencil,
  MessageSquare, Send, Plus, PanelLeftClose, PanelLeftOpen, Eye, EyeOff,
} from 'lucide-react';
import type { Song } from '@/types/projector';

type ProjectorHook = ReturnType<typeof useProjector>;

/** Renders text at 1280×768 native resolution, then CSS-scales to fit the container */
function PreviewMiniScreen({ text, isLive, hasContent, verseLabel }: { text: string; isLive: boolean; hasContent: boolean; verseLabel?: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const nativeRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);

  const NATIVE_W = 1280;
  const NATIVE_H = 768;

  const fitText = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.fontSize = '66px';
  }, []);

  const scaleToFit = useCallback(() => {
    const wrapper = wrapperRef.current;
    const native = nativeRef.current;
    if (!wrapper || !native) return;
    const wW = wrapper.clientWidth - 16;
    const wH = wrapper.clientHeight - 16;
    if (wW <= 0 || wH <= 0) return;
    const scale = Math.min(wW / NATIVE_W, wH / NATIVE_H);
    native.style.transform = `scale(${scale})`;
    native.style.transformOrigin = 'top left';
    native.style.width = `${NATIVE_W}px`;
    native.style.height = `${NATIVE_H}px`;
    const scaledW = NATIVE_W * scale;
    const scaledH = NATIVE_H * scale;
    const borderEl = native.parentElement;
    if (borderEl && borderEl !== wrapper) {
      borderEl.style.width = `${scaledW}px`;
      borderEl.style.height = `${scaledH}px`;
      borderEl.style.left = `${(wrapper.clientWidth - scaledW) / 2}px`;
      borderEl.style.top = `${(wrapper.clientHeight - scaledH) / 2}px`;
    }
    native.style.marginLeft = '0';
    native.style.marginTop = '0';
  }, []);

  useEffect(() => {
    fitText();
    scaleToFit();
  }, [text, isLive, fitText, scaleToFit]);

  useEffect(() => {
    const ro = new ResizeObserver(() => { scaleToFit(); fitText(); });
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, [scaleToFit, fitText]);

  return (
    <div ref={wrapperRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#111' }}>
      <div style={{ position: 'absolute', border: '1px solid hsl(217 91% 60% / 0.25)', borderRadius: 4, overflow: 'hidden' }}>
      <div ref={nativeRef} style={{ background: '#000', position: 'relative' }}>
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '23px 64px' }}>
          {!isLive ? (
            <div style={{ textAlign: 'center' }}>
              <MonitorOff style={{ width: 64, height: 64, margin: '0 auto 16px', color: '#555' }} />
              <p style={{ fontSize: 24, color: '#555' }}>Ekran wygaszony</p>
            </div>
          ) : text ? (
            <p ref={textRef} style={{
              color: '#FFFFFF',
              fontFamily: 'Arial, "Helvetica Neue", sans-serif',
              fontWeight: 700,
              textAlign: 'center',
              lineHeight: 1.26,
              whiteSpace: 'pre-line',
              textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 16px rgba(0,0,0,0.5), 2px 2px 0 rgba(0,0,0,0.55), -2px -2px 0 rgba(0,0,0,0.55), 2px -2px 0 rgba(0,0,0,0.55), -2px 2px 0 rgba(0,0,0,0.55)',
              WebkitTextStroke: '2px rgba(0,0,0,0.55)',
              letterSpacing: '0.005em',
              maxWidth: '90%',
            }}>
              {text}
            </p>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <Monitor style={{ width: 64, height: 64, margin: '0 auto 16px', color: '#333' }} />
              <p style={{ fontSize: 24, color: '#333' }}>{hasContent ? 'Wybierz pieśń' : 'Dodaj pieśni'}</p>
            </div>
          )}
        </div>
        {verseLabel && (
          <span style={{ position: 'absolute', bottom: 8, right: 12, fontSize: 16, color: '#555', fontFamily: 'monospace' }}>{verseLabel}</span>
        )}
      </div>
      </div>
    </div>
  );
}

export function ProjectorControl({ projector }: { projector: ProjectorHook }) {
  const {
    songs, filteredSongs, state, loading,
    searchQuery, setSearchQuery, searchByContent, setSearchByContent,
    currentSong, getCurrentText,
    loadBundledDatabase, addToPlaylist, addPsalmToPlaylist, removeFromPlaylist, clearPlaylist,
    moveInPlaylist, goToItem, nextSlide, prevSlide,
    toggleLive, openProjectorWindow, showOnScreen, showCustomText, addCustomTextToPlaylist,
    directSong, directVerseIndex, clearDirectMode,
    projectorSync, deleteSong, updateSong,
  } = projector;

  const isMobile = useIsMobile();
  const [importMsg, setImportMsg] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showPilot, setShowPilot] = useState(true);
  // 'collapsed' → 'half' → 'full' → 'collapsed' cycle
  const [previewMode, setPreviewMode] = useState<'collapsed' | 'half' | 'full'>('collapsed');
  const [screenPickerOpen, setScreenPickerOpen] = useState(false);
  const [previewPrompt, setPreviewPrompt] = useState<'ask' | null>(null);
  const [previewPromptDismissedToday, setPreviewPromptDismissedToday] = useState(() => {
    const stored = localStorage.getItem('organista_preview_dismissed');
    if (stored) {
      const today = new Date().toDateString();
      return stored === today;
    }
    return false;
  });
  const [songbookUrl, setSongbookUrl] = useState<string | null>(null);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [customTextInput, setCustomTextInput] = useState('');
  const [customTextTitle, setCustomTextTitle] = useState('');
  const slidesScrollRef = useRef<HTMLDivElement>(null);
  const activeSlideRef = useRef<HTMLDivElement>(null);

  // Proactively request Window Management permission on first mount
  useEffect(() => {
    if (!(window as any).getScreenDetails) return;
    // Check if permission already granted via Permissions API
    navigator.permissions?.query?.({ name: 'window-management' as any })
      .then(status => {
        if (status.state === 'granted') return; // already have it
        // Will prompt on first user-initiated projector open (via ScreenPickerDialog)
        console.log('[Projector] Window Management permission:', status.state);
      })
      .catch(() => {}); // Permissions API not supported for this
  }, []);

  const currentText = getCurrentText();
  const displaySong = directSong || currentSong;
  const displayVerseIndex = directSong ? directVerseIndex : state.currentVerseIndex;
  const allSlides = displaySong ? getSongSlides(displaySong) : [];
  const currentSlideInfo = allSlides[displayVerseIndex];
  const currentVerse = currentSlideInfo?.verse;
  const totalVerses = allSlides.length;
  const hasContent = directSong ? true : state.playlist.length > 0;
  const playlistSongIds = useMemo(() => new Set(state.playlist.map(p => p.songId)), [state.playlist]);
  const playlistTitles = useMemo(() => new Set(state.playlist.map(p => p.title)), [state.playlist]);

  const suggestedTargets = useMemo<SuggestedSongsTarget[]>(() => [{
    key: 'projector',
    label: 'Rzutnik',
    icon: <Monitor className="w-3 h-3 text-primary" />,
    enabled: true,
    onAdd: (song, title) => {
      if (song) {
        addToPlaylist(song);
      } else {
        addPsalmToPlaylist(title);
      }
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

  // Wrap toggleLive: going live → expand to full, stopping → half
  const handleToggleLive = useCallback(() => {
    if (!state.isLive) {
      // Turning ON
      setPreviewMode('full');
    } else {
      // Turning OFF
      setPreviewMode('half');
    }
    toggleLive();
  }, [state.isLive, toggleLive]);

  const handlePreviewPromptAnswer = useCallback((answer: 'yes' | 'no' | 'dismiss') => {
    if (answer === 'yes') {
      setPreviewMode('full');
    } else if (answer === 'dismiss') {
      setPreviewPromptDismissedToday(true);
      localStorage.setItem('organista_preview_dismissed', new Date().toDateString());
    }
    setPreviewPrompt(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextSlide();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        prevSlide();
      } else if (e.key === '.') {
        e.preventDefault();
        handleToggleLive();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (!directSong && state.currentItemIndex < state.playlist.length - 1) {
          goToItem(state.currentItemIndex + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (!directSong && state.currentItemIndex > 0) {
          goToItem(state.currentItemIndex - 1);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [nextSlide, prevSlide, handleToggleLive, goToItem, directSong, state.currentItemIndex, state.playlist.length]);

  useEffect(() => {
    activeSlideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [displayVerseIndex, displaySong?.id]);

  const handleLoadBundled = async () => {
    setImportMsg('');
    try {
      const count = await loadBundledDatabase();
      setImportMsg(`Załadowano ${count} pieśni z wbudowanej bazy`);
    } catch { setImportMsg('Błąd ładowania wbudowanej bazy'); }
  };

  const goPrevSong = () => {
    if (state.currentItemIndex > 0) goToItem(state.currentItemIndex - 1);
  };
  const goNextSong = () => {
    if (state.currentItemIndex < state.playlist.length - 1) goToItem(state.currentItemIndex + 1);
  };

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

  const CustomTextPanel = (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs text-muted-foreground">Wpisz tekst do wyświetlenia na ekranie projektora:</p>
      <input
        className="w-full py-2 px-3 rounded-xl border border-input bg-muted text-foreground text-sm outline-none focus:ring-1 focus:ring-ring"
        placeholder="Tytuł (opcjonalnie)"
        value={customTextTitle}
        onChange={e => setCustomTextTitle(e.target.value)}
      />
      <textarea
        className="w-full min-h-[100px] py-2.5 px-3 rounded-xl border border-input bg-muted text-foreground text-sm outline-none focus:ring-1 focus:ring-ring resize-y"
        placeholder="Wpisz komunikat..."
        value={customTextInput}
        onChange={e => setCustomTextInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleSendCustomText(); }}
      />
      <div className="flex gap-2">
        <button
          onClick={handleAddCustomTextToPlaylist}
          disabled={!customTextInput.trim()}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-primary text-primary font-medium hover:bg-primary/10 transition-colors disabled:opacity-40"
        >
          <Plus className="w-4 h-4" />
          Dodaj do planu
        </button>
        <button
          onClick={handleSendCustomText}
          disabled={!customTextInput.trim()}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
          Na ekran
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">Ctrl+Enter aby wyświetlić od razu</p>
    </div>
  );

  if (isMobile) {
    return (
      <div className="animate-fade-in space-y-3">
        {/* Songbook overlay — fullscreen with pilot */}
        {songbookUrl && (
          <ProjectorSongbookOverlay
            url={songbookUrl}
            onClose={() => setSongbookUrl(null)}
            pilot={{
              onPrevSlide: prevSlide,
              onNextSlide: nextSlide,
              onPrevSong: goPrevSong,
              onNextSong: goNextSong,
              onToggleLive: handleToggleLive,
              isLive: state.isLive,
              slideInfo: displaySong ? `${displayVerseIndex + 1}/${totalVerses}` : undefined,
            }}
          />
        )}

        {/* Mobile pilot bar — compact horizontal controls */}
        <div className="glass-card p-3">
          {/* Current song info */}
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${state.isLive ? 'bg-success animate-pulse' : 'bg-warning'}`} />
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {state.isLive ? 'Live' : 'Stop'}
            </span>
            {displaySong && (
              <span className="text-sm font-medium text-foreground truncate flex-1">
                {displaySong.title}
                <span className="text-muted-foreground ml-1 text-xs">{displayVerseIndex + 1}/{totalVerses}</span>
              </span>
            )}
            {directSong && (
              <button onClick={clearDirectMode} className="text-xs text-muted-foreground px-2 py-0.5 rounded border border-border">✕</button>
            )}
          </div>

          {/* Control buttons — 2 rows */}
          <div className="grid grid-cols-5 gap-1.5">
            <button
              onClick={nextSlide}
              disabled={!hasContent && !directSong}
              className="flex flex-col items-center justify-center p-2 rounded-lg bg-success/10 border border-success/30 text-success hover:bg-success/20 disabled:opacity-30 min-h-[52px]"
            >
              <ChevronDown className="w-5 h-5" />
              <span className="text-[9px] font-bold mt-0.5">Slajd ▼</span>
            </button>
            <button
              onClick={prevSlide}
              disabled={!hasContent && !directSong}
              className="flex flex-col items-center justify-center p-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20 disabled:opacity-30 min-h-[52px]"
            >
              <ChevronUp className="w-5 h-5" />
              <span className="text-[9px] font-bold mt-0.5">Slajd ▲</span>
            </button>
            <button
              onClick={goNextSong}
              disabled={!!directSong || state.playlist.length === 0 || state.currentItemIndex >= state.playlist.length - 1}
              className="flex flex-col items-center justify-center p-2 rounded-lg bg-muted/50 border border-border text-muted-foreground hover:bg-muted disabled:opacity-30 min-h-[52px]"
            >
              <ChevronsRight className="w-5 h-5" />
              <span className="text-[9px] font-bold mt-0.5">Pieśń ▶</span>
            </button>
            <button
              onClick={goPrevSong}
              disabled={!!directSong || state.playlist.length === 0 || state.currentItemIndex <= 0}
              className="flex flex-col items-center justify-center p-2 rounded-lg bg-muted/50 border border-border text-muted-foreground hover:bg-muted disabled:opacity-30 min-h-[52px]"
            >
              <ChevronsLeft className="w-5 h-5" />
              <span className="text-[9px] font-bold mt-0.5">Pieśń ◀</span>
            </button>
            <button
              onClick={handleToggleLive}
              className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors min-h-[52px] ${
                state.isLive ? 'bg-primary/15 text-primary border border-primary/30' : 'bg-muted/50 text-muted-foreground border border-border'
              }`}
            >
              {state.isLive ? <Monitor className="w-5 h-5" /> : <MonitorOff className="w-5 h-5" />}
              <span className="text-[9px] font-bold mt-0.5">{state.isLive ? 'Live' : 'Stop'}</span>
            </button>
          </div>

          {/* Podgląd button */}
          <div className="flex gap-1.5 mt-1.5">
            <button
              onClick={() => setShowPreview(v => !v)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium transition-colors ${
                showPreview ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-muted/30 text-foreground hover:bg-muted'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" /> {showPreview ? 'Ukryj podgląd' : 'Podgląd'}
            </button>
          </div>
        </div>

        {/* Preview — collapsible */}
        {showPreview && (
          <div className="glass-card overflow-hidden animate-fade-in" style={{ aspectRatio: '16/9' }}>
            <div className="relative w-full h-full">
              <PreviewMiniScreen
                text={state.isLive ? currentText : ''}
                isLive={state.isLive}
                hasContent={state.playlist.length > 0}
                verseLabel={state.isLive && currentVerse ? currentVerse.label : undefined}
              />
            </div>
          </div>
        )}

        {/* Tabs: Plan / Slajdy / Propozycje */}
        <Tabs defaultValue="songbook" className="flex flex-col min-h-0">
          <TabsList className="w-full shrink-0">
            <TabsTrigger value="songbook" className="flex-1 gap-1 text-xs">
              <BookOpen className="w-3.5 h-3.5" />
              Plan
            </TabsTrigger>
            <TabsTrigger value="slides" className="flex-1 gap-1 text-xs">
              <SkipForward className="w-3.5 h-3.5" />
              Slajdy
            </TabsTrigger>
            <TabsTrigger value="suggestions" className="flex-1 gap-1 text-xs">
              <Sparkles className="w-3.5 h-3.5" />
              Propozycje
            </TabsTrigger>
            <TabsTrigger value="library" className="flex-1 gap-1 text-xs">
              <Database className="w-3.5 h-3.5" />
              Baza
            </TabsTrigger>
            <TabsTrigger value="message" className="flex-1 gap-1 text-xs">
              <MessageSquare className="w-3.5 h-3.5" />
              Komunikat
            </TabsTrigger>
            <TabsTrigger value="connect" className="w-10 px-0" title="Połączenie">
              <Globe className="w-3.5 h-3.5" />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="songbook" className="mt-2">
            <div className="h-[50vh]">
              <SongbookPanel
                playlist={state.playlist}
                songs={songs}
                currentItemIndex={state.currentItemIndex}
                currentVerseIndex={state.currentVerseIndex}
                onOpenSongbook={(url) => setSongbookUrl(url)}
                onGoToItem={goToItem}
                onRemove={removeFromPlaylist}
                onMove={moveInPlaylist}
                onClear={clearPlaylist}
                onNextSlide={nextSlide}
                onPrevSlide={prevSlide}
                onNextSong={() => { if (state.currentItemIndex < state.playlist.length - 1) goToItem(state.currentItemIndex + 1); }}
                onPrevSong={() => { if (state.currentItemIndex > 0) goToItem(state.currentItemIndex - 1); }}
                onToggleLive={handleToggleLive}
                isLive={state.isLive}
                currentSongTitle={displaySong?.title}
                slideInfo={totalVerses > 0 ? `${displayVerseIndex + 1}/${totalVerses}` : ''}
                onEditSong={setEditingSong}
              />
            </div>
          </TabsContent>

          <TabsContent value="library" className="mt-2">
            <div className="h-[50vh]">
              <SongLibrary
                songs={songs}
                filteredSongs={filteredSongs}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onLoadBundled={handleLoadBundled}
                onAddToPlaylist={addToPlaylist}
                onShowOnScreen={showOnScreen}
                onDeleteSong={deleteSong}
                onSearchFocus={() => {}}
                loading={loading}
                importMsg={importMsg}
                searchByContent={searchByContent}
                onSearchByContentChange={setSearchByContent}
                playlistSongIds={playlistSongIds}
                onEditSong={setEditingSong}
              />
            </div>
          </TabsContent>

          <TabsContent value="slides" className="mt-2">
            <div className="glass-card p-3 h-[50vh] flex flex-col overflow-hidden">
              {displaySong ? (
                <>
                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border shrink-0">
                    <span className="text-sm font-bold text-foreground truncate">{displaySong.title}</span>
                    <button onClick={() => setEditingSong(displaySong)} className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0" title="Edytuj pieśń">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">{displayVerseIndex + 1}/{totalVerses}</span>
                  </div>
                  <div className="flex-1 overflow-auto space-y-1.5" ref={slidesScrollRef}>
                    {allSlides.map((slideInfo, i) => (
                      <div
                        key={i}
                        ref={i === displayVerseIndex ? activeSlideRef : undefined}
                        className={`rounded-lg p-2.5 text-sm cursor-pointer transition-colors ${
                          i === displayVerseIndex
                            ? 'bg-primary/10 border border-primary/30 text-foreground font-medium'
                            : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                        }`}
                        onClick={() => {
                          if (directSong) projector.goToDirectVerse(i);
                          else goToItem(state.currentItemIndex, i);
                        }}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">
                          Slajd {i + 1}
                        </span>
                        <p className="whitespace-pre-line text-xs leading-relaxed">{slideInfo.slide.text}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center">
                  <div>
                    <SkipForward className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Wybierz pieśń</p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="suggestions" className="mt-2">
            <div className="h-[50vh]">
              <SuggestedSongs songs={songs} date={new Date()} targets={suggestedTargets} onOpenSongbook={(url) => setSongbookUrl(url)} onAddCustomTextToPlaylist={addCustomTextToPlaylist} onNextSlide={nextSlide} onPrevSlide={prevSlide} onNextSong={goNextSong} onPrevSong={goPrevSong} onToggleLive={handleToggleLive} isLive={state.isLive} slideInfo={displaySong ? `${displayVerseIndex + 1}/${totalVerses}` : undefined} />
            </div>
          </TabsContent>

          <TabsContent value="message" className="mt-2">
            <div className="glass-card h-[50vh] overflow-auto">
              {CustomTextPanel}
            </div>
          </TabsContent>

          <TabsContent value="connect" className="mt-2 space-y-3">
            <ConnectionPanel
              isLive={state.isLive}
              projectorSync={projectorSync}
              onOpenProjector={() => setScreenPickerOpen(true)}
            />
            <ProjectorSettingsPanel />
          </TabsContent>
        </Tabs>

        <SongEditDialog
          song={editingSong}
          open={!!editingSong}
          onOpenChange={(open) => { if (!open) setEditingSong(null); }}
          onSave={(song) => { updateSong(song); setEditingSong(null); }}
        />
      </div>
    );
  }

  // === DESKTOP LAYOUT (unchanged) ===
  return (
    <div className="animate-fade-in h-full">
      {songbookUrl && (
        <ProjectorSongbookOverlay
          url={songbookUrl}
          onClose={() => setSongbookUrl(null)}
          pilot={{
            onPrevSlide: prevSlide,
            onNextSlide: nextSlide,
            onPrevSong: goPrevSong,
            onNextSong: goNextSong,
            onToggleLive: handleToggleLive,
            isLive: state.isLive,
            slideInfo: displaySong ? `${displayVerseIndex + 1}/${totalVerses}` : undefined,
          }}
        />
      )}

      <div className="grid grid-cols-3 lg:grid-cols-4 gap-3 h-full">
        {/* COL 1 — PILOT */}
        {showPilot && (
        <div className="col-span-1 flex flex-col min-h-0 rounded-xl border border-border bg-card p-2">
          <div className="flex items-center gap-2 px-1 pb-2 border-b border-border mb-2">
            <div className={`w-3 h-3 rounded-full shrink-0 ${state.isLive ? 'bg-success animate-pulse' : 'bg-warning'}`} />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pilot</span>
            {displaySong && (
              <span className="text-[10px] text-foreground font-medium truncate ml-auto">
                {displaySong.title} <span className="text-muted-foreground">{displayVerseIndex + 1}/{totalVerses}</span>
              </span>
            )}
            <button onClick={() => setShowPilot(false)} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors ml-1" title="Zwiń pilot">
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 flex flex-col gap-2 min-h-0">
            <button onClick={() => setScreenPickerOpen(true)} disabled={!projectorSync.isRoomOwner} className="flex-1 flex flex-col items-center justify-center rounded-xl border-2 border-border bg-card hover:bg-muted active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed min-h-0" title={!projectorSync.isRoomOwner ? 'Projekcja dostępna tylko w aplikacji, gdzie pokój został utworzony' : undefined}>
              <ExternalLink className="h-10 w-10 text-foreground" />
              <span className="text-xs font-bold text-muted-foreground mt-1">Projekcja</span>
            </button>
            <button onClick={handleToggleLive} className={`flex-1 flex flex-col items-center justify-center rounded-xl border-2 active:scale-95 transition-all min-h-0 ${state.isLive ? 'border-primary/40 bg-primary/10 text-primary' : 'border-muted/40 bg-muted/10 text-muted-foreground'}`}>
              {state.isLive ? <Monitor className="h-10 w-10" /> : <MonitorOff className="h-10 w-10" />}
              <span className="text-xs font-bold mt-1">{state.isLive ? 'Włączony' : 'Wyłączony'}</span>
            </button>
            <button onClick={goPrevSong} disabled={!!directSong || state.playlist.length === 0 || state.currentItemIndex <= 0} className="flex-1 flex flex-col items-center justify-center rounded-xl border-2 border-muted-foreground/30 bg-card hover:bg-muted/30 active:scale-95 transition-all disabled:opacity-30 disabled:border-border min-h-0">
              <ChevronsLeft className="h-10 w-10 text-muted-foreground" />
              <span className="text-xs font-bold text-muted-foreground mt-1">Poprzednia pieśń</span>
            </button>
            <button onClick={goNextSong} disabled={!!directSong || state.playlist.length === 0 || state.currentItemIndex >= state.playlist.length - 1} className="flex-1 flex flex-col items-center justify-center rounded-xl border-2 border-muted-foreground/30 bg-card hover:bg-muted/30 active:scale-95 transition-all disabled:opacity-30 disabled:border-border min-h-0">
              <ChevronsRight className="h-10 w-10 text-muted-foreground" />
              <span className="text-xs font-bold text-muted-foreground mt-1">Następna pieśń</span>
            </button>
            <button onClick={prevSlide} disabled={!hasContent && !directSong} className="flex-1 flex flex-col items-center justify-center rounded-xl border-2 border-destructive/40 bg-card hover:bg-destructive/10 active:scale-95 transition-all disabled:opacity-30 disabled:border-border min-h-0">
              <ChevronLeft className="h-10 w-10 text-destructive" />
              <span className="text-xs font-bold text-destructive mt-1">Poprzedni slajd</span>
            </button>
            <button onClick={nextSlide} disabled={!hasContent && !directSong} className="flex-1 flex flex-col items-center justify-center rounded-xl border-2 border-success/40 bg-card hover:bg-success/10 active:scale-95 transition-all disabled:opacity-30 disabled:border-border min-h-0">
              <ChevronRight className="h-10 w-10 text-success" />
              <span className="text-xs font-bold text-success mt-1">Następny slajd</span>
            </button>
          </div>
        </div>
        )}

        {/* COL 2 — Tabs: Slajdy / Pomoc */}
        <div className={cn("flex flex-col min-h-0", !showPilot && "lg:flex")}>
          {!showPilot && (
            <button onClick={() => setShowPilot(true)} className="mb-2 flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors self-start" title="Rozwiń pilot">
              <PanelLeftOpen className="w-3.5 h-3.5" />
              Pilot
            </button>
          )}
          <Tabs defaultValue="songbook" className="flex flex-col flex-1 min-h-0">
            <TabsList className="w-full shrink-0">
              <TabsTrigger value="songbook" className="flex-1 gap-1.5 text-xs">
                <BookOpen className="w-3.5 h-3.5" />
                Plan
              </TabsTrigger>
              <TabsTrigger value="message" className="flex-1 gap-1.5 text-xs">
                <MessageSquare className="w-3.5 h-3.5" />
                Komunikat
              </TabsTrigger>
              <TabsTrigger value="help" className="w-10 px-0" title="Instrukcja">
                <HelpCircle className="w-3.5 h-3.5" />
              </TabsTrigger>
            </TabsList>



            <TabsContent value="songbook" className="flex-1 min-h-0 mt-2">
              <div className="h-full">
                <SongbookPanel
                  playlist={state.playlist}
                  songs={songs}
                  currentItemIndex={state.currentItemIndex}
                  currentVerseIndex={state.currentVerseIndex}
                  onOpenSongbook={(url) => setSongbookUrl(url)}
                  onGoToItem={goToItem}
                  onRemove={removeFromPlaylist}
                  onMove={moveInPlaylist}
                  onClear={clearPlaylist}
                  onNextSlide={nextSlide}
                  onPrevSlide={prevSlide}
                  onNextSong={() => { if (state.currentItemIndex < state.playlist.length - 1) goToItem(state.currentItemIndex + 1); }}
                  onPrevSong={() => { if (state.currentItemIndex > 0) goToItem(state.currentItemIndex - 1); }}
                  onToggleLive={handleToggleLive}
                  isLive={state.isLive}
                  currentSongTitle={displaySong?.title}
                  slideInfo={totalVerses > 0 ? `${displayVerseIndex + 1}/${totalVerses}` : ''}
                  onEditSong={setEditingSong}
                />
              </div>
            </TabsContent>

            <TabsContent value="message" className="flex-1 min-h-0 mt-2 overflow-auto">
              <div className="rounded-xl border border-border bg-card h-full">
                {CustomTextPanel}
              </div>
            </TabsContent>

            <TabsContent value="help" className="flex-1 min-h-0 mt-2 overflow-auto">
              <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground space-y-2">
                <p><strong className="text-foreground">1.</strong> Wyszukaj pieśni w bazie (prawa dolna ramka)</p>
                <p><strong className="text-foreground">2.</strong> Dodaj do listy i przejdź do zakładki „Plan"</p>
                <p><strong className="text-foreground">3.</strong> Kliknij <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs">Projekcja</kbd> aby otworzyć okno</p>
                <p><strong className="text-foreground">4.</strong> Steruj pilotem po lewej stronie</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* COL 3 — Preview (top) + Propozycje/Baza (bottom) */}
        <div className="col-span-2 lg:col-span-2 flex flex-col min-h-0 gap-2">
          {/* Preview — top frame */}
          <div className={cn(
            "rounded-xl border border-border bg-card overflow-hidden flex flex-col transition-[flex-grow,flex-shrink] duration-300 ease-in-out",
            previewMode === 'collapsed' ? "shrink-0 grow-0" : previewMode === 'half' ? "flex-1 min-h-0" : "flex-[4] min-h-0"
          )} style={previewMode === 'collapsed' ? { height: 'auto' } : undefined}>
            <button
              onClick={() => setPreviewMode(m => m === 'collapsed' ? 'half' : m === 'half' ? 'full' : 'collapsed')}
              className="px-4 py-2.5 border-b border-border flex items-center justify-between hover:bg-muted/30 transition-colors shrink-0"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${state.isLive ? 'bg-success animate-pulse' : 'bg-warning'}`} />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {state.isLive ? 'NA ŻYWO' : 'WSTRZYMANO'}
                </span>
                {displaySong && (
                  <span className="text-sm text-foreground font-medium truncate min-w-0">
                    {directSong && <span className="text-xs text-warning mr-1">⚡</span>}
                    {displaySong.title}
                    <span className="text-muted-foreground ml-1 text-xs">{displayVerseIndex + 1}/{totalVerses}</span>
                  </span>
                )}
                {directSong && (
                  <span onClick={(e) => { e.stopPropagation(); clearDirectMode(); }} className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border cursor-pointer" title="Wróć do listy">✕</span>
                )}
              </div>
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0", previewMode === 'collapsed' && "-rotate-90")} />
            </button>
            {previewMode !== 'collapsed' && (
              <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
                <div className="flex-1 min-w-0 overflow-hidden relative" style={{ background: '#000' }}>
                  <PreviewMiniScreen text={state.isLive ? currentText : ''} isLive={state.isLive} hasContent={state.playlist.length > 0} verseLabel={state.isLive && currentVerse ? currentVerse.label : undefined} />
                </div>
                <div className="flex-1 min-w-0 border-l border-border overflow-hidden flex flex-col p-3">
                  {displaySong ? (
                    <>
                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border shrink-0">
                        <span className="text-sm font-bold text-foreground truncate">{displaySong.title}</span>
                        <button onClick={() => setEditingSong(displaySong)} className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0" title="Edytuj pieśń">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">{displayVerseIndex + 1}/{totalVerses}</span>
                      </div>
                      <div className="flex-1 overflow-auto space-y-1.5" ref={slidesScrollRef}>
                        {allSlides.map((slideInfo, i) => (
                          <div
                            key={i}
                            ref={i === displayVerseIndex ? activeSlideRef : undefined}
                            className={`rounded-lg p-2 text-sm cursor-pointer transition-colors ${
                              i === displayVerseIndex
                                ? 'bg-primary/10 border border-primary/30 text-foreground font-medium'
                                : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                            }`}
                            onClick={() => {
                              if (directSong) {
                                projector.goToDirectVerse(i);
                              } else {
                                goToItem(state.currentItemIndex, i);
                              }
                            }}
                          >
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">
                              Slajd {i + 1}
                            </span>
                            <p className="whitespace-pre-line text-xs leading-relaxed">{slideInfo.slide.text.replace(/<\/?[biu]>/g, '')}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-center">
                      <div>
                        <SkipForward className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">Wybierz pieśń</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Propozycje / Baza / Połączenie — bottom frame */}
          <div className={cn(
            "rounded-xl border border-border bg-card overflow-hidden flex flex-col transition-[flex-grow,flex-shrink] duration-300 ease-in-out",
            previewMode === 'full' ? "shrink-0 grow-0" : previewMode === 'half' ? "flex-1 min-h-0" : "flex-[4] min-h-0"
          )} style={previewMode === 'full' ? { height: 'auto' } : undefined}>
            <Tabs defaultValue="suggestions" className="flex flex-col h-full min-h-0">
              <div
                className="shrink-0 flex items-center gap-1 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-xl"
                onClick={() => setPreviewMode(m => m === 'full' ? 'half' : m === 'half' ? 'collapsed' : 'full')}
              >
                <TabsList className="w-full flex-1" onClick={e => e.stopPropagation()}>
                  <TabsTrigger value="suggestions" className="flex-1 gap-1.5 text-xs">
                    <Sparkles className="w-3.5 h-3.5" />
                    Propozycje
                  </TabsTrigger>
                  <TabsTrigger value="library" className="flex-1 gap-1.5 text-xs">
                    <Database className="w-3.5 h-3.5" />
                    Baza
                  </TabsTrigger>
                  <TabsTrigger value="connect" className="flex-1 gap-1.5 text-xs">
                    <Globe className="w-3.5 h-3.5" />
                    Połączenie
                  </TabsTrigger>
                </TabsList>
                <ChevronUp className={cn("w-4 h-4 text-muted-foreground shrink-0 mr-2 transition-transform duration-200", previewMode === 'full' && "rotate-180")} />
              </div>

              {previewMode !== 'full' && (
                <>
                  <TabsContent value="suggestions" className="flex-1 min-h-0 mt-2">
                    <div className="h-full">
                      <SuggestedSongs songs={songs} date={new Date()} targets={suggestedTargets} onOpenSongbook={(url) => setSongbookUrl(url)} onAddCustomTextToPlaylist={addCustomTextToPlaylist} onNextSlide={nextSlide} onPrevSlide={prevSlide} onNextSong={goNextSong} onPrevSong={goPrevSong} onToggleLive={handleToggleLive} isLive={state.isLive} slideInfo={displaySong ? `${displayVerseIndex + 1}/${totalVerses}` : undefined} />
                    </div>
                  </TabsContent>

                  <TabsContent value="library" className="flex-1 min-h-0 mt-2">
                    <div className="h-full">
                      <SongLibrary
                        songs={songs}
                        filteredSongs={filteredSongs}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        onLoadBundled={handleLoadBundled}
                        onAddToPlaylist={addToPlaylist}
                        onShowOnScreen={showOnScreen}
                        onDeleteSong={deleteSong}
                        onSearchFocus={() => {}}
                        loading={loading}
                        importMsg={importMsg}
                        searchByContent={searchByContent}
                        onSearchByContentChange={setSearchByContent}
                        playlistSongIds={playlistSongIds}
                        onEditSong={setEditingSong}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="connect" className="flex-1 min-h-0 mt-2 overflow-auto space-y-3">
                    <ConnectionPanel
                      isLive={state.isLive}
                      projectorSync={projectorSync}
                      onOpenProjector={() => setScreenPickerOpen(true)}
                    />
                    <ProjectorSettingsPanel />
                  </TabsContent>
                </>
              )}
            </Tabs>
          </div>
        </div>
      </div>

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
    </div>
  );
}
