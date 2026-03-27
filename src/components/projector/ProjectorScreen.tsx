import { useEffect, useState, useRef, useCallback } from 'react';
import { useProjectorSync, type ProjectorSyncState, type ProjectorSyncSettings } from '@/hooks/useProjectorSync';
import { getProjectorSettings, getResolvedTextColor } from '@/lib/projectorSettings';
import { sanitizeFormattedText } from '@/lib/textFormatting';
import { CHURCH_PRESET } from '@/lib/projectorLayout';

const PROJECTOR_STATE_KEY = 'organista_projector_state';

function AutoFitText({ text, textColor, strokeWidth, fontSizePx, shadowIntensity }: { 
  text: string; textColor: string; strokeWidth: number; fontSizePx: number; shadowIntensity: number;
}) {
  const fontSizeVh = (fontSizePx / CHURCH_PRESET.resolution.height) * 100;
  const strokeVh = (strokeWidth / CHURCH_PRESET.resolution.height) * 100;
  const shadowOpacity = shadowIntensity / 10;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <p
        lang="pl"
        style={{
          color: textColor,
          fontFamily: CHURCH_PRESET.fontFamily,
          fontWeight: CHURCH_PRESET.fontWeight,
          fontSize: `${fontSizeVh}vh`,
          textAlign: CHURCH_PRESET.textAlign,
          lineHeight: CHURCH_PRESET.lineHeight,
          whiteSpace: CHURCH_PRESET.whiteSpace as any,
          textTransform: CHURCH_PRESET.textTransform as any,
          hyphens: CHURCH_PRESET.hyphens as any,
          WebkitHyphens: CHURCH_PRESET.hyphens as any,
          wordBreak: CHURCH_PRESET.wordBreak as any,
          overflowWrap: CHURCH_PRESET.overflowWrap as any,
          textShadow: `0 2px 10px rgba(0,0,0,${shadowOpacity})`,
          WebkitTextStroke: `${strokeVh}vh ${CHURCH_PRESET.strokeColor}`,
          letterSpacing: `${CHURCH_PRESET.letterSpacingEm}em`,
          maxWidth: `${CHURCH_PRESET.textWidthPercent}%`,
          width: `${CHURCH_PRESET.textWidthPercent}%`,
          padding: 0,
          margin: 0,
        }}
      >
        {text.includes('<') ? (
          <span dangerouslySetInnerHTML={{ __html: sanitizeFormattedText(text).replace(/\n/g, '<br/>') }} />
        ) : (
          text
        )}
      </p>
    </div>
  );
}

