import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Monitor, MonitorSmartphone, ExternalLink, Info, ChevronDown, ChevronUp } from 'lucide-react';

export interface ScreenInfo {
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
  isPrimary: boolean;
  screenDetail?: ScreenDetailed;
}

interface ScreenPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (screen: ScreenInfo | null) => void;
}

// Extend Window type for Window Management API
declare global {
  interface Window {
    getScreenDetails?: () => Promise<ScreenDetails>;
  }
  interface ScreenDetails {
    screens: ScreenDetailed[];
    currentScreen: ScreenDetailed;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  }
  interface ScreenDetailed extends Screen {
    left: number;
    top: number;
    isPrimary: boolean;
    label: string;
    isInternal: boolean;
    devicePixelRatio: number;
  }
}

export function ScreenPickerDialog({ open, onOpenChange, onSelect }: ScreenPickerDialogProps) {
  const [screens, setScreens] = useState<ScreenInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiSupported, setApiSupported] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const detectScreens = useCallback(async () => {
    if (!window.getScreenDetails) {
      setApiSupported(false);
      setScreens([{
        label: 'Ekran główny',
        left: 0,
        top: 0,
        width: window.screen.availWidth,
        height: window.screen.availHeight,
        isPrimary: true,
      }]);
      return;
    }

    setLoading(true);
    setPermissionDenied(false);
    try {
      // This call triggers the browser permission prompt if not yet granted
      const details = await window.getScreenDetails();
      const mapped: ScreenInfo[] = details.screens.map((s, i) => ({
        label: s.label || `Ekran ${i + 1}`,
        left: s.left,
        top: s.top,
        width: s.width,
        height: s.height,
        isPrimary: s.isPrimary,
        screenDetail: s,
      }));
      setScreens(mapped);
    } catch (e: any) {
      console.warn('Screen detection failed:', e);
      // Check if user denied the permission
      if (e?.name === 'NotAllowedError') {
        setPermissionDenied(true);
      }
      setApiSupported(false);
      setScreens([{
        label: 'Ekran główny',
        left: 0,
        top: 0,
        width: window.screen.availWidth,
        height: window.screen.availHeight,
        isPrimary: true,
      }]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) detectScreens();
  }, [open, detectScreens]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="w-5 h-5" />
            Wybierz ekran projekcji
          </DialogTitle>
          <DialogDescription>
            {apiSupported
              ? 'Wybierz monitor, na którym chcesz wyświetlić projekcję. Okno otworzy się automatycznie w trybie pełnoekranowym.'
              : 'Twoja przeglądarka nie wspiera wykrywania wielu ekranów. Projekcja otworzy się na bieżącym ekranie.'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Wykrywanie ekranów…</div>
          ) : (
            <>
              {screens.map((screen, i) => (
                <button
                  key={i}
                  onClick={() => { onSelect(screen); onOpenChange(false); }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 hover:border-primary/50 transition-colors text-left group"
                >
                  <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                    {screen.isPrimary
                      ? <MonitorSmartphone className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
                      : <Monitor className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground flex items-center gap-2">
                      {screen.label}
                      {screen.isPrimary && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold uppercase">Główny</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {screen.width} × {screen.height}px
                      {screens.length > 1 && ` · pozycja (${screen.left}, ${screen.top})`}
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
                </button>
              ))}

              {/* Permission help — always show when API not supported or denied */}
              {(!apiSupported || permissionDenied) && screens.length <= 1 && (
                <PermissionHelpBox permissionDenied={permissionDenied} onRetry={detectScreens} />
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PermissionHelpBox({ permissionDenied, onRetry }: { permissionDenied: boolean; onRetry: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const isChrome = /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent);
  const isEdge = /Edg/.test(navigator.userAgent);
  const isSafari = /Safari/.test(navigator.userAgent) && !isChrome && !isEdge;
  const browserName = isEdge ? 'Edge' : isChrome ? 'Chrome' : isSafari ? 'Safari' : 'przeglądarce';

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground">
            {permissionDenied
              ? '⚠️ Brak uprawnienia do zarządzania oknami'
              : `Wykrywanie ekranów niedostępne w ${browserName}`
            }
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {permissionDenied
              ? 'Odmówiłeś dostępu. Włącz go ręcznie, aby automatycznie otwierać fullscreen na drugim monitorze.'
              : isSafari
                ? 'Safari nie wspiera Window Management API. Użyj Chrome lub Edge do obsługi wielu ekranów.'
                : 'Zezwól na zarządzanie oknami, aby automatycznie otwierać projekcję w trybie pełnoekranowym na wybranym monitorze.'
            }
          </p>
        </div>
      </div>

      {!isSafari && (
        <>
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Zwiń instrukcję' : 'Jak nadać uprawnienie?'}
          </button>

          {expanded && (
            <div className="rounded-md border border-border bg-background p-2.5 space-y-2 text-[11px] text-foreground">
              <p className="font-semibold text-xs">Instrukcja dla {isEdge ? 'Microsoft Edge' : 'Google Chrome'}:</p>

              <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
                <li>
                  Kliknij ikonę <span className="inline-flex items-center gap-0.5 font-medium text-foreground">🔒 kłódki</span> (lub <span className="font-medium text-foreground">ⓘ</span>) w <span className="font-medium text-foreground">pasku adresu</span>
                </li>
                <li>
                  Wybierz <span className="font-medium text-foreground">„Ustawienia witryny"</span> {isEdge ? '(Site settings)' : '(Site settings)'}
                </li>
                <li>
                  Znajdź <span className="font-medium text-foreground">„Zarządzanie oknami"</span> {isEdge ? '(Window management)' : '(Window management)'}
                </li>
                <li>
                  Zmień na <span className="font-medium text-primary">„Zezwalaj"</span>
                </li>
                <li>
                  <span className="font-medium text-foreground">Odśwież stronę</span> (F5)
                </li>
              </ol>

              <div className="border-t border-border pt-2 mt-2">
                <p className="text-muted-foreground">Alternatywnie wpisz w pasku adresu:</p>
                <code className="block mt-1 px-2 py-1 rounded bg-muted text-[10px] font-mono text-foreground select-all break-all">
                  {isEdge ? 'edge' : 'chrome'}://settings/content/windowManagement
                </code>
                <p className="text-muted-foreground mt-1">i dodaj adres tej strony do listy „Zezwalaj".</p>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2 text-xs"
                onClick={onRetry}
              >
                🔄 Spróbuj ponownie wykryć ekrany
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
