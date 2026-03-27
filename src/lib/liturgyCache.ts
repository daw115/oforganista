import { supabase } from '@/integrations/supabase/client';
import { toYMD, addDays } from './dateUtils';
import {
  fetchSongs, SongsData,
  fetchReadings, ReadingsData,
  fetchCalendar, CalendarData,
} from './liturgyParsers';

type Tab = 'songs' | 'readings' | 'calendar';
type TabData = SongsData | ReadingsData | CalendarData;

/** How old (in minutes) cached data can be before we revalidate in background */
const STALE_AFTER_MINUTES = 60;

/** Read cached liturgy data from DB */
export async function getCachedLiturgy(date: Date, tab: Tab): Promise<{ data: TabData | null; updatedAt: string | null }> {
  // 1. Try localStorage first (instant)
  const localKey = `litCache_${toYMD(date)}_${tab}`;
  try {
    const local = localStorage.getItem(localKey);
    if (local) {
      const parsed = JSON.parse(local);
      return { data: parsed.data, updatedAt: parsed.updatedAt };
    }
  } catch {}

  // 2. Try Supabase with timeout
  const { data, error } = await supabase
    .from('liturgy_cache')
    .select('data, updated_at')
    .eq('lit_date', toYMD(date))
    .eq('tab', tab)
    .maybeSingle();

  if (error || !data) return { data: null, updatedAt: null };
  const result = { data: data.data as unknown as TabData, updatedAt: data.updated_at };
  // Cache locally
  try { localStorage.setItem(localKey, JSON.stringify(result)); } catch {}
  return result;
}

/** Fetch fresh data from the web */
export async function fetchFreshData(date: Date, tab: Tab): Promise<TabData> {
  if (tab === 'songs') return fetchSongs(date);
  if (tab === 'readings') return fetchReadings(date);
  return fetchCalendar(date);
}

/** Save data to DB cache */
async function saveToCache(date: Date, tab: Tab, data: TabData): Promise<void> {
  // Always save to localStorage first
  const localKey = `litCache_${toYMD(date)}_${tab}`;
  try { localStorage.setItem(localKey, JSON.stringify({ data, updatedAt: new Date().toISOString() })); } catch {}

  // Fire-and-forget to Supabase
  const { error } = await supabase
    .from('liturgy_cache')
    .upsert(
      {
        lit_date: toYMD(date),
        tab,
        data: data as any,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'lit_date,tab' }
    )
    .select();

  if (error) {
    console.error(`[LiturgyCache] Błąd zapisu ${tab} na ${toYMD(date)}:`, error.message);
  } else {
    console.log(`[LiturgyCache] Zapisano ${tab} na ${toYMD(date)}`);
  }
}

/** Fetch fresh data from web and save to DB cache */
export async function refreshLiturgyCache(date: Date, tab: Tab): Promise<TabData> {
  const freshData = await fetchFreshData(date, tab);
  await saveToCache(date, tab, freshData);
  return freshData;
}

/** Fetch fresh from web and save to cache (fire-and-forget save) */
export async function fetchFreshAndCache(date: Date, tab: Tab): Promise<TabData> {
  const freshData = await fetchFreshData(date, tab);
  // Save to cache in background — don't block on Supabase
  saveToCache(date, tab, freshData).catch(() => {});
  return freshData;
}

/** Check if cached data is stale */
function isStale(updatedAt: string | null): boolean {
  if (!updatedAt) return true;
  const age = Date.now() - new Date(updatedAt).getTime();
  return age > STALE_AFTER_MINUTES * 60 * 1000;
}

/** 
 * Load from cache first, fetch from web if not cached.
 * Returns cached data immediately. If stale, triggers background revalidation
 * and calls onRevalidated when fresh data is ready and different.
 */
export async function loadLiturgy(
  date: Date,
  tab: Tab,
  onRevalidated?: (data: TabData, updatedAt: string) => void,
): Promise<{ data: TabData; fromCache: boolean; updatedAt: string | null }> {
  const cached = await getCachedLiturgy(date, tab);

  if (cached.data) {
    // Return cached data immediately
    const result = { data: cached.data, fromCache: true, updatedAt: cached.updatedAt };

    // If stale, revalidate in background
    if (isStale(cached.updatedAt) && onRevalidated) {
      revalidateInBackground(date, tab, cached.data, onRevalidated);
    }

    return result;
  }

  // No cache — fetch fresh
  const freshData = await refreshLiturgyCache(date, tab);
  return { data: freshData, fromCache: false, updatedAt: new Date().toISOString() };
}

const TABS: Tab[] = ['songs', 'readings', 'calendar'];

/**
 * Prefetch liturgy data for the next N days (all 3 tabs).
 * Calls onProgress after each tab finishes: (completed, total).
 * Skips dates/tabs that already have fresh cache.
 */
export async function prefetchLiturgyRange(
  days: number = 7,
  onProgress?: (completed: number, total: number) => void,
): Promise<number> {
  const today = new Date();
  const total = days * TABS.length;
  let completed = 0;
  let fetched = 0;

  for (let d = 0; d < days; d++) {
    const date = addDays(today, d);
    for (const tab of TABS) {
      try {
        const cached = await getCachedLiturgy(date, tab);
        if (cached.data && !isStale(cached.updatedAt)) {
          // Fresh cache exists, skip
        } else {
          await refreshLiturgyCache(date, tab);
          fetched++;
        }
      } catch (err) {
        console.warn(`[LiturgyCache] Prefetch failed for ${tab} ${toYMD(date)}:`, err);
      }
      completed++;
      onProgress?.(completed, total);
    }
  }
  return fetched;
}

/** Background revalidation — fetch fresh, compare, update if changed */
function revalidateInBackground(
  date: Date,
  tab: Tab,
  cachedData: TabData,
  onRevalidated: (data: TabData, updatedAt: string) => void,
) {
  fetchFreshData(date, tab)
    .then((freshData) => {
      // Simple deep comparison via JSON
      const cachedJson = JSON.stringify(cachedData);
      const freshJson = JSON.stringify(freshData);

      if (cachedJson !== freshJson) {
        console.log(`[LiturgyCache] ${tab} for ${toYMD(date)} — data changed, updating cache`);
        const now = new Date().toISOString();
        saveToCache(date, tab, freshData);
        onRevalidated(freshData, now);
      } else {
        console.log(`[LiturgyCache] ${tab} for ${toYMD(date)} — cache is up to date`);
        // Touch the timestamp so we don't re-check immediately
        supabase
          .from('liturgy_cache')
          .update({ updated_at: new Date().toISOString() })
          .eq('lit_date', toYMD(date))
          .eq('tab', tab)
          .select()
          .then(() => {});
      }
    })
    .catch((err) => {
      console.warn(`[LiturgyCache] Background revalidation failed for ${tab}:`, err);
    });
}