export function ProjectorScreen() {
  const [text, setText] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [connected, setConnected] = useState(false);
  const [textColor, setTextColor] = useState(() => getResolvedTextColor(getProjectorSettings()));
  const [fontSize, setFontSize] = useState(() => getProjectorSettings().fontSize);
  const [bgColor, setBgColor] = useState(() => getProjectorSettings().background);
  const [shadowIntensity, setShadowIntensity] = useState(() => getProjectorSettings().shadowIntensity);
  const [strokeWidth, setStrokeWidth] = useState(() => getProjectorSettings().strokeWidth);
  const [rotation, setRotation] = useState(() => getProjectorSettings().rotation);
  const [offsetX, setOffsetX] = useState(() => getProjectorSettings().offsetX ?? 0);
  const [offsetY, setOffsetY] = useState(() => getProjectorSettings().offsetY ?? 0);
  const [scale, setScale] = useState(() => getProjectorSettings().scale ?? 1);

  // Listen for settings changes (poll + storage event for cross-tab)
  useEffect(() => {
    const sync = () => {
      const s = getProjectorSettings();
      setTextColor(getResolvedTextColor(s));
      setStrokeWidth(s.strokeWidth);
      setRotation(s.rotation);
      setFontSize(s.fontSize);
      setBgColor(s.background);
      setShadowIntensity(s.shadowIntensity);
      setOffsetX(s.offsetX ?? 0);
      setOffsetY(s.offsetY ?? 0);
      setScale(s.scale ?? 1);
    };
    window.addEventListener('projector-settings-changed', sync);
    window.addEventListener('storage', (e) => {
      if (e.key === 'organista_projector_settings') sync();
    });
    const poll = setInterval(sync, 200);
    return () => {
      window.removeEventListener('projector-settings-changed', sync);
      clearInterval(poll);
    };
  }, []);

  // Check URL params
  const urlParams = new URLSearchParams(window.location.search);
  const urlRoom = urlParams.get('room');
  const isTestMode = urlParams.get('test') === 'true';

  // Test mode — fill entire screen edge-to-edge
  const testText = "1. Cóż Ci Jezu damy za\nTwych łask strumienie? Z\nserca Ci składamy korne\ndziękczynienie.\nRef.: Panie nasz, króluj nam!\nBoże nasz, Króluj nam!\nPoprzez wieczny czas króluj\nJezu nam.";

  // Sync — receives state from controller via WebSocket (LAN) or Realtime (Internet)
  const handleSyncState = useCallback((state: ProjectorSyncState) => {
    setText(state.text || '');
    setIsLive(state.isLive || false);
    setConnected(true);
    // Apply visual settings from remote controller
    if (state.settings) {
      const s = state.settings;
      if (s.textColor) setTextColor(s.textColor);
      if (s.fontSize) setFontSize(s.fontSize);
      if (s.strokeWidth !== undefined) setStrokeWidth(s.strokeWidth);
      if (s.background) setBgColor(s.background);
      if (s.shadowIntensity !== undefined) setShadowIntensity(s.shadowIntensity);
      if (s.rotation !== undefined) setRotation(s.rotation);
      if (s.offsetX !== undefined) setOffsetX(s.offsetX);
      if (s.offsetY !== undefined) setOffsetY(s.offsetY);
      if (s.scale !== undefined) setScale(s.scale);
    }
  }, []);

  const { connected: syncConnected, roomId, changeRoom } = useProjectorSync('display', handleSyncState);

  // If URL has room param, use it
  useEffect(() => {
    if (urlRoom && urlRoom !== roomId) {
      changeRoom(urlRoom);
    }
  }, [urlRoom, roomId, changeRoom]);

  useEffect(() => {
    // postMessage from window.opener (same-device)
    const messageHandler = (e: MessageEvent) => {
      if (e.data?.type === 'STATE_UPDATE' && e.data.state) {
        setText(e.data.state.text || '');
        setIsLive(e.data.state.isLive || false);
        setConnected(true);
      }
    };
    window.addEventListener('message', messageHandler);

    // Ping opener for same-device
    const pingOpener = () => {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'PROJECTOR_READY' }, '*');
      }
    };
    pingOpener();
    const pingInterval = setInterval(pingOpener, 500);

    // localStorage fallback
    const pollLocalStorage = () => {
      try {
        const stored = localStorage.getItem(PROJECTOR_STATE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setText(parsed.text || '');
          setIsLive(parsed.isLive || false);
          setConnected(true);
        }
      } catch {}
    };
    pollLocalStorage();
    const pollInterval = setInterval(pollLocalStorage, 300);

    const storageHandler = (e: StorageEvent) => {
      if (e.key === PROJECTOR_STATE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setText(parsed.text || '');
          setIsLive(parsed.isLive || false);
          setConnected(true);
        } catch {}
      }
    };
    window.addEventListener('storage', storageHandler);

    return () => {
      clearInterval(pingInterval);
      clearInterval(pollInterval);
      window.removeEventListener('message', messageHandler);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const autoFs = params.get('autofs') === '1';

    const tryFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen({ navigationUI: 'hide' } as any).catch(() => {});
      }
    };

    if (autoFs) {
      // Try immediately (may work if opened via Window Management API with user gesture)
      tryFullscreen();
      setTimeout(tryFullscreen, 200);
      setTimeout(tryFullscreen, 500);
    }

    // Always: enter fullscreen on first user interaction (most reliable cross-browser)
    const enterOnInteraction = (e: Event) => {
      tryFullscreen();
      // Remove all listeners after first successful attempt
      setTimeout(() => {
        if (document.fullscreenElement) {
          window.removeEventListener('click', enterOnInteraction);
          window.removeEventListener('pointerdown', enterOnInteraction);
          window.removeEventListener('keydown', enterOnInteraction);
        }
      }, 100);
    };
    window.addEventListener('click', enterOnInteraction);
    window.addEventListener('pointerdown', enterOnInteraction);
    window.addEventListener('keydown', enterOnInteraction);

    // Auto-click trick: simulate a click after window is positioned
    // This works because the window was opened by a user gesture (button click)
    if (autoFs) {
      setTimeout(() => {
        if (!document.fullscreenElement) {
          // Dispatch a trusted-like click to trigger fullscreen
          const el = document.documentElement;
          el.click();
        }
      }, 400);
    }

    return () => {
      window.removeEventListener('click', enterOnInteraction);
      window.removeEventListener('pointerdown', enterOnInteraction);
      window.removeEventListener('keydown', enterOnInteraction);
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F' || e.key === 'F11') {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: bgColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: CHURCH_PRESET.containerPadding,
        transform: [
          rotation !== 0 ? `rotate(${rotation}deg)` : '',
          scale !== 1 ? `scale(${scale})` : '',
          (offsetX !== 0 || offsetY !== 0) ? `translate(${offsetX}px, ${offsetY}px)` : '',
        ].filter(Boolean).join(' ') || undefined,
      }}
    >
      {isTestMode ? (
        <AutoFitText text={testText} textColor={textColor} strokeWidth={strokeWidth} fontSizePx={fontSize} shadowIntensity={shadowIntensity} />
      ) : isLive && text ? (
        <AutoFitText text={text} textColor={textColor} strokeWidth={strokeWidth} fontSizePx={fontSize} shadowIntensity={shadowIntensity} />
      ) : !connected && !syncConnected ? (
        <div style={{ textAlign: 'center', color: '#555' }}>
          <p style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>🎵 Ekran projekcji</p>
          <p style={{ fontSize: '0.9rem' }}>Oczekiwanie na połączenie z dashboardem...</p>
          <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
            Użyj przycisku „Otwórz okno projekcji" w dashboardzie
          </p>
          <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: '#666' }}>
            💡 Aby sterować z innego urządzenia, otwórz dashboard na<br/>
            <code style={{ background: '#222', padding: '2px 8px', borderRadius: 4 }}>
              http://[IP_KOMPUTERA]:8080
            </code>
          </p>
          <p style={{ fontSize: '0.7rem', marginTop: '1rem', color: '#444' }}>
            Kliknij gdziekolwiek aby przejść na pełny ekran (lub naciśnij F)
          </p>
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: '#333' }}>
          <p style={{ fontSize: '0.8rem' }}>
            {!isLive ? '⏸ Ekran wstrzymany — kliknij „Pokaż ekran" w dashboardzie' : ''}
          </p>
        </div>
      )}
    </div>
  );
}
