import { useState, useMemo, useCallback } from 'react';
import { ClipboardPaste, Download, FileText, X, MonitorPlay, ToggleLeft, ToggleRight, Smartphone, CloudDownload, CheckCircle2, Layout, LayoutGrid, Clock, RefreshCw } from 'lucide-react';
import { SyncStatusIndicator } from '@/components/ui/SyncStatusIndicator';
import { fetchSetting, saveSetting } from '@/lib/settingsSync';
import { parseScheduleCSV } from '@/lib/csvParser';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { prefetchLiturgyRange } from '@/lib/liturgyCache';
import { BackupManager } from './BackupManager';

import { supabase } from '@/integrations/supabase/client';

const MODULES_KEY = 'organista_modules';

export type ActiveRemote = 'projector' | 'projectorLAN' | 'projectorLANRemote' | null;

export type ViewMode = 'simple' | 'all' | 'complex';

export interface ModuleSettings {
  projectorEnabled: boolean;
  projectorLANEnabled: boolean;
  projectorLANRemoteEnabled: boolean;
  activeRemote?: ActiveRemote;
  viewMode?: ViewMode;
  songsSyncEnabled?: boolean;
}

export function getModuleSettings(): ModuleSettings {
  try {
    const stored = localStorage.getItem(MODULES_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { projectorEnabled: true, projectorLANEnabled: false, projectorLANRemoteEnabled: false, activeRemote: null };
}

function saveModuleSettings(settings: ModuleSettings) {
  localStorage.setItem(MODULES_KEY, JSON.stringify(settings));
  // Sync to server (fire-and-forget)
  supabase
    .from('app_settings' as any)
    .upsert(
      { key: 'module_settings', value: settings as any, updated_at: new Date().toISOString() } as any,
      { onConflict: 'key' }
    )
    .select()
    .then(() => undefined, () => undefined);
}

/** Fetch module settings from server (call on app start) */
export async function syncModuleSettingsFromServer(): Promise<ModuleSettings | null> {
  try {
    const result = await Promise.race([
      supabase
        .from('app_settings' as any)
        .select('value')
        .eq('key', 'module_settings')
        .maybeSingle(),
      new Promise<{ data: null; error: { message: string } }>(resolve =>
        setTimeout(() => resolve({ data: null, error: { message: 'timeout' } }), 3000)
      ),
    ]);
    const { data, error } = result;
    if (error || !data) return null;
    const val = (data as any).value;
    if (val && typeof val === 'object') {
      // Merge with local (server wins)
      localStorage.setItem(MODULES_KEY, JSON.stringify(val));
      return val as ModuleSettings;
    }
  } catch {}
  return null;
}

interface SettingsPanelProps {
  onImport: (text: string) => number;
  moduleSettings: ModuleSettings;
  onModuleSettingsChange: (s: ModuleSettings) => void;
  onRestoreBackup?: (songs: any[]) => void;
}

function LiturgyPrefetchCard() {
  const [prefetching, setPrefetching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<string | null>(null);

  const handlePrefetch = useCallback(async () => {
    setPrefetching(true);
    setProgress(0);
    setResult(null);
    try {
      const fetched = await prefetchLiturgyRange(7, (done, total) => {
        setProgress(Math.round((done / total) * 100));
      });
      setResult(fetched > 0 ? `Pobrano ${fetched} nowych zestawów danych` : 'Wszystkie dane są aktualne');
      setTimeout(() => setResult(null), 5000);
    } catch {
      setResult('Błąd pobierania danych');
    } finally {
      setPrefetching(false);
    }
  }, []);

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border/50">
        <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
          <CloudDownload className="w-5 h-5 text-primary" />
          Pobieranie danych liturgicznych
        </h2>
      </div>
      <div className="p-5 space-y-3">
        <p className="text-sm text-muted-foreground">
          Pobierz pieśni, czytania i kartkę na najbliższe 7 dni, aby otwierały się natychmiast.
        </p>
        {prefetching && (
          <Progress value={progress} className="h-2" />
        )}
        {result && (
          <div className="flex items-center gap-2 text-sm font-medium text-emerald">
            <CheckCircle2 className="w-4 h-4" />
            {result}
          </div>
        )}
        <Button
          onClick={handlePrefetch}
          disabled={prefetching}
          className="w-full"
        >
          <CloudDownload className={`w-4 h-4 ${prefetching ? 'animate-pulse' : ''}`} />
          {prefetching ? `Pobieranie... ${progress}%` : 'Pobierz dane na 7 dni'}
        </Button>
      </div>
    </div>
  );
}

function SyncCard({ moduleSettings, onModuleSettingsChange }: { moduleSettings: ModuleSettings; onModuleSettingsChange: (s: ModuleSettings) => void }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleForceSync = useCallback(async () => {
    setSyncing(true);
    setResult(null);
    let pulled = 0;
    let pushed = 0;

    try {
      // 1. Module settings
      const serverModules = await fetchSetting<ModuleSettings>('module_settings');
      if (serverModules && typeof serverModules === 'object') {
        const merged = { ...moduleSettings, ...serverModules };
        localStorage.setItem('organista_modules', JSON.stringify(merged));
        onModuleSettingsChange(merged);
        pulled++;
      } else {
        await saveSetting('module_settings', moduleSettings);
        pushed++;
      }

      // 2. Schedule
      const serverSchedule = await fetchSetting<any>('schedule_data');
      if (serverSchedule?.entries?.length > 0) {
        localStorage.setItem('orgSched5', JSON.stringify(serverSchedule.entries));
        if (serverSchedule.csv) localStorage.setItem('orgSchedCsv', serverSchedule.csv);
        if (serverSchedule.holidays) localStorage.setItem('orgSchedCsvHolidays', JSON.stringify(serverSchedule.holidays));
        pulled++;
      } else {
        try {
          const local = JSON.parse(localStorage.getItem('orgSched5') || '[]');
          if (local.length > 0) {
            await saveSetting('schedule_data', {
              entries: local,
              csv: localStorage.getItem('orgSchedCsv') || '',
              holidays: JSON.parse(localStorage.getItem('orgSchedCsvHolidays') || '[]'),
              updatedAt: new Date().toISOString(),
            });
            pushed++;
          }
        } catch {}
      }

      // 3. Projector settings
      const serverPS = await fetchSetting<any>('projector_settings');
      if (serverPS?.fontSize) {
        localStorage.setItem('organista_projector_settings', JSON.stringify(serverPS));
        pulled++;
      } else {
        const localPS = localStorage.getItem('organista_projector_settings');
        if (localPS) {
          await saveSetting('projector_settings', JSON.parse(localPS));
          pushed++;
        }
      }

      // 4. Projector playlist
      const serverPL = await fetchSetting<any>('projector_playlist');
      if (serverPL?.playlist?.length > 0) {
        localStorage.setItem('organista_projector_playlist', JSON.stringify(serverPL));
        pulled++;
      }

      // 5. Announcements
      const serverAnn = await fetchSetting<any>('parish_announcements');
      if (serverAnn?.fetchedAt) {
        localStorage.setItem('parishAnnouncements', JSON.stringify(serverAnn));
        pulled++;
      }

      setResult(`Pobrano ${pulled} · wysłano ${pushed} zestawów danych — odświeżam...`);
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setResult('Błąd synchronizacji');
      setTimeout(() => setResult(null), 5000);
    } finally {
      setSyncing(false);
    }
  }, [moduleSettings, onModuleSettingsChange]);

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-foreground">Synchronizacja</h2>
        <SyncStatusIndicator size="md" />
      </div>
      <div className="px-5 pb-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Grafik, playlista rzutnika, ustawienia i ogłoszenia są synchronizowane między urządzeniami.
        </p>
        {result && (
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <CheckCircle2 className="w-4 h-4" />
            {result}
          </div>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              disabled={syncing}
              variant="outline"
              className="w-full"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Synchronizuję...' : 'Wymuś synchronizację'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Wymusić synchronizację?</AlertDialogTitle>
              <AlertDialogDescription>
                Dane lokalne zostaną nadpisane danymi z serwera (lub odwrotnie, jeśli serwer nie ma nowszych danych). Tej operacji nie można cofnąć.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Anuluj</AlertDialogCancel>
              <AlertDialogAction onClick={handleForceSync}>Synchronizuj</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export function SettingsPanel({ onImport, moduleSettings, onModuleSettingsChange, onRestoreBackup }: SettingsPanelProps) {
  const [paste, setPaste] = useState('');
  const preview = useMemo(() => paste.trim().length > 5 ? parseScheduleCSV(paste) : null, [paste]);

  const handleImport = () => {
    const count = onImport(paste);
    if (count > 0) setPaste('');
  };

  const toggleModule = (key: keyof Omit<ModuleSettings, 'activeRemote'>) => {
    const updated = { ...moduleSettings, [key]: !moduleSettings[key] };
    // If enabling one LAN module, disable the other
    if (updated[key]) {
      if (key === 'projectorLANEnabled' && updated.projectorLANRemoteEnabled) {
        updated.projectorLANRemoteEnabled = false;
        if (updated.activeRemote === 'projectorLANRemote') updated.activeRemote = null;
      }
      if (key === 'projectorLANRemoteEnabled' && updated.projectorLANEnabled) {
        updated.projectorLANEnabled = false;
        if (updated.activeRemote === 'projectorLAN') updated.activeRemote = null;
      }
    }
    // If disabling a module that has active remote, clear the remote
    if (!updated[key]) {
      const remoteMap: Record<string, ActiveRemote> = {
        projectorEnabled: 'projector',
        projectorLANEnabled: 'projectorLAN',
        projectorLANRemoteEnabled: 'projectorLANRemote',
      };
      if (moduleSettings.activeRemote === remoteMap[key]) {
        updated.activeRemote = null;
      }
    }
    saveModuleSettings(updated);
    onModuleSettingsChange(updated);
  };

  const toggleRemote = (remote: ActiveRemote) => {
    const updated = { ...moduleSettings, activeRemote: moduleSettings.activeRemote === remote ? null : remote };
    saveModuleSettings(updated);
    onModuleSettingsChange(updated);
  };

  return (
    <div className="animate-fade-in space-y-4">
      {/* Sync status */}
      <SyncCard moduleSettings={moduleSettings} onModuleSettingsChange={onModuleSettingsChange} />

      {/* View mode toggle */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50">
          <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
            <Layout className="w-5 h-5 text-primary" />
            Widok
          </h2>
        </div>
        <div className="p-5 space-y-2">
          {([
            { mode: 'simple' as const, label: 'Prosty', desc: 'Dashboard z ikonkami modułów', Icon: LayoutGrid },
            { mode: 'all' as const, label: 'ALL', desc: 'Rozwijane karty z podglądem — bez paska', Icon: Layout },
            { mode: 'complex' as const, label: 'Złożony', desc: 'Pasek zakładek z pełną nawigacją', Icon: Layout },
          ]).map(({ mode, label, desc, Icon }) => {
            const isActive = (moduleSettings.viewMode ?? 'complex') === mode;
            return (
              <button
                key={mode}
                onClick={() => {
                  const updated = { ...moduleSettings, viewMode: mode };
                  saveModuleSettings(updated);
                  onModuleSettingsChange(updated);
                }}
                className={`w-full flex items-center justify-between rounded-lg border px-4 py-3 transition-colors ${isActive ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/30'}`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="text-left">
                    <p className={`text-sm font-medium ${isActive ? 'text-primary' : 'text-foreground'}`}>{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
                {isActive && <ToggleRight className="w-8 h-8 text-primary" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Module toggles */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50">
          <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
            <MonitorPlay className="w-5 h-5 text-primary" />
            Moduły
          </h2>
        </div>
        <div className="p-5 space-y-3">
          {/* Rzutnik */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleModule('projectorEnabled')}
              className="flex-1 flex items-center justify-between rounded-lg border border-border px-4 py-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <MonitorPlay className="w-5 h-5 text-primary" />
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">Rzutnik</p>
                  <p className="text-xs text-muted-foreground">Własna projekcja z bazy pieśni</p>
                </div>
              </div>
              {moduleSettings.projectorEnabled
                ? <ToggleRight className="w-8 h-8 text-success" />
                : <ToggleLeft className="w-8 h-8 text-muted-foreground" />
              }
            </button>
            {moduleSettings.projectorEnabled && (
              <button
                onClick={() => toggleRemote('projector')}
                className={`p-3 rounded-lg border transition-colors ${moduleSettings.activeRemote === 'projector' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/30'}`}
                title="Pilot dla tego rzutnika"
              >
                <Smartphone className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Songs sync toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const updated = { ...moduleSettings, songsSyncEnabled: !(moduleSettings.songsSyncEnabled ?? true) };
                saveModuleSettings(updated);
                onModuleSettingsChange(updated);
              }}
              className="flex-1 flex items-center justify-between rounded-lg border border-border px-4 py-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <CloudDownload className="w-5 h-5 text-primary" />
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">Sync pieśni do chmury</p>
                  <p className="text-xs text-muted-foreground">Auto-upload bazy pieśni na serwer</p>
                </div>
              </div>
              {(moduleSettings.songsSyncEnabled ?? true)
                ? <ToggleRight className="w-8 h-8 text-success" />
                : <ToggleLeft className="w-8 h-8 text-muted-foreground" />
              }
            </button>
          </div>
        </div>
      </div>

      {/* Liturgy prefetch */}
      <LiturgyPrefetchCard />

      {/* Song backups */}
      {onRestoreBackup && <BackupManager onRestore={onRestoreBackup} />}

      {/* Saturday switch hour */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50">
          <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber" />
            Przełączenie sobota → niedziela
          </h2>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-muted-foreground">
            Od której godziny w sobotę grafik pokazuje niedzielę?
          </p>
          <div className="flex items-center gap-3">
            <select
              defaultValue={localStorage.getItem('orgSchedSwitchHour') ?? '17'}
              onChange={e => {
                localStorage.setItem('orgSchedSwitchHour', e.target.value);
                window.location.reload();
              }}
              className="rounded-lg border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground"
            >
              {Array.from({ length: 13 }, (_, i) => i + 12).map(h => (
                <option key={h} value={h}>{h}:00</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50">
          <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
            <ClipboardPaste className="w-5 h-5 text-primary" />
            Import grafiku
          </h2>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-muted rounded-lg p-4 text-sm text-muted-foreground">
            <p className="font-bold text-foreground mb-1">Jak zaimportować?</p>
            <p>Zaznacz tabelę w Excelu, Ctrl+C, kliknij poniżej, Ctrl+V</p>
          </div>

          <textarea
            value={paste}
            onChange={e => setPaste(e.target.value)}
            placeholder="Kliknij tutaj i wklej (Ctrl+V)..."
            className="w-full h-48 p-4 rounded-lg border-2 border-dashed border-border bg-muted text-foreground text-sm font-mono resize-y focus:border-primary focus:outline-none transition-colors"
          />

          {preview && preview.entries.length > 0 && (
            <div className="space-y-3">
              <div className="bg-emerald/10 border border-emerald/30 rounded-lg p-4">
                <p className="font-bold text-emerald text-sm">
                  ✓ Rozpoznano {preview.entries.length} mszy
                  {preview.holidays.size > 0 && ` · ${preview.holidays.size} świąt`}
                </p>
              </div>
              <Button
                onClick={handleImport}
                className="w-full bg-emerald text-white hover:bg-emerald/90 font-bold"
              >
                <Download className="w-4 h-4" />
                Importuj grafik ({preview.entries.length} mszy)
              </Button>
            </div>
          )}

          {paste.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setPaste('')}
              className="bg-transparent border-border text-muted-foreground"
            >
              <X className="w-4 h-4" />
              Wyczyść
            </Button>
          )}
        </div>
      </div>

      {/* Help */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50">
          <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber" />
            Pomoc
          </h2>
        </div>
        <div className="p-5 text-sm text-muted-foreground space-y-3 leading-relaxed">
          <p><span className="font-bold text-foreground">Netlify (30 sekund):</span> Wejdź na app.netlify.com/drop, przeciągnij folder dist/, dostajesz link.</p>
          <p><span className="font-bold text-foreground">ChromeOS / Mac / Windows:</span> Otwórz link w Chrome, kliknij 3 kropki → Zainstaluj aplikację.</p>
          <p><span className="font-bold text-foreground">Telefon:</span> Android: Chrome → 3 kropki → Dodaj do ekranu. iPhone: Safari → Udostępnij → Dodaj.</p>
        </div>
      </div>
    </div>
  );
}
