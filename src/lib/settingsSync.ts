/**
 * Offline-first settings sync.
 * Primary: localStorage. Secondary: Supabase (non-blocking, fire-and-forget).
 */
import { supabase } from '@/integrations/supabase/client';

const SETTINGS_PREFIX = 'appSetting_';
const FETCH_TIMEOUT_MS = 3000;

/** Read from localStorage first, then try server with timeout */
export async function fetchSetting<T>(key: string): Promise<T | null> {
  // 1. Always return local first
  const local = getLocalSetting<T>(key);

  // 2. Try server in background (non-blocking for caller)
  try {
    const result = await Promise.race([
      supabase
        .from('app_settings' as any)
        .select('value')
        .eq('key', key)
        .maybeSingle(),
      new Promise<{ data: null; error: { message: string } }>(resolve =>
        setTimeout(() => resolve({ data: null, error: { message: 'timeout' } }), FETCH_TIMEOUT_MS)
      ),
    ]);
    const { data, error } = result;
    if (!error && data) {
      const val = (data as any).value as T;
      // Update local cache
      setLocalSetting(key, val);
      return val;
    }
  } catch {}

  return local;
}

/** Write to localStorage immediately, then fire-and-forget to server */
export async function saveSetting<T>(key: string, value: T): Promise<void> {
  setLocalSetting(key, value);
  // Fire-and-forget server save
  supabase
    .from('app_settings' as any)
    .upsert(
      { key, value: value as any, updated_at: new Date().toISOString() } as any,
      { onConflict: 'key' }
    )
    .select()
    .then(() => {}, () => {});
}

function getLocalSetting<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(SETTINGS_PREFIX + key);
    if (raw) return JSON.parse(raw) as T;
  } catch {}
  return null;
}

function setLocalSetting<T>(key: string, value: T) {
  try {
    localStorage.setItem(SETTINGS_PREFIX + key, JSON.stringify(value));
  } catch {}
}
