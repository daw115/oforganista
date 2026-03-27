import { useState, useCallback, useEffect, useRef } from 'react';
import type { OpenLpConfig, OpenLpServiceItem, OpenLpSlide, OpenLpPollData } from '@/lib/openLpApi';
import {
  getServiceItems, getLiveSlides, pollOpenLp,
  controllerNext, controllerPrevious, controllerGoToSlide,
  serviceGoToItem, serviceNext, servicePrevious, serviceRemoveItem,
  setDisplayMode, searchAndAddSong,
} from '@/lib/openLpApi';
import { useProjectorSync } from './useProjectorSync';
import type { LANCommand, LANBridgeState, LANCommandType } from '@/types/lanBridge';
import { lanStateTobridge } from '@/types/lanBridge';

const SETTINGS_KEY = 'organista_lan_settings';
const BRIDGE_ID_KEY = 'organista_bridge_id';

export interface LANState {
  connected: boolean;
  error: string | null;
  serviceItems: OpenLpServiceItem[];
  slides: OpenLpSlide[];
  currentSlideIndex: number;
  currentServiceIndex: number;
  displayMode: 'show' | 'blank' | 'theme' | 'desktop';
  currentTitle: string;
}

export function useProjectorLAN() {
  const [config, setConfig] = useState<OpenLpConfig>(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return { ip: '192.168.0.103', port: 4316, version: 'v2' as const };
  });

  const [state, setState] = useState<LANState>({
    connected: false,
    error: null,
    serviceItems: [],
    slides: [],
    currentSlideIndex: -1,
    currentServiceIndex: -1,
    displayMode: 'show',
    currentTitle: '',
  });

  const [polling, setPolling] = useState(false);
  const [paused, setPaused] = useState(false);
  const [bridgeMode, setBridgeMode] = useState(false);
  const configRef = useRef(config);
  const pollingRef = useRef(false);
  const consecutiveErrors = useRef(0);
  const MAX_ERRORS = 5;
  const lastServiceVersion = useRef(-1);
  const lastItemUid = useRef('');
  const bridgeId = useRef<string>((() => {
    let id = localStorage.getItem(BRIDGE_ID_KEY);
    if (!id) { id = crypto.randomUUID().slice(0, 8); localStorage.setItem(BRIDGE_ID_KEY, id); }
    return id;
  })());

  useEffect(() => {
    configRef.current = config;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    pollingRef.current = polling;
  }, [polling]);

  // ─── Auto-bridge: wykryj lokalny serwer i włącz most automatycznie ───
  useEffect(() => {
    if (window.location.protocol === 'https:') return; // tylko lokalnie
    fetch('/auto-bridge')
      .then(r => r.json())
      .then(data => {
        if (data?.localServer && data?.bridgeMode) {
          console.log('[LAN] Auto-bridge detected, enabling bridge mode');
          setConfig(prev => ({
            ...prev,
            ip: data.openLpHost || prev.ip,
            port: data.openLpPort || prev.port,
          }));
          setBridgeMode(true);
          // Auto-connect po krótkim opóźnieniu
          setTimeout(() => {
            refreshData().then(() => setPolling(true)).catch(() => {});
          }, 500);
        }
      })
      .catch(() => {}); // nie na lokalnym serwerze — ignoruj
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch service items & slides
  const refreshData = useCallback(async (cfg?: OpenLpConfig) => {
    const c = cfg ?? configRef.current;
    try {
      const [items, slides] = await Promise.all([
        getServiceItems(c),
        getLiveSlides(c),
      ]);
      const selectedItem = items.findIndex(i => i.selected);
      const selectedSlide = slides.findIndex(s => s.selected);
      const currentTitle = selectedItem >= 0 ? items[selectedItem].title : '';

      setState(prev => ({
        ...prev,
        connected: true,
        error: null,
        serviceItems: items,
        slides,
        currentServiceIndex: selectedItem >= 0 ? selectedItem : prev.currentServiceIndex,
        currentSlideIndex: selectedSlide >= 0 ? selectedSlide : prev.currentSlideIndex,
        currentTitle,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        connected: false,
        error: err instanceof Error ? err.message : 'Błąd połączenia',
      }));
    }
  }, []);

  const scheduleRefresh = useCallback((delays: number[]) => {
    delays.forEach((delay) => {
      setTimeout(() => {
        refreshData().catch(() => {});
      }, delay);
    });
  }, [refreshData]);

  // Poll loop for v2
  useEffect(() => {
    if (!polling) return;
    
    let active = true;
    const interval = setInterval(async () => {
      if (!active || !pollingRef.current) return;
      const c = configRef.current;
      if (c.version !== 'v2') return;

      try {
        const poll = await pollOpenLp(c);
        consecutiveErrors.current = 0;
        
        // Determine display mode
        let mode: LANState['displayMode'] = 'show';
        if (poll.blank) mode = 'blank';
        else if (poll.display) mode = 'desktop';
        else if (poll.theme) mode = 'theme';

        // If service changed or item changed, refresh full data
        if (poll.service !== lastServiceVersion.current || poll.item !== lastItemUid.current) {
          lastServiceVersion.current = poll.service;
          lastItemUid.current = poll.item;
          await refreshData(c);
        }

        setState(prev => {
          const pollServiceIndex = Number(poll.service);
          const hasServiceIndex = Number.isFinite(pollServiceIndex) && pollServiceIndex >= 0;

          return {
            ...prev,
            connected: true,
            error: null,
            currentSlideIndex: poll.slide,
            currentServiceIndex: hasServiceIndex ? pollServiceIndex : prev.currentServiceIndex,
            displayMode: mode,
          };
        });
      } catch {
        consecutiveErrors.current++;
        if (consecutiveErrors.current >= MAX_ERRORS) {
          console.warn(`[LAN] ${MAX_ERRORS} consecutive errors — pausing polling`);
          setPolling(false);
          setPaused(true);
          setState(prev => ({
            ...prev,
            connected: false,
            error: `Utracono połączenie z OpenLP (${MAX_ERRORS} błędów). Kliknij „Połącz ponownie".`,
          }));
          return;
        }
        setState(prev => ({
          ...prev,
          connected: false,
          error: 'Brak odpowiedzi z OpenLP',
        }));
      }
    }, 1000);

    return () => { active = false; clearInterval(interval); };
  }, [polling, refreshData]);

  // Connect / disconnect
  const connect = useCallback(async () => {
    setState(prev => ({ ...prev, error: null }));
    consecutiveErrors.current = 0;
    setPaused(false);
    try {
      await refreshData();
      setPolling(true);
    } catch (err) {
      setState(prev => ({
        ...prev,
        connected: false,
        error: err instanceof Error ? err.message : 'Nie można połączyć',
      }));
    }
  }, [refreshData]);

  const disconnect = useCallback(() => {
    setPolling(false);
    setState({
      connected: false,
      error: null,
      serviceItems: [],
      slides: [],
      currentSlideIndex: -1,
      currentServiceIndex: -1,
      displayMode: 'show',
      currentTitle: '',
    });
  }, []);

  // Actions
  const nextSlide = useCallback(async () => {
    try {
      await controllerNext(configRef.current);
      scheduleRefresh([180, 650]);
    } catch {}
  }, [scheduleRefresh]);

  const prevSlide = useCallback(async () => {
    try {
      await controllerPrevious(configRef.current);
      scheduleRefresh([180, 650]);
    } catch {}
  }, [scheduleRefresh]);

  const goToSlide = useCallback(async (index: number) => {
    try {
      await controllerGoToSlide(configRef.current, index);
      scheduleRefresh([180, 650]);
    } catch {}
  }, [scheduleRefresh]);

  const goToServiceItem = useCallback(async (index: number) => {
    try {
      await serviceGoToItem(configRef.current, index, stateRef.current.serviceItems);
      scheduleRefresh([260, 800, 1500]);
    } catch {}
  }, [scheduleRefresh]);

  const localNextServiceItem = useCallback(async () => {
    try {
      await serviceNext(configRef.current);
      scheduleRefresh([260, 800, 1500]);
    } catch {}
  }, [scheduleRefresh]);

  const localPrevServiceItem = useCallback(async () => {
    try {
      await servicePrevious(configRef.current);
      scheduleRefresh([260, 800, 1500]);
    } catch {}
  }, [scheduleRefresh]);

  const toggleDisplay = useCallback(async () => {
    const newMode = stateRef.current.displayMode === 'blank' ? 'show' : 'blank';
    try {
      await setDisplayMode(configRef.current, newMode);
      setState(prev => ({ ...prev, displayMode: newMode }));
      scheduleRefresh([250, 700]);
    } catch {}
  }, [scheduleRefresh]);

  // ─── Bridge: handle commands from remote controllers ───
  // Use refs for state values to keep callback stable
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const handleLanCommand = useCallback(async (cmd: LANCommand) => {
    const currentState = stateRef.current;
    if (!currentState.connected) return;
    console.log(`[LAN Bridge] Executing command: ${cmd.type}`, cmd.index);

    const refreshByCommand = (type: LANCommandType) => {
      if (type === 'addSong') return [450, 1000, 1700, 2600, 3600];
      if (type === 'removeItem') return [350, 900, 1600, 2600];
      if (type === 'goToItem' || type === 'nextItem' || type === 'prevItem') return [220, 700, 1500];
      return [180, 650];
    };

    try {
      switch (cmd.type) {
        case 'next':
          await controllerNext(configRef.current);
          break;
        case 'prev':
          await controllerPrevious(configRef.current);
          break;
        case 'nextItem':
          await serviceNext(configRef.current);
          break;
        case 'prevItem':
          await servicePrevious(configRef.current);
          break;
        case 'goToSlide':
          if (cmd.index !== undefined) await controllerGoToSlide(configRef.current, cmd.index);
          break;
        case 'goToItem':
          if (cmd.index !== undefined) await serviceGoToItem(configRef.current, cmd.index, currentState.serviceItems);
          break;
        case 'toggleBlank': {
          const newMode = currentState.displayMode === 'blank' ? 'show' : 'blank';
          await setDisplayMode(configRef.current, newMode);
          setState(prev => ({ ...prev, displayMode: newMode }));
          break;
        }
        case 'refresh':
          break;
        case 'removeItem': {
          if (cmd.index !== undefined) {
            await serviceRemoveItem(configRef.current, cmd.index);
          }
          break;
        }
        case 'addSong': {
          if (cmd.title?.trim()) {
            const added = await searchAndAddSong(configRef.current, cmd.title.trim());
            if (!added) {
              console.warn('[LAN Bridge] Song not found in OpenLP:', cmd.title);
            }
          }
          break;
        }
      }

      scheduleRefresh(refreshByCommand(cmd.type));
    } catch (err) {
      console.error('[LAN Bridge] Command failed:', err);
      scheduleRefresh([300, 1100]);
    }
  }, [scheduleRefresh]); // stable — uses stateRef internally

  // ─── Remote LAN state received from bridge (for remote controllers) ───
  const [remoteLanState, setRemoteLanState] = useState<LANBridgeState | null>(null);
  const lastLanStateTime = useRef<number>(0);

  const handleLanStateReceived = useCallback((lanState: LANBridgeState) => {
    lastLanStateTime.current = Date.now();
    setRemoteLanState(lanState);
  }, []);

  // Timeout: jeśli bridge nie wysyła stanu przez 8s, oznacz jako rozłączony
  useEffect(() => {
    if (bridgeMode) return; // bridge nie potrzebuje tego
    const timer = setInterval(() => {
      if (lastLanStateTime.current > 0 && Date.now() - lastLanStateTime.current > 8000) {
        setRemoteLanState(prev => prev ? { ...prev, connected: false } : null);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [bridgeMode]);

  // ─── Sync hook: bridge mode uses onLanCommandReceived, remote uses onLanStateReceived ───
  const lanSync = useProjectorSync(
    'controller',
    undefined,
    undefined,
    bridgeMode ? handleLanCommand : undefined,
    !bridgeMode ? handleLanStateReceived : undefined,
    'lan',
  );

  // ─── Bridge: broadcast state whenever it changes ───
  useEffect(() => {
    if (!bridgeMode || !state.connected) return;
    const bridgeState = lanStateTobridge(state, bridgeId.current);
    lanSync.sendLanState(bridgeState);
  }, [bridgeMode, state, lanSync]);

  const nextServiceItem = useCallback(async () => {
    if (state.connected) {
      await localNextServiceItem();
      return;
    }
    if (remoteLanState?.connected) {
      await lanSync.sendLanCommand('nextItem');
    }
  }, [lanSync, localNextServiceItem, remoteLanState?.connected, state.connected]);

  const prevServiceItem = useCallback(async () => {
    if (state.connected) {
      await localPrevServiceItem();
      return;
    }
    if (remoteLanState?.connected) {
      await lanSync.sendLanCommand('prevItem');
    }
  }, [lanSync, localPrevServiceItem, remoteLanState?.connected, state.connected]);

  const currentSlideText = state.slides[state.currentSlideIndex]?.text ?? '';
  const currentSlideTag = state.slides[state.currentSlideIndex]?.tag ?? '';

  return {
    config,
    setConfig,
    state,
    polling,
    paused,
    connect,
    disconnect,
    nextSlide,
    prevSlide,
    goToSlide,
    goToServiceItem,
    nextServiceItem,
    prevServiceItem,
    toggleDisplay,
    refreshData,
    currentSlideText,
    currentSlideTag,
    // Bridge
    bridgeMode,
    setBridgeMode,
    lanSync,
    remoteLanState,
  };
}
