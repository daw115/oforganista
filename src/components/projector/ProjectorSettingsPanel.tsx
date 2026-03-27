import { useState, useEffect, useRef, useCallback } from 'react';
import { Minus, Plus, RotateCcw, Eye, Save, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Star, Trash2, FolderOpen } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import {
  getProjectorSettings,
  saveProjectorSettings,
  saveAsDefaults,
  getResolvedTextColor,
  TEXT_COLOR_MAP,
  type ProjectorSettings,
  type ProjectorTextColor,
} from '@/lib/projectorSettings';
import { useProjectorPresets } from '@/hooks/useProjectorPresets';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const BG_PRESETS = [
  { hex: '#000000', label: 'Czarny' },
  { hex: '#0a0a2e', label: 'Granat' },
  { hex: '#0d1b0e', label: 'Ciemna zieleń' },
  { hex: '#1a1a1a', label: 'Grafitowy' },
  { hex: '#2d1b00', label: 'Brązowy' },
];

function HoldButton({ onTick, children, className }: { onTick: () => void; children: React.ReactNode; className?: string }) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const start = useCallback(() => {
    onTick();
    intervalRef.current = setInterval(onTick, 80);
  }, [onTick]);
  const stop = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);
  useEffect(() => () => stop(), [stop]);
  return (
    <button
      onMouseDown={start} onMouseUp={stop} onMouseLeave={stop}
      onTouchStart={start} onTouchEnd={stop}
      className={className}
    >
      {children}
    </button>
  );
}

function NumericInput({ value, min, max, step, onChange, unit, className }: {
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; unit?: string; className?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = parseFloat(text);
    if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
    else setText(String(value));
  };
  return (
    <div className={`flex items-center gap-0.5 ${className ?? ''}`}>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => e.key === 'Enter' && commit()}
        className="w-14 h-6 text-xs font-mono text-center rounded border border-border bg-muted text-foreground focus:border-primary focus:outline-none"
      />
      {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
    </div>
  );
}

