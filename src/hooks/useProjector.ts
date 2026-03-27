import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Song, PlaylistItem, ProjectorState } from '@/types/projector';
import { parseOpenLpDatabase, fetchBundledDatabase, fetchLocalDatabase, checkLocalDatabase } from '@/lib/openLpParser';
import { useProjectorSync } from './useProjectorSync';
import { supabase } from '@/integrations/supabase/client';
import { prepareProjectorData, prepareProjectorDataForAllSongs, getSongSlides, CHURCH_PRESET } from '@/lib/projectorLayout';
import { getActivePreset, getProjectorSettings, getResolvedTextColor } from '@/lib/projectorSettings';
import { saveSongsToDb, loadSongsFromDb, migrateFromLocalStorage, backupSongsDb, restoreSongsFromBackup } from '@/lib/songsDb';
import { rebuildSongIndex, indexNewSong, rebuildAllSongsData, searchSongs, type SongSearchResult } from '@/lib/songIndex';
import { debouncedUpload, downloadSongsFromServer, getServerSongCount, initSyncSnapshot } from '@/lib/songsSync';
import { maybeCreateWeeklyBackup } from '@/lib/songsBackup';
import { fetchSetting, saveSetting } from '@/lib/settingsSync';

/** Extended state sent via control sync — includes direct mode info */
interface ControlSyncPayload extends ProjectorState {
  directSong?: Song | null;
  directVerseIndex?: number;
}


