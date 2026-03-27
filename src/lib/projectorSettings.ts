import { CHURCH_PRESET } from './projectorLayout';
import { fetchSetting, saveSetting } from './settingsSync';

const SETTINGS_KEY = 'organista_projector_settings';

export type ProjectorTextColor = 'white' | 'yellow' | 'cyan' | 'custom';

export interface ProjectorSettings {
  textColor: ProjectorTextColor;
  customTextColor: string; // hex
  strokeWidth: number; // px, 0-5
  rotation: number; // degrees, -180 to 180
  fontSize: number; // px, 40-120
  background: string; // hex
  shadowIntensity: number; // 0-10
  maxLines: number; // 4-14
  offsetX: number; // px, horizontal offset
  offsetY: number; // px, vertical offset
  scale: number; // 0.5-2.0
}

const DEFAULTS: ProjectorSettings = {
  textColor: 'white',
  customTextColor: '#FFFFFF',
  strokeWidth: 2,
  rotation: 0,
  fontSize: 72,
  background: '#000000',
  shadowIntensity: 9,
  maxLines: 7,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
};

export const TEXT_COLOR_MAP: Record<Exclude<ProjectorTextColor, 'custom'>, { hex: string; label: string; preview: string }> = {
  white:  { hex: '#FFFFFF', label: 'Biały', preview: '#FFFFFF' },
  yellow: { hex: '#FFE040', label: 'Żółty', preview: '#FFE040' },
  cyan:   { hex: '#00FFFF', label: 'Cyjan', preview: '#00FFFF' },
};

export function getResolvedTextColor(s: ProjectorSettings): string {
  if (s.textColor === 'custom') return s.customTextColor;
  return TEXT_COLOR_MAP[s.textColor].hex;
}

export function getProjectorSettings(): ProjectorSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) return { ...DEFAULTS, ...JSON.parse(stored) };
  } catch {}
  return DEFAULTS;
}

export function saveProjectorSettings(settings: ProjectorSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent('projector-settings-changed', { detail: settings }));
  // Sync to server (fire-and-forget)
  saveSetting('projector_settings', settings);
}

/** Restore projector settings from server (call on app start) */
export async function syncProjectorSettingsFromServer(): Promise<boolean> {
  try {
    const server = await fetchSetting<ProjectorSettings>('projector_settings');
    if (server && typeof server === 'object' && server.fontSize) {
      const local = localStorage.getItem(SETTINGS_KEY);
      if (!local) {
        // No local settings — use server
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULTS, ...server }));
        console.log('[ProjectorSettings] Restored from server');
        return true;
      }
    }
  } catch {}
  return false;
}

/** Returns the user's maxLines setting (defaults to 7) */
export function getMaxLinesSetting(): number {
  return getProjectorSettings().maxLines;
}

const SAVED_DEFAULTS_KEY = 'organista_projector_defaults';

/** Save current settings as the new defaults for this device */
export function saveAsDefaults(settings: ProjectorSettings) {
  localStorage.setItem(SAVED_DEFAULTS_KEY, JSON.stringify(settings));
}

/** Load saved defaults (if any), falling back to factory defaults */
export function getSavedDefaults(): ProjectorSettings {
  try {
    const stored = localStorage.getItem(SAVED_DEFAULTS_KEY);
    if (stored) return { ...DEFAULTS, ...JSON.parse(stored) };
  } catch {}
  return DEFAULTS;
}

/** Returns CHURCH_PRESET with user's maxLines applied, preset name encodes maxLines for rebuild detection */
export function getActivePreset() {
  const s = getProjectorSettings();
  return { ...CHURCH_PRESET, maxLines: s.maxLines, name: `${CHURCH_PRESET.name}_ml${s.maxLines}` };
}