export function ProjectorSettingsPanel() {
  const [settings, setSettings] = useState(getProjectorSettings);
  const [, forceUpdate] = useState(0);
  const { presets, savePreset, updatePreset, setAsDefault, deletePreset, getDefaultPreset } = useProjectorPresets();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [saveAsDefaultFlag, setSaveAsDefaultFlag] = useState(false);
  const defaultLoaded = useRef(false);

  const update = useCallback((patch: Partial<ProjectorSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveProjectorSettings(next);
      return next;
    });
  }, []);

  const resetDefaults = useCallback(() => {
    const defaults: ProjectorSettings = {
      textColor: 'white', customTextColor: '#FFFFFF',
      strokeWidth: 2, rotation: 0, fontSize: 72,
      background: '#000000', shadowIntensity: 9, maxLines: 7,
      offsetX: 0, offsetY: 0, scale: 1,
    };
    setSettings(defaults);
    saveProjectorSettings(defaults);
  }, []);

  const handleSaveDefaults = useCallback(() => {
    saveAsDefaults(settings);
    toast.success('Ustawienia zapisane lokalnie');
  }, [settings]);

  const handleSavePreset = async () => {
    if (!presetName.trim()) return;
    const result = await savePreset(presetName.trim(), settings, saveAsDefaultFlag);
    if (result) {
      toast.success(`Preset „${presetName}" zapisany`);
      setShowSaveDialog(false);
      setPresetName('');
      setSaveAsDefaultFlag(false);
    } else {
      toast.error('Nie udało się zapisać presetu');
    }
  };

  const handleLoadPreset = (preset: typeof presets[0]) => {
    setSettings(preset.settings);
    saveProjectorSettings(preset.settings);
    toast.success(`Wczytano „${preset.name}"`);
  };

  const handleUpdatePreset = async (preset: typeof presets[0]) => {
    await updatePreset(preset.id, settings);
    toast.success(`Preset „${preset.name}" zaktualizowany`);
  };

  // Load default preset from server on first load
  useEffect(() => {
    if (defaultLoaded.current) return;
    const dp = getDefaultPreset();
    if (dp) {
      defaultLoaded.current = true;
      setSettings(dp.settings);
      saveProjectorSettings(dp.settings);
    }
  }, [presets, getDefaultPreset]);

  useEffect(() => {
    const handler = () => {
      setSettings(getProjectorSettings());
      forceUpdate(n => n + 1);
    };
    window.addEventListener('projector-settings-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('projector-settings-changed', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const resolvedTextColor = getResolvedTextColor(settings);
  const btnClass = "p-1.5 rounded-lg border border-border bg-background hover:bg-muted transition-colors";

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">Ustawienia projekcji</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSaveDialog(true)} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
            <Save className="w-3 h-3" /> Zapisz preset
          </button>
          <button onClick={resetDefaults} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>
      </div>

      {/* Server presets */}
      {presets.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            <FolderOpen className="w-3 h-3" /> Presety
          </span>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {presets.map(p => (
              <div key={p.id} className="flex items-center gap-1.5 text-xs">
                <button
                  onClick={() => handleLoadPreset(p)}
                  className={`flex-1 text-left px-2 py-1.5 rounded-lg border transition-colors truncate ${
                    p.is_default
                      ? 'border-primary/30 bg-primary/10 text-primary font-medium'
                      : 'border-border hover:bg-muted text-foreground'
                  }`}
                >
                  {p.is_default && <Star className="w-3 h-3 inline mr-1 fill-primary" />}
                  {p.name}
                </button>
                <button
                  onClick={() => handleUpdatePreset(p)}
                  title="Nadpisz bieżącymi ustawieniami"
                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Save className="w-3 h-3" />
                </button>
                <button
                  onClick={async () => { await setAsDefault(p.id); toast.success(`„${p.name}" ustawiony jako domyślny`); }}
                  title="Ustaw jako domyślny"
                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-primary"
                >
                  <Star className="w-3 h-3" />
                </button>
                <button
                  onClick={async () => { if (confirm(`Usunąć preset „${p.name}"?`)) { await deletePreset(p.id); toast.success('Preset usunięty'); } }}
                  className="p-1 rounded hover:bg-destructive/20 transition-colors text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mini preview */}
      <div
        className="rounded-lg border border-border overflow-hidden h-16 flex items-center justify-center transition-all"
        style={{ background: settings.background }}
      >
        <span style={{
          color: resolvedTextColor,
          fontFamily: "'Arial Black', Arial, sans-serif",
          fontWeight: 900,
          fontSize: `${Math.max(10, settings.fontSize / 5)}px`,
          textShadow: `0 1px ${settings.shadowIntensity}px rgba(0,0,0,${settings.shadowIntensity / 10})`,
          WebkitTextStroke: `${settings.strokeWidth / 4}px rgba(0,0,0,0.7)`,
          transform: `rotate(${settings.rotation}deg) translate(${settings.offsetX / 10}px, ${settings.offsetY / 10}px) scale(${settings.scale})`,
          transition: 'all 0.15s ease',
        }}>
          Podgląd tekstu projekcji
        </span>
      </div>

      {/* Font size */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Rozmiar czcionki</span>
          <NumericInput value={settings.fontSize} min={40} max={120} step={0.5} unit="px" onChange={v => update({ fontSize: v })} />
        </div>
        <div className="flex items-center gap-2">
          <HoldButton onTick={() => update({ fontSize: Math.max(40, settings.fontSize - 0.5) })} className={btnClass}>
            <Minus className="w-3.5 h-3.5 text-muted-foreground" />
          </HoldButton>
          <Slider value={[settings.fontSize]} onValueChange={([v]) => update({ fontSize: v })} min={40} max={120} step={0.5} className="flex-1" />
          <HoldButton onTick={() => update({ fontSize: Math.min(120, settings.fontSize + 0.5) })} className={btnClass}>
            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
          </HoldButton>
        </div>
      </div>

      {/* Scale */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Skalowanie</span>
          <NumericInput value={settings.scale} min={0.5} max={2} step={0.01} onChange={v => update({ scale: v })} />
        </div>
        <div className="flex items-center gap-2">
          <HoldButton onTick={() => update({ scale: Math.max(0.5, Math.round((settings.scale - 0.01) * 100) / 100) })} className={btnClass}>
            <Minus className="w-3.5 h-3.5 text-muted-foreground" />
          </HoldButton>
          <Slider value={[settings.scale]} onValueChange={([v]) => update({ scale: v })} min={0.5} max={2} step={0.01} className="flex-1" />
          <HoldButton onTick={() => update({ scale: Math.min(2, Math.round((settings.scale + 0.01) * 100) / 100) })} className={btnClass}>
            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
          </HoldButton>
        </div>
      </div>

      {/* Position offset — compact d-pad */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Pozycja tekstu</span>
          <div className="flex items-center gap-1">
            <NumericInput value={settings.offsetX} min={-200} max={200} step={1} unit="X" onChange={v => update({ offsetX: v })} />
            <NumericInput value={settings.offsetY} min={-200} max={200} step={1} unit="Y" onChange={v => update({ offsetY: v })} />
          </div>
        </div>
        <div className="flex items-center justify-center gap-1">
          <HoldButton onTick={() => update({ offsetX: Math.max(-200, settings.offsetX - 1) })} className={btnClass}>
            <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground" />
          </HoldButton>
          <div className="flex flex-col gap-1">
            <HoldButton onTick={() => update({ offsetY: Math.max(-200, settings.offsetY - 1) })} className={btnClass}>
              <ArrowUp className="w-3.5 h-3.5 text-muted-foreground" />
            </HoldButton>
            <HoldButton onTick={() => update({ offsetY: Math.min(200, settings.offsetY + 1) })} className={btnClass}>
              <ArrowDown className="w-3.5 h-3.5 text-muted-foreground" />
            </HoldButton>
          </div>
          <HoldButton onTick={() => update({ offsetX: Math.min(200, settings.offsetX + 1) })} className={btnClass}>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
          </HoldButton>
          <button
            onClick={() => update({ offsetX: 0, offsetY: 0 })}
            className="ml-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Wyzeruj
          </button>
        </div>
      </div>

      {/* Background color */}
      <div className="space-y-1.5">
        <span className="text-xs text-muted-foreground">Kolor tła</span>
        <div className="flex gap-2 flex-wrap">
          {BG_PRESETS.map(p => (
            <button
              key={p.hex}
              onClick={() => update({ background: p.hex })}
              className={`w-8 h-8 rounded-lg border-2 transition-all ${settings.background === p.hex ? 'border-primary scale-110' : 'border-border hover:border-muted-foreground/50'}`}
              style={{ background: p.hex }}
              title={p.label}
            />
          ))}
          <label className="w-8 h-8 rounded-lg border-2 border-border cursor-pointer overflow-hidden relative hover:border-muted-foreground/50 transition-all" title="Niestandardowy">
            <input type="color" value={settings.background} onChange={e => update({ background: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
            <div className="w-full h-full bg-gradient-to-br from-destructive via-primary to-success" />
          </label>
        </div>
      </div>

      {/* Text color */}
      <div className="space-y-1.5">
        <span className="text-xs text-muted-foreground">Kolor tekstu</span>
        <div className="flex gap-2 flex-wrap">
          {(Object.entries(TEXT_COLOR_MAP) as [Exclude<ProjectorTextColor, 'custom'>, { hex: string; label: string }][]).map(([key, val]) => (
            <button
              key={key}
              onClick={() => update({ textColor: key })}
              className={`h-8 px-3 rounded-lg border-2 text-xs font-medium transition-all ${settings.textColor === key ? 'border-primary scale-105' : 'border-border hover:border-muted-foreground/50'}`}
              style={{ background: '#111', color: val.hex }}
            >
              {val.label}
            </button>
          ))}
          <label className="h-8 px-3 rounded-lg border-2 border-border flex items-center gap-1.5 cursor-pointer hover:border-muted-foreground/50 transition-all text-xs text-muted-foreground relative">
            <input type="color" value={settings.customTextColor} onChange={e => update({ textColor: 'custom', customTextColor: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
            <div className="w-4 h-4 rounded border border-border" style={{ background: settings.customTextColor }} />
            Własny
          </label>
        </div>
      </div>

      {/* Stroke width */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Grubość obrysu</span>
          <NumericInput value={settings.strokeWidth} min={0} max={5} step={0.5} unit="px" onChange={v => update({ strokeWidth: v })} />
        </div>
        <Slider value={[settings.strokeWidth]} onValueChange={([v]) => update({ strokeWidth: v })} min={0} max={5} step={0.5} />
      </div>

      {/* Shadow intensity */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Intensywność cienia</span>
          <NumericInput value={settings.shadowIntensity} min={0} max={10} step={0.5} onChange={v => update({ shadowIntensity: v })} />
        </div>
        <Slider value={[settings.shadowIntensity]} onValueChange={([v]) => update({ shadowIntensity: v })} min={0} max={10} step={0.5} />
      </div>

      {/* Max lines per slide */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Max linii na slajd</span>
          <NumericInput value={settings.maxLines} min={4} max={14} step={1} onChange={v => update({ maxLines: Math.round(v) })} />
        </div>
        <div className="flex items-center gap-2">
          <HoldButton onTick={() => update({ maxLines: Math.max(4, (settings.maxLines ?? 7) - 1) })} className={btnClass}>
            <Minus className="w-3.5 h-3.5 text-muted-foreground" />
          </HoldButton>
          <Slider value={[settings.maxLines ?? 7]} onValueChange={([v]) => update({ maxLines: v })} min={4} max={14} step={1} className="flex-1" />
          <HoldButton onTick={() => update({ maxLines: Math.min(14, (settings.maxLines ?? 7) + 1) })} className={btnClass}>
            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
          </HoldButton>
        </div>
        <p className="text-[10px] text-muted-foreground/70">Wymaga przebudowy bazy po zmianie</p>
      </div>

      {/* Rotation */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Rotacja</span>
          <NumericInput value={settings.rotation} min={-180} max={180} step={0.5} unit="°" onChange={v => update({ rotation: v })} />
        </div>
        <Slider value={[settings.rotation]} onValueChange={([v]) => update({ rotation: v })} min={-180} max={180} step={0.5} />
      </div>

      {/* Test mode button */}
      <a
        href="/projector-screen?test=true"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
      >
        <Eye className="w-3.5 h-3.5" />
        Otwórz tryb testowy
      </a>

      {/* Save preset dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Zapisz preset</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nazwa presetu *</label>
              <Input
                value={presetName}
                onChange={e => setPresetName(e.target.value)}
                placeholder="np. Kościół główny — duży ekran"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={saveAsDefaultFlag}
                onChange={e => setSaveAsDefaultFlag(e.target.checked)}
                className="rounded border-border"
              />
              Ustaw jako domyślny preset
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>Anuluj</Button>
            <Button onClick={handleSavePreset} disabled={!presetName.trim()}>Zapisz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