const PROJECTOR_STATE_KEY = 'organista_projector_state';
const PLAYLIST_KEY = 'organista_projector_playlist';
const SONGS_JSON_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/songs/songs.json`;

/** Convert snake_case JSON song to internal camelCase Song format */
function mapExternalSong(s: any): Song | null {
  if (!s.id || !s.title || !Array.isArray(s.verses)) return null;
  
  const verses: Song['verses'] = s.verses.map((v: any, i: number) => ({
    type: v.type || 'verse',
    label: v.label || `Zwrotka ${i + 1}`,
    text: v.text || '',
    ref: v.ref || `${v.type || 'verse'}_${i + 1}`,
  }));

  return {
    id: s.id,
    title: s.title,
    author: s.author || s.metadata?.author || '',
    source: s.source || s.metadata?.source || '',
    siedleckiNumber: s.siedleckiNumber || s.siedlecki_number || '',
    verses,
    displayOrder: s.displayOrder || s.display_order || verses.map((v: any) => v.ref),
    variants: s.variants,
    familyId: s.familyId || s.family_id,
    searchText: `${s.title} ${s.author || ''}`.toLowerCase(),
    createdAt: s.createdAt || s.created_at || new Date().toISOString(),
    updatedAt: s.updatedAt || s.updated_at || new Date().toISOString(),
  } as Song;
}

function getTodayStr() { return new Date().toISOString().slice(0, 10); }

function loadPersistedPlaylist(): { playlist: PlaylistItem[]; date: string } | null {
  try {
    const raw = localStorage.getItem(PLAYLIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.date === getTodayStr() && Array.isArray(parsed.playlist) && parsed.playlist.length > 0) {
      return parsed;
    }
    localStorage.removeItem(PLAYLIST_KEY);
  } catch {}
  return null;
}

function persistPlaylist(playlist: PlaylistItem[]) {
  const data = playlist.length === 0
    ? null
    : { playlist, date: getTodayStr() };
  if (data) {
    localStorage.setItem(PLAYLIST_KEY, JSON.stringify(data));
  } else {
    localStorage.removeItem(PLAYLIST_KEY);
  }
  // Sync to server (fire-and-forget)
  saveSetting('projector_playlist', data);
}


export function useProjector() {
  const [songs, setSongs] = useState<Song[]>([]);
  const songsLoadedFromDbRef = useRef(false);

  // Load songs from IndexedDB on mount (migrate from localStorage if needed)
  useEffect(() => {
    if (songsLoadedFromDbRef.current) return;
    songsLoadedFromDbRef.current = true;
    (async () => {
      // 1. Try localStorage migration
      const migrated = await migrateFromLocalStorage();
      if (migrated && migrated.length > 0) {
        setSongs(migrated);
        initSyncSnapshot(migrated);
        return;
      }
      // 2. Try IndexedDB
      const stored = await loadSongsFromDb();
      if (stored.length > 0) {
        setSongs(stored);
        initSyncSnapshot(stored);
        return;
      }
      // 3. Try server (Supabase)
      try {
        const serverCount = await getServerSongCount();
        if (serverCount > 0) {
          console.log(`[Songs] IndexedDB empty, downloading ${serverCount} songs from server...`);
          const serverSongs = await downloadSongsFromServer();
          if (serverSongs.length > 0) {
            setSongs(serverSongs);
            await saveSongsToDb(serverSongs);
            initSyncSnapshot(serverSongs);
            console.log(`[Songs] Restored ${serverSongs.length} songs from server`);
            return;
          }
        }
      } catch (e) {
        console.warn('[Songs] Failed to download from server:', e);
      }
      // 4. Check if weekly backup is due
      maybeCreateWeeklyBackup().catch(() => {});
    })();
  }, []);

  const persisted = loadPersistedPlaylist();
  const [state, setState] = useState<ProjectorState>({
    currentItemIndex: 0,
    currentVerseIndex: 0,
    isLive: false,
    playlist: persisted?.playlist || [],
  });

  // On mount: restore playlist from server if local is empty
  const playlistSyncedRef = useRef(false);
  useEffect(() => {
    if (playlistSyncedRef.current || state.playlist.length > 0) return;
    playlistSyncedRef.current = true;
    (async () => {
      const server = await fetchSetting<{ playlist: PlaylistItem[]; date: string }>('projector_playlist');
      if (server && server.date === getTodayStr() && server.playlist?.length > 0) {
        setState(prev => ({ ...prev, playlist: server.playlist }));
        localStorage.setItem(PLAYLIST_KEY, JSON.stringify(server));
        console.log(`[Projector] Restored ${server.playlist.length} playlist items from server`);
      }
    })();
  }, []);

  // Direct display mode — shows a song on screen without adding to playlist
  const [directSong, setDirectSong] = useState<Song | null>(null);
  const [directVerseIndex, setDirectVerseIndex] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const projectorWindowRef = useRef<Window | null>(null);
  const autoLoadedRef = useRef(false);

  // Auto-load songs: prefer bundled OpenLP SQLite, fallback to cloud JSON
  useEffect(() => {
    const storedSongsLackProjector = songs.length > 0 && songs.some(s => !s.projectorPreparedAt || s.projectorPresetName !== getActivePreset().name);

    if ((songs.length === 0 || storedSongsLackProjector) && !autoLoadedRef.current) {
      autoLoadedRef.current = true;
      setLoading(true);

      fetchBundledDatabase()
        .then((imported) => {
          const rebuilt = rebuildAllSongsData(imported, getActivePreset());
          console.log(`[Songs] Loaded ${rebuilt.songs.length} songs from bundled SQLite, ${rebuilt.totalSlides} slides in ${rebuilt.elapsed}ms`);
          setSongs(rebuilt.songs);
        })
        .catch(() => {
          return fetch(SONGS_JSON_URL)
            .then(res => {
              if (!res.ok) throw new Error('No pre-built JSON');
              return res.json();
            })
            .then((data: any[]) => {
              const imported: Song[] = data
                .map(s => mapExternalSong(s))
                .filter((s): s is Song => s !== null);
              const rebuilt = rebuildAllSongsData(imported, getActivePreset());
              console.log(`[Songs] Fallback JSON: ${rebuilt.songs.length} songs, ${rebuilt.totalSlides} slides in ${rebuilt.elapsed}ms`);
              setSongs(rebuilt.songs);
            });
        })
        .catch((err) => {
          console.warn('[Songs] Failed to auto-load any song source:', err);
        })
        .finally(() => setLoading(false));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-rebuild slides when preset version changes (songs already in IndexedDB)
  const presetRebuildRef = useRef(false);
  const songsLenRef = useRef(0);
  useEffect(() => {
    // Only check when song count actually changes (avoids running on every setSongs)
    if (presetRebuildRef.current || songs.length === 0 || songs.length === songsLenRef.current) return;
    songsLenRef.current = songs.length;
    const activePreset = getActivePreset();
    const needsRebuild = songs.some(s => s.projectorPresetName !== activePreset.name);
    if (needsRebuild) {
      presetRebuildRef.current = true;
      console.log(`[Songs] Preset changed to ${activePreset.name}, rebuilding all slides...`);
      const rebuilt = rebuildAllSongsData(songs, activePreset);
      console.log(`[Songs] Rebuilt ${rebuilt.modified} songs, ${rebuilt.totalSlides} slides in ${rebuilt.elapsed}ms`);
      setSongs(rebuilt.songs);
    }
  }, [songs]);

  // Listen for postMessage from projector window (cross-origin safe)
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'PROJECTOR_READY') {
        const text = getCurrentTextRef.current();
        const live = stateRef.current.isLive;
        const win = projectorWindowRef.current;
        if (win && !win.closed) {
          win.postMessage({ type: 'STATE_UPDATE', state: { text, isLive: live } }, '*');
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Listen for cross-module add-to-playlist events (e.g. from LiturgyPanel)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as (Song & { litDate?: string }) | undefined;
      if (detail) {
        const addDate = detail.litDate || getTodayStr();
        setState(prev => {
          if (prev.playlist.length > 0) {
            const existingDate = prev.playlist[0].litDate || getTodayStr();
            if (addDate !== existingDate) {
              const clear = window.confirm(
                `Lista rzutnika zawiera pieśni z innego dnia (${existingDate}).\nCzy chcesz wyczyścić listę i dodać nową pieśń?`
              );
              if (clear) {
                return { ...prev, playlist: [{ id: crypto.randomUUID(), songId: detail.id, title: detail.title, litDate: addDate }], currentItemIndex: 0, currentVerseIndex: 0 };
              }
            }
          }
          return { ...prev, playlist: [...prev.playlist, { id: crypto.randomUUID(), songId: detail.id, title: detail.title, litDate: addDate }] };
        });
      }
    };
    window.addEventListener('projector:addSong', handler);
    return () => window.removeEventListener('projector:addSong', handler);
  }, []);

  // Refs to avoid stale closures
  const getCurrentTextRef = useRef((() => '') as () => string);
  const stateRef = useRef(state);
  const ignoringRemoteUpdate = useRef(false);
  const syncSendControlStateRef = useRef<(s: ProjectorState) => void>();
  const songsRef = useRef(songs);
  const autoLoadingRef = useRef(false);
  const directSongRef = useRef(directSong);
  const directVerseIndexRef = useRef(directVerseIndex);

  useEffect(() => { songsRef.current = songs; }, [songs]);
  useEffect(() => { directSongRef.current = directSong; }, [directSong]);
  useEffect(() => { directVerseIndexRef.current = directVerseIndex; }, [directVerseIndex]);

  // Auto-load bundled songs if we receive a playlist but have no songs
  const ensureSongsLoaded = useCallback(async () => {
    if (songsRef.current.length === 0 && !autoLoadingRef.current) {
      autoLoadingRef.current = true;
      console.log('[ProjectorSync] Auto-loading bundled song database for sync...');
      try {
        const imported = await fetchBundledDatabase();
        setSongs(prev => {
          if (prev.length > 0) return prev;
          return imported;
        });
      } catch (e) {
        console.warn('[ProjectorSync] Failed to auto-load songs:', e);
      } finally {
        autoLoadingRef.current = false;
      }
    }
  }, []);

  // Handle control state received from another controller
  const handleControlReceived = useCallback((remoteState: ProjectorState) => {
    const payload = remoteState as ControlSyncPayload;
    // Ignore empty playlists from newly-joined controllers (but NOT intentional clears)
    if ((!payload.playlist || payload.playlist.length === 0) && !payload.directSong && !(payload as any)._cleared) {
      // Instead, send OUR state so the new joiner gets synced
      setState(prev => {
        if (prev.playlist.length > 0 || directSongRef.current) {
          setTimeout(() => {
            const fullPayload: ControlSyncPayload = {
              ...prev,
              directSong: directSongRef.current,
              directVerseIndex: directVerseIndexRef.current,
            };
            syncSendControlStateRef.current?.(fullPayload);
          }, 200);
        }
        return prev;
      });
      return;
    }
    // Handle direct mode sync
    if (payload.directSong !== undefined) {
      setDirectSong(payload.directSong || null);
      setDirectVerseIndex(payload.directVerseIndex || 0);
    } else {
      // Remote is not in direct mode — clear ours too
      setDirectSong(null);
      setDirectVerseIndex(0);
    }
    // Auto-load songs if needed
    ensureSongsLoaded();
    ignoringRemoteUpdate.current = true;
    setState(payload);
    // Allow enough time for the state to settle before broadcasting again
    setTimeout(() => { ignoringRemoteUpdate.current = false; }, 500);
  }, [ensureSongsLoaded]);

  // Handle request-state from new joiners: send our full state
  const handleRequestState = useCallback(() => {
    const current = stateRef.current;
    if (current.playlist.length > 0 || directSongRef.current) {
      console.log('[Projector] Sending full state to new joiner');
      const fullPayload: ControlSyncPayload = {
        ...stateRef.current,
        directSong: directSongRef.current,
        directVerseIndex: directVerseIndexRef.current,
      };
      setTimeout(() => syncSendControlStateRef.current?.(fullPayload), 100);
    }
  }, []);

  // Sync for LAN (WebSocket) + Internet (Realtime broadcast)
  const projectorSync = useProjectorSync('controller', undefined, handleControlReceived, undefined, undefined, undefined, handleRequestState);
  const { sendState: syncSendState, sendControlState: syncSendControlState } = projectorSync;

  // Keep ref updated
  useEffect(() => {
    syncSendControlStateRef.current = syncSendControlState;
  }, [syncSendControlState]);

  // Broadcast state to projector window via postMessage + localStorage + WebSocket
  const broadcastState = useCallback((text: string, isLive: boolean, title?: string, songFontColor?: string) => {
    // Gather current visual settings for remote displays
    const ps = getProjectorSettings();
    const settings: import('@/hooks/useProjectorSync').ProjectorSyncSettings = {
      fontSize: ps.fontSize,
      textColor: songFontColor || getResolvedTextColor(ps),
      strokeWidth: ps.strokeWidth,
      background: ps.background,
      shadowIntensity: ps.shadowIntensity,
      rotation: ps.rotation,
      maxLines: ps.maxLines,
      offsetX: ps.offsetX,
      offsetY: ps.offsetY,
      scale: ps.scale,
    };
    // postMessage (primary - works cross-origin via window.open ref)
    const win = projectorWindowRef.current;
    if (win && !win.closed) {
      win.postMessage({ type: 'STATE_UPDATE', state: { text, isLive } }, '*');
    }
    // localStorage (fallback for same-origin)
    try {
      localStorage.setItem(PROJECTOR_STATE_KEY, JSON.stringify({ text, isLive, t: Date.now() }));
    } catch {}
    // WebSocket + Supabase Realtime (LAN + Internet sync)
    syncSendState({ text, isLive, title, settings });
  }, [syncSendState]);

  // Get current verse text (direct mode takes priority)
  // Uses projector slides if available
  // Memo: only recompute when the actual indices or active song change
  const getCurrentText = useCallback((st: ProjectorState = stateRef.current): string => {
    if (directSongRef.current) {
      const ds = directSongRef.current;
      const dvi = directVerseIndexRef.current;
      const slides = getSongSlides(ds);
      const slide = slides[dvi];
      return slide?.slide.text || ds.verses[dvi]?.text || '';
    }
    const item = st.playlist[st.currentItemIndex];
    if (!item) return '';
    const song = songsRef.current.find(s => s.id === item.songId);
    if (!song) return '';
    const slides = getSongSlides(song);
    const slide = slides[st.currentVerseIndex];
    return slide?.slide.text || song.verses[st.currentVerseIndex]?.text || '';
  }, []); // stable — uses refs internally

  // Keep refs updated
  useEffect(() => {
    getCurrentTextRef.current = () => getCurrentText();
    stateRef.current = state;
  }, [getCurrentText, state]);

  // Save songs to IndexedDB (async, no quota issues)
  useEffect(() => {
    if (songs.length > 0) {
      saveSongsToDb(songs);
      debouncedUpload(songs);
    }
  }, [songs]);

  // Persist playlist to localStorage
  useEffect(() => {
    persistPlaylist(state.playlist);
  }, [state.playlist]);

  // Broadcast whenever relevant state changes
  // Only depend on the values that actually affect what's displayed
  useEffect(() => {
    if (directSongRef.current) return; // direct mode broadcasts display separately
    const text = getCurrentText();
    const item = stateRef.current.playlist[stateRef.current.currentItemIndex];
    const song = item ? songsRef.current.find(s => s.id === item.songId) : null;
    broadcastState(text, state.isLive, song?.title, song?.fontColor);

    // Also broadcast control state to other controllers (skip if this was a remote update)
    if (!ignoringRemoteUpdate.current) {
      const payload: ControlSyncPayload = { ...stateRef.current, directSong: null, directVerseIndex: 0 };
      syncSendControlState(payload);
    }
  }, [state.currentItemIndex, state.currentVerseIndex, state.isLive, state.playlist.length, broadcastState, syncSendControlState, getCurrentText]);

  // Import SQLite database from file
  const importDatabase = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const imported = await parseOpenLpDatabase(file);
      setSongs(prev => {
        const existingIds = new Set(prev.map(s => s.id));
        const newSongs = imported.filter(s => !existingIds.has(s.id));
        return [...prev, ...newSongs];
      });
      return imported.length;
    } finally {
      setLoading(false);
    }
  }, []);

  // Load bundled database from /public/songs.sqlite
  const loadBundledDatabase = useCallback(async () => {
    setLoading(true);
    try {
      const imported = await fetchBundledDatabase();
      const rebuilt = rebuildAllSongsData(imported);
      setSongs(rebuilt.songs);
      return rebuilt.songs.length;
    } finally {
      setLoading(false);
    }
  }, []);

  // Load local OpenLP database from disk (via serve.cjs / Vite plugin)
  const loadLocalDatabase = useCallback(async () => {
    setLoading(true);
    try {
      const imported = await fetchLocalDatabase();
      const rebuilt = rebuildAllSongsData(imported);
      setSongs(rebuilt.songs);
      return rebuilt.songs.length;
    } finally {
      setLoading(false);
    }
  }, []);

  // Force-reload: replace all songs from given source
  const forceReloadDatabase = useCallback(async (source: 'local' | 'bundled' | 'json' = 'bundled') => {
    setLoading(true);
    try {
      let imported: Song[];
      if (source === 'local') {
        imported = await fetchLocalDatabase();
      } else if (source === 'bundled') {
        imported = await fetchBundledDatabase();
      } else {
        const res = await fetch(SONGS_JSON_URL);
        if (!res.ok) throw new Error('No pre-built JSON');
        const data = await res.json();
        imported = data.map((s: any) => mapExternalSong(s)).filter((s: Song | null): s is Song => s !== null);
      }
      // Always rebuild index + projector slides after re-import
      const rebuilt = rebuildAllSongsData(imported);
      console.log(`[Songs] Force-reload (${source}): ${rebuilt.songs.length} songs, ${rebuilt.totalSlides} slides in ${rebuilt.elapsed}ms`);
      setSongs(rebuilt.songs);
      return rebuilt.songs.length;
    } finally {
      setLoading(false);
    }
  }, []);

  // Check local database availability
  const checkLocalDb = useCallback(async () => {
    return checkLocalDatabase();
  }, []);

  // Add song to playlist (with date-mismatch check)
  const addToPlaylist = useCallback((song: Song, meta?: { isPsalm?: boolean; litDate?: string }) => {
    const addDate = meta?.litDate || getTodayStr();

    setState(prev => {
      // Check if existing playlist items have a different litDate
      if (prev.playlist.length > 0) {
        const existingDate = prev.playlist[0].litDate || getTodayStr();
        if (addDate !== existingDate) {
          const clear = window.confirm(
            `Lista rzutnika zawiera pieśni z innego dnia (${existingDate}).\nCzy chcesz wyczyścić listę i dodać nową pieśń?`
          );
          if (clear) {
            return {
              ...prev,
              playlist: [{
                id: crypto.randomUUID(),
                songId: song.id,
                title: song.title,
                ...(meta?.isPsalm && { isPsalm: true }),
                litDate: addDate,
              }],
              currentItemIndex: 0,
              currentVerseIndex: 0,
            };
          }
          // User chose not to clear — still add
        }
      }

      // Prevent adding duplicate songId
      if (prev.playlist.some(p => p.songId === song.id)) {
        return prev;
      }

      return {
        ...prev,
        playlist: [...prev.playlist, {
          id: crypto.randomUUID(),
          songId: song.id,
          title: song.title,
          ...(meta?.isPsalm && { isPsalm: true }),
          litDate: addDate,
        }],
      };
    });
  }, []);

  // Add psalm/acclamation (no song object) to playlist
  const addPsalmToPlaylist = useCallback((title: string, litDate?: string) => {
    const addDate = litDate || getTodayStr();
    // Derive ID prefix from title: "Aklamacja: ..." → "acclamation-", "Psalm: ..." → "psalm-"
    const prefix = title.startsWith('Aklamacja:') ? 'acclamation' : 'psalm';
    const psalmId = `${prefix}-${addDate}`;

    setState(prev => {
      // Prevent duplicate psalm
      if (prev.playlist.some(p => p.songId === psalmId)) return prev;

      // Date mismatch check
      if (prev.playlist.length > 0) {
        const existingDate = prev.playlist[0].litDate || getTodayStr();
        if (addDate !== existingDate) {
          const clear = window.confirm(
            `Lista rzutnika zawiera pieśni z innego dnia (${existingDate}).\nCzy chcesz wyczyścić listę i dodać psalm?`
          );
          if (clear) {
            return {
              ...prev,
              playlist: [{
                id: crypto.randomUUID(),
                songId: psalmId,
                title,
                isPsalm: true,
                litDate: addDate,
              }],
              currentItemIndex: 0,
              currentVerseIndex: 0,
            };
          }
        }
      }

      return {
        ...prev,
        playlist: [...prev.playlist, {
          id: crypto.randomUUID(),
          songId: psalmId,
          title,
          isPsalm: true,
          litDate: addDate,
        }],
      };
    });
  }, []);

  // Remove from playlist
  const removeFromPlaylist = useCallback((itemId: string) => {
    setState(prev => {
      const newPlaylist = prev.playlist.filter(p => p.id !== itemId);
      return {
        ...prev,
        playlist: newPlaylist,
        currentItemIndex: Math.min(prev.currentItemIndex, Math.max(0, newPlaylist.length - 1)),
        currentVerseIndex: 0,
      };
    });
  }, []);

  // Clear entire playlist
  const clearPlaylist = useCallback(() => {
    setState(prev => ({
      ...prev,
      playlist: [],
      currentItemIndex: 0,
      currentVerseIndex: 0,
      _cleared: true,
    } as any));
    // Remove _cleared flag after sync has time to broadcast
    setTimeout(() => {
      setState(prev => {
        const { _cleared, ...rest } = prev as any;
        return rest;
      });
    }, 500);
  }, []);

  // Move item in playlist
  const moveInPlaylist = useCallback((fromIndex: number, toIndex: number) => {
    setState(prev => {
      const newPlaylist = [...prev.playlist];
      const [moved] = newPlaylist.splice(fromIndex, 1);
      newPlaylist.splice(toIndex, 0, moved);
      return { ...prev, playlist: newPlaylist };
    });
  }, []);

  // Navigate to specific song/verse (clears direct mode)
  const goToItem = useCallback((itemIndex: number, verseIndex = 0) => {
    setDirectSong(null);
    setDirectVerseIndex(0);
    setState(prev => ({
      ...prev,
      currentItemIndex: itemIndex,
      currentVerseIndex: verseIndex,
    }));
  }, []);

  // Next slide (supports direct mode, navigates by projector slides)
  const nextSlide = useCallback(() => {
    if (directSong) {
      const totalSlides = getSongSlides(directSong).length;
      setDirectVerseIndex(prev => {
        if (prev < totalSlides - 1) return prev + 1;
        return prev;
      });
      return;
    }
    setState(prev => {
      const item = prev.playlist[prev.currentItemIndex];
      if (!item) return prev;
      const song = songs.find(s => s.id === item.songId);
      if (!song) return prev;

      const totalSlides = getSongSlides(song).length;

      if (prev.currentVerseIndex < totalSlides - 1) {
        return { ...prev, currentVerseIndex: prev.currentVerseIndex + 1 };
      }
      if (prev.currentItemIndex < prev.playlist.length - 1) {
        return { ...prev, currentItemIndex: prev.currentItemIndex + 1, currentVerseIndex: 0 };
      }
      return prev;
    });
  }, [songs, directSong]);

  // Previous slide (supports direct mode)
  const prevSlide = useCallback(() => {
    if (directSong) {
      setDirectVerseIndex(prev => prev > 0 ? prev - 1 : prev);
      return;
    }
    setState(prev => {
      if (prev.currentVerseIndex > 0) {
        return { ...prev, currentVerseIndex: prev.currentVerseIndex - 1 };
      }
      if (prev.currentItemIndex > 0) {
        const prevItem = prev.playlist[prev.currentItemIndex - 1];
        const prevSong = songs.find(s => s.id === prevItem.songId);
        const lastSlide = prevSong ? getSongSlides(prevSong).length - 1 : 0;
        return { ...prev, currentItemIndex: prev.currentItemIndex - 1, currentVerseIndex: lastSlide };
      }
      return prev;
    });
  }, [songs, directSong]);

  // Toggle live/black screen
  const toggleLive = useCallback(() => {
    setState(prev => ({ ...prev, isLive: !prev.isLive }));
  }, []);

  // Show song on screen directly (without adding to playlist)
  const showOnScreen = useCallback((song: Song) => {
    setDirectSong(song);
    setDirectVerseIndex(0);
    setState(prev => prev.isLive ? prev : { ...prev, isLive: true });
  }, []);

  // Create a virtual song from custom text
  const makeCustomTextSong = useCallback((text: string, title?: string): Song => {
    return {
      id: `custom-text-${Date.now()}`,
      title: title || 'Komunikat',
      verses: [{
        type: 'other',
        label: title || 'Komunikat',
        text,
        ref: 'custom_1',
      }],
      searchText: '',
    };
  }, []);

  // Show custom text on screen (creates a virtual song)
  const showCustomText = useCallback((text: string, title?: string) => {
    const virtualSong = makeCustomTextSong(text, title);
    setDirectSong(virtualSong);
    setDirectVerseIndex(0);
    setState(prev => prev.isLive ? prev : { ...prev, isLive: true });
  }, [makeCustomTextSong]);

  // Add custom text to playlist as a real song entry (prevent duplicates by title)
  const addCustomTextToPlaylist = useCallback((text: string, title?: string) => {
    const displayTitle = title || 'Komunikat';
    // Prevent duplicate by checking if same title already in playlist
    if (stateRef.current.playlist.some(p => p.title === displayTitle)) return;
    const virtualSong = makeCustomTextSong(text, title);
    setSongs(prev => [...prev, virtualSong]);
    addToPlaylist(virtualSong);
  }, [makeCustomTextSong, addToPlaylist]);

  // Broadcast direct mode changes (display + control sync)
  // IMPORTANT: Only depend on directSong, directVerseIndex, and state.isLive
  // — NOT the entire `state` object, to avoid feedback loops with playlist state changes
  useEffect(() => {
    if (directSong) {
      const slides = getSongSlides(directSong);
      const slide = slides[directVerseIndex];
      const text = slide?.slide.text || directSong.verses[directVerseIndex]?.text || '';
      broadcastState(text, state.isLive, directSong.title, directSong.fontColor);
      // Sync direct mode to other controllers
      if (!ignoringRemoteUpdate.current) {
        const payload: ControlSyncPayload = { ...stateRef.current, directSong, directVerseIndex };
        syncSendControlState(payload);
      }
    }
  }, [directSong, directVerseIndex, state.isLive, broadcastState, syncSendControlState]);

  // Clear direct mode helper
  const clearDirectMode = useCallback(() => {
    setDirectSong(null);
    setDirectVerseIndex(0);
  }, []);

  // Go to specific verse in direct mode
  const goToDirectVerse = useCallback((index: number) => {
    setDirectVerseIndex(index);
  }, []);

  // Request Window Management permission proactively
  const ensureWindowManagement = useCallback(async (): Promise<ScreenDetails | null> => {
    if (!(window as any).getScreenDetails) return null;
    try {
      const details = await (window as any).getScreenDetails();
      return details;
    } catch {
      return null;
    }
  }, []);

  // Open projector window on a specific screen (or default)
  const openProjectorWindow = useCallback(async (screenInfo?: { left: number; top: number; width: number; height: number; screenDetail?: any } | null) => {
    if (projectorWindowRef.current && !projectorWindowRef.current.closed) {
      projectorWindowRef.current.focus();
      return;
    }

    // Ensure we have Window Management permission (triggers browser prompt if needed)
    const screenDetails = await ensureWindowManagement();

    const left = screenInfo?.left ?? 0;
    const top = screenInfo?.top ?? 0;
    const w = screenInfo?.width ?? window.screen.availWidth;
    const h = screenInfo?.height ?? window.screen.availHeight;

    // Try Window Management API fullscreen directly on the target screen
    const screenDetail = screenInfo?.screenDetail;
    if (screenDetail && screenDetails) {
      try {
        const win = window.open(
          '/projector-screen?autofs=1',
          'projector',
          `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,scrollbars=no`
        );
        if (win) {
          projectorWindowRef.current = win;
          // Use Window Management API to request fullscreen on the specific screen
          win.addEventListener('load', () => {
            setTimeout(() => {
              try {
                win.document.documentElement.requestFullscreen({
                  screen: screenDetail,
                  navigationUI: 'hide',
                } as any).catch(() => {});
              } catch {}
            }, 300);
          });
          return;
        }
      } catch (e) {
        console.warn('[Projector] Window Management fullscreen failed, falling back:', e);
      }
    }

    // Fallback: open popup sized to fill the target screen
    projectorWindowRef.current = window.open(
      '/projector-screen?autofs=1',
      'projector',
      `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,scrollbars=no,fullscreen=yes`
    );
  }, [ensureWindowManagement]);

  // Search songs (uses indexed search when available, fallback to simple match)
  const [searchByContent, setSearchByContent] = useState(false);

  // Debounced search query — prevents re-filtering on every keystroke
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    if (!searchQuery) { setDebouncedQuery(''); return; }
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const normalizeSearch = useCallback((text: string) =>
    text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'l').replace(/ą/g, 'a').replace(/Ą/g, 'a').replace(/ę/g, 'e').replace(/Ę/g, 'e').replace(/[^a-z0-9\s]/gi, '').toLowerCase().replace(/\s+/g, ' ').trim()
  , []);

  // Stable song count ref — avoid re-filtering when songs array identity changes but content is same
  const songsVersionRef = useRef(0);
  const prevSongsLenRef = useRef(0);
  if (songs.length !== prevSongsLenRef.current) {
    prevSongsLenRef.current = songs.length;
    songsVersionRef.current++;
  }
  const songsVersion = songsVersionRef.current;

  const filteredSongs = useMemo(() => {
    if (!debouncedQuery) return songs;
    // Use indexed search if songs have been indexed (v2)
    const hasIndex = songs.length > 0 && songs[0].searchTokens;
    if (hasIndex) {
      const results = searchSongs(songs, debouncedQuery, { searchContent: searchByContent, limit: 200 });
      return results.map(r => r.song);
    }
    // Fallback to simple search
    const q = normalizeSearch(debouncedQuery);
    const filtered = songs.filter(s => {
      const titleMatch = normalizeSearch(s.searchText).includes(q);
      if (titleMatch) return true;
      if (searchByContent) {
        return s.verses.some(v => normalizeSearch(v.text).includes(q));
      }
      return false;
    });
    return filtered.sort((a, b) => a.title.localeCompare(b.title, 'pl'));
  }, [debouncedQuery, songsVersion, searchByContent, normalizeSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get current song object
  const currentItem = state.playlist[state.currentItemIndex];
  const currentSong = currentItem ? songs.find(s => s.id === currentItem.songId) : null;

  // Get next verse info for preview (slide-aware)
  const getNextPreview = useCallback((): { label: string; text: string } | null => {
    if (!currentSong) return null;
    const slides = getSongSlides(currentSong);
    const nextIdx = state.currentVerseIndex + 1;
    if (nextIdx < slides.length) {
      const next = slides[nextIdx];
      return { label: `${next.verse.label}${next.slideIndex > 0 ? ` (${next.slideIndex + 1})` : ''}`, text: next.slide.text };
    }
    const nextItem = state.playlist[state.currentItemIndex + 1];
    if (nextItem) {
      const nextSong = songs.find(s => s.id === nextItem.songId);
      if (nextSong) {
        const nextSlides = getSongSlides(nextSong);
        if (nextSlides.length > 0) {
          return { label: `${nextSong.title} — ${nextSlides[0].verse.label}`, text: nextSlides[0].slide.text };
        }
      }
    }
    return null;
  }, [currentSong, state, songs]);

  // Update a single song (auto-indexes: projector data, numbering, search tokens)
  const updateSong = useCallback((updated: Song) => {
    setSongs(prev => {
      const exists = prev.some(s => s.id === updated.id);
      const prepared = exists
        ? rebuildSongIndex(updated)
        : indexNewSong(updated, prev);
      if (exists) return prev.map(s => s.id === prepared.id ? prepared : s);
      return [prepared, ...prev];
    });
  }, []);

  // Delete a single song
  const deleteSong = useCallback((songId: string) => {
    setSongs(prev => prev.filter(s => s.id !== songId));
    // Also remove from playlist
    setState(prev => {
      const newPlaylist = prev.playlist.filter(p => p.songId !== songId);
      if (newPlaylist.length === prev.playlist.length) return prev;
      return {
        ...prev,
        playlist: newPlaylist,
        currentItemIndex: Math.min(prev.currentItemIndex, Math.max(0, newPlaylist.length - 1)),
        currentVerseIndex: 0,
      };
    });
  }, []);

  // Import songs from JSON array with merge mode (auto-indexes if missing)
  const importJsonSongs = useCallback((data: any[], mode: 'skip' | 'overwrite' = 'skip'): { total: number; added: number; updated: number } => {
    const imported: Song[] = data
      .map(s => mapExternalSong(s))
      .filter((s): s is Song => s !== null)
      .map(song => {
        // If already fully indexed (v2), keep; otherwise rebuild
        const isIndexed = song.projectorVersion === 3 && song.projectorDisplaySlides;
        return isIndexed ? song : rebuildSongIndex(song);
      });
    let added = 0;
    let updated = 0;
    setSongs(prev => {
      const existingMap = new Map(prev.map(s => [s.id, s]));
      const result = [...prev];
      for (const song of imported) {
        if (existingMap.has(song.id)) {
          if (mode === 'overwrite') {
            const idx = result.findIndex(s => s.id === song.id);
            if (idx >= 0) { result[idx] = song; updated++; }
          }
        } else {
          result.push(song);
          added++;
        }
      }
      return result;
    });
    return { total: imported.length, added, updated };
  }, []);

  // Rebuild all data: projector + index + numbering
  const rebuildAllProjectorData = useCallback((): { modified: number; totalSlides: number; elapsed: number } => {
    let result = { modified: 0, totalSlides: 0, elapsed: 0 };
    setSongs(prev => {
      const rebuilt = rebuildAllSongsData(prev);
      result = { modified: rebuilt.modified, totalSlides: rebuilt.totalSlides, elapsed: rebuilt.elapsed };
      return rebuilt.songs;
    });
    return result;
  }, []);

  // Rebuild data for selected songs
  const rebuildProjectorForSongs = useCallback((songIds: string[]): number => {
    const idSet = new Set(songIds);
    let count = 0;
    setSongs(prev => prev.map(s => {
      if (idSet.has(s.id)) {
        count++;
        return rebuildSongIndex(s);
      }
      return s;
    }));
    return count;
  }, []);

  // Create a backup of the current database
  const createBackup = useCallback(async () => {
    return backupSongsDb();
  }, []);

  // Restore songs from backup
  const restoreFromBackup = useCallback(async () => {
    const restored = await restoreSongsFromBackup();
    const rebuilt = rebuildAllSongsData(restored);
    setSongs(rebuilt.songs);
    return rebuilt.songs.length;
  }, []);

  // Clear all songs and reload from bundled Siedlecki JSON
  const clearSongs = useCallback(() => {
    setSongs([]);
    saveSongsToDb([]);
  }, []);

  // Load main bundled song database (clear + reimport from SQLite)
  const loadSiedleckiDatabase = useCallback(async (): Promise<number> => {
    setLoading(true);
    try {
      const imported = await fetchBundledDatabase();
      const rebuilt = rebuildAllSongsData(imported);
      console.log(`[Songs] Bundled SQLite: ${rebuilt.songs.length} songs, ${rebuilt.totalSlides} slides in ${rebuilt.elapsed}ms`);
      setSongs(rebuilt.songs);
      return rebuilt.songs.length;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    songs,
    filteredSongs,
    state,
    loading,
    searchQuery,
    setSearchQuery,
    searchByContent,
    setSearchByContent,
    currentSong,
    currentItem,
    getCurrentText,
    getNextPreview,
    importDatabase,
    loadBundledDatabase,
    loadLocalDatabase,
    forceReloadDatabase,
    checkLocalDb,
    addToPlaylist,
    addPsalmToPlaylist,
    removeFromPlaylist,
    clearPlaylist,
    moveInPlaylist,
    goToItem,
    nextSlide,
    prevSlide,
    toggleLive,
    openProjectorWindow,
    updateSong,
    deleteSong,
    importJsonSongs,
    clearSongs,
    loadSiedleckiDatabase,
    showOnScreen,
    showCustomText,
    addCustomTextToPlaylist,
    directSong,
    directVerseIndex,
    goToDirectVerse,
    clearDirectMode,
    projectorSync,
    rebuildAllProjectorData,
    rebuildProjectorForSongs,
    createBackup,
    restoreFromBackup,
    setSongs,
  };
}
